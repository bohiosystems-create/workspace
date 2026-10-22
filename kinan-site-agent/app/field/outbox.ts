/**
 * The field app's outbox: plants, tunnels and airside areas often have no signal. Every change made on the phone —
 * a job started, a checklist tick, a note, a photo, a fault report — is kept here (IndexedDB, so photos fit) until it
 * reaches the server, and sent again when signal returns. Each change carries its own id (cid): the server records a
 * change sent twice only once, so a retry after a timeout is safe. The last copy of the person's day is kept too, so
 * the app opens with no signal.
 */
export type OutItem = {
  cid: string; at: string; label: string;
  /** a change to the operations data (POST /api/fm) */
  body: Record<string, unknown>;
  /** a photo to upload first; its document id is then added to body.evidence */
  photo?: { blob: Blob; name: string; title: string; tags: string; author: string; docId?: string };
  tries?: number;
};

const DB = "kinan-field", STORE = "outbox";
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "cid" });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => { const q = f(db.transaction(STORE, mode).objectStore(STORE)); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}
export const newCid = () => (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);
export const enqueue = (it: OutItem) => tx("readwrite", (s) => s.put(it)).then(() => undefined);
export const pending = (): Promise<OutItem[]> => tx<OutItem[]>("readonly", (s) => s.getAll() as IDBRequest<OutItem[]>).then((xs) => xs.sort((a, b) => a.at.localeCompare(b.at))).catch(() => []);
const remove = (cid: string) => tx("readwrite", (s) => s.delete(cid)).then(() => undefined);

/** The server answered with a refusal (not a lost connection): the change is dropped and the person told why. */
class Refused extends Error {}

async function sendOne(it: OutItem): Promise<void> {
  if (it.photo && !it.photo.docId) {
    const fd = new FormData();
    fd.append("file", it.photo.blob, it.photo.name); fd.append("locationId", "site"); fd.append("title", it.photo.title); fd.append("tags", it.photo.tags); fd.append("author", it.photo.author);
    const r = await fetch("/api/upload", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    if (r.status >= 400 && r.status < 500) throw new Refused(j.error ?? "The photo was refused.");
    if (!r.ok || !j.doc?.id) throw new Error("upload failed");
    it.photo.docId = j.doc.id;
    await enqueue(it); // the upload is done: a retry only sends the change
  }
  const body = it.photo?.docId ? { ...it.body, evidence: [it.photo.docId] } : it.body;
  const r = await fetch("/api/fm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, cid: it.cid }) });
  const j = await r.json().catch(() => ({}));
  if (r.status >= 400 && r.status < 500) throw new Refused(j.error ?? "Refused.");
  if (!r.ok || j.error) throw new Error(j.error ?? "server error");
}

let flushing: Promise<{ sent: number; refused: { label: string; error: string }[] }> | null = null;
/** Send everything waiting, oldest first; stops at the first lost connection (the rest keep their order). */
export function flush() {
  return (flushing ??= (async () => {
    const out = { sent: 0, refused: [] as { label: string; error: string }[] };
    try {
      for (const it of await pending()) {
        try { await sendOne(it); await remove(it.cid); out.sent++; }
        catch (e) {
          if (e instanceof Refused) { await remove(it.cid); out.refused.push({ label: it.label, error: e.message }); continue; }
          await enqueue({ ...it, tries: (it.tries ?? 0) + 1 });
          break;
        }
      }
    } finally { flushing = null; }
    return out;
  })());
}

/** True when the request failed for lack of a connection (not because the server said no). */
export const isOffline = (e: unknown) => !navigator.onLine || e instanceof TypeError;

// the last copy of a person's day, for opening with no signal
const dayKey = (tech: string) => `kinan.field.day.${tech}`;
export function saveDay(tech: string, day: unknown) { try { localStorage.setItem(dayKey(tech), JSON.stringify({ at: new Date().toISOString(), day })); } catch { /* storage full or off */ } }
export function loadDay<T>(tech: string): { at: string; day: T } | null { try { const s = localStorage.getItem(dayKey(tech)); return s ? JSON.parse(s) : null; } catch { return null; } }
