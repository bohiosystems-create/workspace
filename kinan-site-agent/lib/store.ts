import crypto from "node:crypto";
import type { Db, Doc } from "./types";
import { seedDb } from "./seed";
import type { Repo } from "./core/tools";
import { attachProcurement } from "./integrations/procurement";
import { ConflictError, dec, enc, store } from "./storage";
import { merge3 } from "./merge";

const DB_KEY = "db.json";

/** A loaded copy of the database plus what we need to save it safely. */
interface Loaded { repo: Repo; etag: string; base: string }
const g = globalThis as unknown as { __kinan?: Loaded; __kinanSaving?: Promise<unknown> };

function migrate(db: Db): boolean {
  if (db.data) return false;
  // v1 database (before the project dataset): add data + design documents, keep user content.
  const seed = seedDb();
  db.data = seed.data;
  const have = new Set(db.docs.map((d) => d.id));
  for (const d of seed.docs) if (!have.has(d.id)) db.docs.push(d);
  return true;
}

function makeRepo(db: Db, etag: string, base: string): Loaded {
  const L: Loaded = { etag, base, repo: { db, save: async () => undefined, loadFile: (d) => readUpload(d) } };
  L.repo.save = () => saveLoaded(L);
  attachProcurement(L.repo);
  return L;
}

/** Save with optimistic concurrency: if another instance saved first, 3-way merge and retry. */
async function saveLoaded(L: Loaded): Promise<void> {
  const run = async () => {
    const st = store();
    for (let attempt = 0; attempt < 4; attempt++) {
      const json = JSON.stringify(L.repo.db);
      try {
        const { etag } = await st.write(DB_KEY, enc(json), "application/json", L.etag || null);
        L.etag = etag; L.base = json;
        g.__kinan = L;
        return;
      } catch (e) {
        if (!(e instanceof ConflictError)) throw e;
        const latest = await st.read(DB_KEY);
        if (!latest || latest === "unchanged") { L.etag = ""; continue; }
        const theirs = JSON.parse(dec(latest.bytes)) as Db;
        const merged = merge3(JSON.parse(L.base), L.repo.db, theirs) as Db;
        Object.assign(L.repo.db, merged);
        L.base = dec(latest.bytes);
        L.etag = latest.etag;
      }
    }
    throw new Error("Could not save — the database is being changed by many requests at once. Try again.");
  };
  // Serialise saves within this instance.
  const p = (g.__kinanSaving ?? Promise.resolve()).then(run, run);
  g.__kinanSaving = p.catch(() => undefined);
  return p;
}

/** Latest database. Cheap when unchanged (conditional read by ETag). */
export async function getRepo(): Promise<Repo> {
  const st = store();
  const cur = g.__kinan;
  const r = await st.read(DB_KEY, cur?.etag);
  if (r === "unchanged" && cur) return cur.repo;
  if (r && r !== "unchanged") {
    const text = dec(r.bytes);
    try {
      const db = JSON.parse(text) as Db;
      const L = makeRepo(db, r.etag, text);
      g.__kinan = L;
      if (migrate(db)) await L.repo.save();
      return L.repo;
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e;
      await st.write(`db.corrupt-${Date.now()}.json`, r.bytes, "application/json");
    }
  }
  // First run: seed. Create-only write, so two instances can't both seed.
  const db = seedDb();
  const json = JSON.stringify(db);
  try {
    const { etag } = await st.write(DB_KEY, enc(json), "application/json", null);
    g.__kinan = makeRepo(db, etag, json);
    return g.__kinan.repo;
  } catch (e) {
    if (e instanceof ConflictError) return getRepo();
    throw e;
  }
}

export const newId = (p: string) => `${p}_${crypto.randomBytes(5).toString("hex")}`;
export const storageKind = () => store().kind;

const uploadKey = (d: Pick<Doc, "id"> & { fileKey?: string }) => d.fileKey ?? `uploads/${d.id}`;
export async function saveUpload(id: string, bytes: Uint8Array, mime: string) {
  await store().write(`uploads/${id}`, bytes, mime);
}
/** Signed direct-download URL for large stored files (Vercel Blob), or null. */
export async function signedUploadUrl(d: Pick<Doc, "id"> & { fileKey?: string }, ttlMs = 15 * 60_000): Promise<string | null> {
  const st = store();
  return st.signedUrl ? st.signedUrl(uploadKey(d), ttlMs) : null;
}
export async function readUpload(d: Pick<Doc, "id"> & { fileKey?: string }): Promise<Uint8Array | null> {
  const r = await store().read(uploadKey(d));
  return r && r !== "unchanged" ? r.bytes : null;
}

/** Small JSON documents (e.g. WhatsApp sessions). */
export async function readJson<T>(key: string): Promise<{ value: T; etag: string } | null> {
  const r = await store().read(key);
  return r && r !== "unchanged" ? { value: JSON.parse(dec(r.bytes)) as T, etag: r.etag } : null;
}
export async function writeJson(key: string, value: unknown) {
  await store().write(key, enc(JSON.stringify(value)), "application/json");
}
export async function readBytes(key: string) { const r = await store().read(key); return r && r !== "unchanged" ? r.bytes : null; }
export async function writeBytes(key: string, bytes: Uint8Array, mime: string) { await store().write(key, bytes, mime); }
export async function removeKey(key: string) { await store().remove(key); }
