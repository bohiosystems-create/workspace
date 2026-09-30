import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Db, Doc, Location, Note } from "./types";
import { seedDb } from "./seed";

const DATA_DIR = process.env.KINAN_DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

const g = globalThis as unknown as { __kinanDb?: Db };

function load(): Db {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DB_FILE, "utf8")) as Db;
    } catch {
      fs.copyFileSync(DB_FILE, DB_FILE + ".corrupt-" + Date.now());
    }
  }
  const db = seedDb();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  return db;
}

export function db(): Db {
  if (!g.__kinanDb) g.__kinanDb = load();
  return g.__kinanDb;
}

function persist() {
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db(), null, 2));
  fs.renameSync(tmp, DB_FILE);
}

export const newId = (p: string) => `${p}_${crypto.randomBytes(5).toString("hex")}`;

export function addDoc(d: Doc, bytes?: Buffer) {
  if (bytes) fs.writeFileSync(path.join(UPLOAD_DIR, d.id), bytes);
  db().docs.unshift(d);
  persist();
  return d;
}
export function addNote(n: Omit<Note, "id" | "createdAt" | "status"> & { status?: Note["status"] }): Note {
  const note: Note = { id: newId("n"), createdAt: new Date().toISOString(), status: "open", ...n };
  db().notes.unshift(note);
  persist();
  return note;
}
export function updateNote(id: string, patch: Partial<Note>): Note | undefined {
  const n = db().notes.find((x) => x.id === id);
  if (!n) return undefined;
  Object.assign(n, patch, { id: n.id });
  persist();
  return n;
}
export function addLocation(l: Location) {
  db().locations.push(l);
  persist();
  return l;
}
export function moveDoc(id: string, patch: Partial<Doc>) {
  const d = db().docs.find((x) => x.id === id);
  if (!d) return undefined;
  Object.assign(d, patch, { id: d.id });
  persist();
  return d;
}
export function readUpload(id: string): Buffer | null {
  const p = path.join(UPLOAD_DIR, path.basename(id));
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
}

// ---------- lookups shared by the API and the agent ----------
export function locationById(id: string) { return db().locations.find((l) => l.id === id); }

export function locationPath(id: string): string {
  const out: string[] = [];
  let cur = locationById(id);
  while (cur) { out.unshift(cur.name); cur = cur.parentId ? locationById(cur.parentId) : undefined; }
  return out.join(" › ");
}

/** Resolve free text ("tower a level 12", "tc1", "gate 2") to a location. */
export function resolveLocation(q: string): Location | undefined {
  const s = q.trim().toLowerCase();
  if (!s) return undefined;
  const all = db().locations;
  const byId = all.find((l) => l.id.toLowerCase() === s);
  if (byId) return byId;
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const nq = norm(s);
  // "tower a level 12" / "tower a l12" / "tower a floor 12"
  const lv = nq.match(/^(.*?)\s*(?:level|lvl|floor|l)\s*(\d{1,2})$/);
  if (lv) {
    const parent = resolveLocation(lv[1]);
    if (parent) { const hit = all.find((l) => l.id === `${parent.id}-l${lv[2]}`); if (hit) return hit; }
  }
  const bm = nq.match(/^(.*?)\s*(?:basement|b)\s*([123])$/);
  if (bm) {
    const parent = resolveLocation(bm[1]);
    if (parent) { const hit = all.find((l) => l.id === `${parent.id}-b${bm[2]}`); if (hit) return hit; }
  }
  const exact = all.find((l) => norm(l.name) === nq || (l.aliases ?? []).some((a) => norm(a) === nq));
  if (exact) return exact;
  // Token match: every word of the query appears as a word of the name/aliases
  // ("laydown 2" -> "Laydown Area 2 — Formwork", "crane 1" -> TC1).
  const toks = nq.split(" ").filter((t) => t && !["the", "at", "in", "on", "of"].includes(t));
  if (toks.length) {
    const tokHit = all
      .filter((l) => l.type !== "level")
      .filter((l) => [l.name, ...(l.aliases ?? [])].some((n) => { const w = norm(n).split(" "); return toks.every((t) => w.includes(t)); }))
      .sort((a, b) => a.name.length - b.name.length)[0];
    if (tokHit) return tokHit;
  }
  // Prefer top-level (non-level) matches, shortest name first.
  const cands = all
    .filter((l) => norm(l.name).includes(nq) || (l.aliases ?? []).some((a) => norm(a).includes(nq)) || nq.includes(norm(l.name)))
    .sort((a, b) => Number(a.type === "level") - Number(b.type === "level") || a.name.length - b.name.length);
  return cands[0];
}

/** Location ids that are `id` or descend from it. */
export function descendantIds(id: string): Set<string> {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const l of db().locations) if (l.parentId && ids.has(l.parentId) && !ids.has(l.id)) { ids.add(l.id); grew = true; }
  }
  return ids;
}

export function searchDocs(o: { query?: string; category?: string; locationId?: string; discipline?: string; limit?: number }): Doc[] {
  const ids = o.locationId ? descendantIds(o.locationId) : null;
  const terms = (o.query ?? "").toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  const scored = db().docs
    .filter((d) => (!ids || ids.has(d.locationId)) &&
      (!o.category || d.category.toLowerCase() === o.category.toLowerCase()) &&
      (!o.discipline || (d.discipline ?? "").toLowerCase() === o.discipline.toLowerCase()))
    .map((d) => {
      const hay = `${d.title} ${d.category} ${d.discipline ?? ""} ${d.tags.join(" ")} ${d.summary} ${d.text} ${locationPath(d.locationId)}`.toLowerCase();
      const titleHay = `${d.title} ${d.tags.join(" ")}`.toLowerCase();
      const score = terms.length ? terms.reduce((a, t) => a + (hay.includes(t) ? 1 : 0) + (titleHay.includes(t) ? 2 : 0), 0) : 1;
      return { d, score };
    })
    .filter((x) => !terms.length || x.score > 0)
    .sort((a, b) => b.score - a.score || b.d.uploadedAt.localeCompare(a.d.uploadedAt));
  return scored.slice(0, o.limit ?? 12).map((x) => x.d);
}
