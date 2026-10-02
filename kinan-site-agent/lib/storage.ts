import fs from "node:fs";
import path from "node:path";

/**
 * Object storage behind the app. Three backends:
 *   fs    — a folder on disk (local dev, Docker, VM). Default.
 *   blob  — Vercel Blob, private access (set BLOB_READ_WRITE_TOKEN; added automatically
 *           when you connect a Blob store to the Vercel project).
 *   tmp   — /tmp on Vercel when no Blob store is connected. Works, but data is lost
 *           whenever the function instance is recycled — demo only.
 * Reads return an ETag so callers can skip downloading unchanged objects; writes
 * accept ifMatch so concurrent serverless instances can't silently overwrite each other.
 */
export class ConflictError extends Error {}

export interface Store {
  kind: "fs" | "blob" | "tmp";
  read(key: string, ifNoneMatch?: string): Promise<{ bytes: Uint8Array; etag: string } | "unchanged" | null>;
  write(key: string, bytes: Uint8Array, mime: string, ifMatch?: string | null): Promise<{ etag: string }>;
  remove(key: string): Promise<void>;
  /** Short-lived direct download URL (Blob only) — for files too big to stream through a function. */
  signedUrl?(key: string, ttlMs: number): Promise<string | null>;
}

// ---------------------------------------------------------------- filesystem
function fsStore(dir: string, kind: "fs" | "tmp"): Store {
  const file = (key: string) => {
    const p = path.resolve(dir, key);
    if (!p.startsWith(path.resolve(dir) + path.sep)) throw new Error("invalid key");
    return p;
  };
  const etagOf = (p: string) => { const s = fs.statSync(p); return `${s.mtimeMs}-${s.size}`; };
  return {
    kind,
    async read(key, ifNoneMatch) {
      const p = file(key);
      if (!fs.existsSync(p)) return null;
      const etag = etagOf(p);
      if (ifNoneMatch && ifNoneMatch === etag) return "unchanged";
      return { bytes: new Uint8Array(fs.readFileSync(p)), etag };
    },
    async write(key, bytes, _mime, ifMatch) {
      const p = file(key);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      if (ifMatch !== undefined) {
        const exists = fs.existsSync(p);
        if (ifMatch === null ? exists : !exists || etagOf(p) !== ifMatch) throw new ConflictError(key);
      }
      const tmp = `${p}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, bytes);
      fs.renameSync(tmp, p);
      return { etag: etagOf(p) };
    },
    async remove(key) { fs.rmSync(file(key), { force: true }); },
  };
}

// ---------------------------------------------------------------- Vercel Blob
function blobStore(prefix: string): Store {
  const name = (key: string) => `${prefix}${key}`;
  const sdk = () => import("@vercel/blob");
  return {
    kind: "blob",
    async read(key, ifNoneMatch) {
      const { get } = await sdk();
      const r = await get(name(key), { access: "private", useCache: false, ifNoneMatch });
      if (!r) return null;
      if (r.statusCode === 304) return "unchanged";
      const bytes = new Uint8Array(await new Response(r.stream).arrayBuffer());
      return { bytes, etag: r.blob.etag };
    },
    async write(key, bytes, mime, ifMatch) {
      const { put, BlobPreconditionFailedError } = await sdk();
      try {
        const r = await put(name(key), Buffer.from(bytes), {
          access: "private", contentType: mime, addRandomSuffix: false,
          allowOverwrite: ifMatch !== null,
          ...(ifMatch ? { ifMatch } : {}),
        });
        return { etag: r.etag };
      } catch (e) {
        // ifMatch mismatch → precondition failed; create-only on existing blob → "already exists".
        if (e instanceof BlobPreconditionFailedError || /already exists|precondition/i.test(String((e as Error).message))) throw new ConflictError(key);
        throw e;
      }
    },
    async remove(key) {
      const { del } = await sdk();
      await del(name(key)).catch(() => undefined);
    },
    async signedUrl(key, ttlMs) {
      try {
        const { issueSignedToken, presignUrl } = await sdk();
        const validUntil = Date.now() + ttlMs;
        const tok = await issueSignedToken({ pathname: name(key), operations: ["get"], validUntil });
        const r = await presignUrl(tok, { access: "private", operation: "get", pathname: name(key), validUntil });
        return r.presignedUrl;
      } catch (e) {
        console.warn("[storage] presign failed — falling back to streaming:", e instanceof Error ? e.message : e);
        return null;
      }
    },
  };
}

const g = globalThis as unknown as { __kinanStore?: Store };
export function store(): Store {
  if (!g.__kinanStore) {
    if (process.env.BLOB_READ_WRITE_TOKEN) g.__kinanStore = blobStore((process.env.BLOB_PREFIX ?? "kinan/").replace(/^\/+/, ""));
    else if (process.env.VERCEL && !process.env.KINAN_DATA_DIR) g.__kinanStore = fsStore("/tmp/kinan-data", "tmp");
    else g.__kinanStore = fsStore(process.env.KINAN_DATA_DIR || path.join(process.cwd(), "data"), "fs");
  }
  return g.__kinanStore;
}

export const enc = (s: string) => new TextEncoder().encode(s);
export const dec = (b: Uint8Array) => new TextDecoder().decode(b);
