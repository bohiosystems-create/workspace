/**
 * Projects generated from uploaded documents, kept on the server too so the daily report (which runs with nobody
 * signed in) covers them. The browser keeps its own copy (lib/model3d/store.ts) and syncs it here; deletions are
 * remembered so another device can't bring a deleted project back.
 */
import type { GenProject } from "./model3d/store";
import { readJson, writeJson } from "./store";

const KEY = "projects/generated.json";
export interface Generated { projects: GenProject[]; deleted: string[] }

export async function readGenerated(): Promise<Generated> {
  const r = await readJson<Generated>(KEY);
  return { projects: r?.value.projects ?? [], deleted: r?.value.deleted ?? [] };
}

/** Merge a device's list into the server's: union by id, minus anything deleted anywhere. */
export async function syncGenerated(list: GenProject[], deleted: string[]): Promise<Generated> {
  const cur = await readGenerated();
  const gone = new Set([...cur.deleted, ...deleted].slice(-500));
  const byId = new Map<string, GenProject>();
  for (const p of [...cur.projects, ...list]) if (p?.id && p.result?.spec?.buildings && !gone.has(p.id)) byId.set(p.id, p);
  const out = { projects: [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50), deleted: [...gone] };
  await writeJson(KEY, out);
  return out;
}
