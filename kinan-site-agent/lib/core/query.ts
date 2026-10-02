import type { Db, Doc, Location } from "../types";

/** Pure lookups over a Db — shared by the server, the browser build and the agent. */
export const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

export function locationById(db: Db, id: string): Location | undefined {
  return db.locations.find((l) => l.id === id);
}

export function locationPath(db: Db, id: string): string {
  const out: string[] = [];
  let cur = locationById(db, id);
  while (cur) { out.unshift(cur.name); cur = cur.parentId ? locationById(db, cur.parentId) : undefined; }
  return out.join(" › ") || id;
}

export function rootLocation(db: Db, id: string): Location | undefined {
  let cur = locationById(db, id);
  while (cur?.parentId) { const p = locationById(db, cur.parentId); if (!p) break; cur = p; }
  return cur;
}

/** Location ids that are `id` or descend from it. */
export function descendantIds(db: Db, id: string): Set<string> {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const l of db.locations) if (l.parentId && ids.has(l.parentId) && !ids.has(l.id)) { ids.add(l.id); grew = true; }
  }
  return ids;
}

/** Resolve free text ("tower a level 12", "tc1", "laydown 2") to a location. */
export function resolveLocation(db: Db, q: string): Location | undefined {
  const s = String(q ?? "").trim().toLowerCase();
  if (!s) return undefined;
  const all = db.locations;
  const byId = all.find((l) => l.id.toLowerCase() === s);
  if (byId) return byId;
  const nq = norm(s);
  const lv = nq.match(/^(.*?)\s*(?:level|lvl|floor|l)\s*(\d{1,2})$/);
  if (lv) {
    const parent = resolveLocation(db, lv[1]);
    if (parent) { const hit = all.find((l) => l.id === `${parent.id}-l${lv[2]}`); if (hit) return hit; }
  }
  const bm = nq.match(/^(.*?)\s*(?:basement|b)\s*([123])$/);
  if (bm) {
    const parent = resolveLocation(db, bm[1]);
    if (parent) { const hit = all.find((l) => l.id === `${parent.id}-b${bm[2]}`); if (hit) return hit; }
  }
  const rf = nq.match(/^(.*?)\s*(roof|ground|ground floor|ground level)$/);
  if (rf) {
    const parent = resolveLocation(db, rf[1]);
    if (parent) { const hit = all.find((l) => l.id === `${parent.id}-${rf[2] === "roof" ? "roof" : "g"}`); if (hit) return hit; }
  }
  const exact = all.find((l) => norm(l.name) === nq || (l.aliases ?? []).some((a) => norm(a) === nq));
  if (exact) return exact;
  const toks = nq.split(" ").filter((t) => t && !["the", "at", "in", "on", "of"].includes(t));
  if (toks.length) {
    const tokHit = all
      .filter((l) => l.type !== "level")
      .filter((l) => [l.name, ...(l.aliases ?? [])].some((n) => { const w = norm(n).split(" "); return toks.every((t) => w.includes(t)); }))
      .sort((a, b) => a.name.length - b.name.length)[0];
    if (tokHit) return tokHit;
  }
  return all
    .filter((l) => norm(l.name).includes(nq) || (l.aliases ?? []).some((a) => norm(a).includes(nq)) || nq.includes(norm(l.name)))
    .sort((a, b) => Number(a.type === "level") - Number(b.type === "level") || a.name.length - b.name.length)[0];
}

/** Simple relevance scoring: +1 per term anywhere, +2 per term in the title/tags. */
export function score(terms: string[], hay: string, title: string): number {
  if (!terms.length) return 1;
  const h = hay.toLowerCase(), t = title.toLowerCase();
  return terms.reduce((a, w) => a + (h.includes(w) ? 1 : 0) + (t.includes(w) ? 2 : 0), 0);
}
export const terms = (q?: string) => (q ?? "").toLowerCase().split(/\s+/).filter((t) => t.length > 1);

export function searchDocs(db: Db, o: { query?: string; category?: string; locationId?: string; discipline?: string; limit?: number }): Doc[] {
  const ids = o.locationId ? descendantIds(db, o.locationId) : null;
  const t = terms(o.query);
  return db.docs
    .filter((d) => (!ids || ids.has(d.locationId)) &&
      (!o.category || d.category.toLowerCase() === o.category.toLowerCase()) &&
      (!o.discipline || (d.discipline ?? "").toLowerCase() === o.discipline.toLowerCase()))
    .map((d) => ({ d, s: score(t, `${d.category} ${d.discipline ?? ""} ${d.summary} ${d.text} ${locationPath(db, d.locationId)}`, `${d.title} ${d.tags.join(" ")}`) }))
    .filter((x) => !t.length || x.s > 0)
    .sort((a, b) => b.s - a.s || b.d.uploadedAt.localeCompare(a.d.uploadedAt))
    .slice(0, o.limit ?? 12)
    .map((x) => x.d);
}
