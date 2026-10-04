/**
 * Turn whatever the user drops or picks — individual files, a whole folder (with sub-folders), or .zip archives
 * (also zips inside folders, and zips inside zips) — into a flat list of project documents the engines can read.
 * Junk (__MACOSX, .DS_Store, hidden files) and unsupported types are skipped and reported.
 */
import { unzipSync } from "fflate";

export const SUPPORTED = /\.(csv|tsv|txt|md|json|xml|xer|pdf|png|jpe?g|webp)$/i;
const MIME: Record<string, string> = { csv: "text/csv", tsv: "text/tab-separated-values", txt: "text/plain", md: "text/markdown", json: "application/json", xml: "application/xml", xer: "text/plain", pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
export const mimeOf = (name: string) => MIME[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
const base = (p: string) => p.split(/[\\/]/).pop() ?? p;
const junk = (p: string) => /(^|[\\/])__MACOSX([\\/]|$)/.test(p) || base(p).startsWith(".") || /^(thumbs\.db|desktop\.ini)$/i.test(base(p));

export interface Collected { files: File[]; skipped: string[]; fromZip: number; fromFolder: number }

async function expand(f: File, path: string, out: Collected, depth = 0): Promise<void> {
  if (junk(path)) return;
  if (/\.zip$/i.test(f.name)) {
    if (depth > 2) { out.skipped.push(path); return; }
    let entries: Record<string, Uint8Array>;
    try { entries = unzipSync(new Uint8Array(await f.arrayBuffer())); } catch { out.skipped.push(`${path} (not a readable zip)`); return; }
    for (const [name, data] of Object.entries(entries)) {
      if (name.endsWith("/") || junk(name)) continue;
      const inner = new File([data as BlobPart], base(name), { type: mimeOf(name) });
      const before = out.files.length;
      await expand(inner, `${path}/${name}`, out, depth + 1);
      out.fromZip += out.files.length - before;
    }
    return;
  }
  if (!SUPPORTED.test(f.name)) { out.skipped.push(path); return; }
  out.files.push(f.type ? f : new File([f], f.name, { type: mimeOf(f.name) }));
}

/** From an <input type=file> (multiple, or webkitdirectory for a folder). */
export async function collectFromList(list: FileList | File[]): Promise<Collected> {
  const out: Collected = { files: [], skipped: [], fromZip: 0, fromFolder: 0 };
  for (const f of Array.from(list)) {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    const before = out.files.length;
    await expand(f, rel, out);
    if (rel.includes("/") && !/\.zip$/i.test(f.name)) out.fromFolder += out.files.length - before;
  }
  return out;
}

// drag and drop: walk dropped folders with the File System Entry API
type Entry = { isFile: boolean; isDirectory: boolean; name: string; fullPath: string; file?: (ok: (f: File) => void, err: (e: unknown) => void) => void; createReader?: () => { readEntries: (ok: (e: Entry[]) => void, err: (e: unknown) => void) => void } };
const fileOf = (e: Entry) => new Promise<File>((ok, err) => e.file!(ok, err));
async function readAll(dir: Entry): Promise<Entry[]> {
  const r = dir.createReader!(), all: Entry[] = [];
  for (;;) { const batch = await new Promise<Entry[]>((ok, err) => r.readEntries(ok, err)); if (!batch.length) return all; all.push(...batch); }
}
export async function collectFromDrop(dt: DataTransfer): Promise<Collected> {
  const entries = Array.from(dt.items ?? []).map((i) => (i.kind === "file" ? (i as DataTransferItem & { webkitGetAsEntry?: () => Entry | null }).webkitGetAsEntry?.() : null)).filter(Boolean) as Entry[];
  if (!entries.length) return collectFromList(dt.files);
  const out: Collected = { files: [], skipped: [], fromZip: 0, fromFolder: 0 };
  const walk = async (e: Entry, inFolder: boolean): Promise<void> => {
    if (junk(e.fullPath || e.name)) return;
    if (e.isDirectory) { for (const c of await readAll(e)) await walk(c, true); return; }
    const before = out.files.length;
    await expand(await fileOf(e), (e.fullPath || e.name).replace(/^\//, ""), out);
    if (inFolder && !/\.zip$/i.test(e.name)) out.fromFolder += out.files.length - before;
  };
  for (const e of entries) await walk(e, false);
  return out;
}
