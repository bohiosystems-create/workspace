/**
 * Three-way JSON merge used when two server instances saved the database at the
 * same time. Lists of records are merged by their id (id / po / sheet / item+place),
 * so a note added on WhatsApp and a document uploaded on the web both survive.
 * On a true conflict (same record changed on both sides) our version wins.
 */
type J = unknown;
const same = (a: J, b: J) => a === b || JSON.stringify(a) === JSON.stringify(b);
const isObj = (x: J): x is Record<string, J> => !!x && typeof x === "object" && !Array.isArray(x);

function keyOf(x: J): string | undefined {
  if (!isObj(x)) return undefined;
  for (const k of ["id", "po", "sheet"]) if (typeof x[k] === "string") return `${k}:${x[k]}`;
  if (typeof x.item === "string") return `item:${x.item}@${String(x.locationId ?? "")}`;
  return undefined;
}

export function merge3(base: J, ours: J, theirs: J): J {
  if (same(ours, base)) return theirs;
  if (same(theirs, base) || same(ours, theirs)) return ours;
  if (Array.isArray(ours) && Array.isArray(theirs)) {
    const b = Array.isArray(base) ? base : [];
    if (![...ours, ...theirs, ...b].every((x) => keyOf(x))) return ours;
    const bm = new Map(b.map((x) => [keyOf(x)!, x]));
    const om = new Map(ours.map((x) => [keyOf(x)!, x]));
    const out: J[] = [];
    const seen = new Set<string>();
    // New records we added go first (lists are newest-first), then theirs in their order.
    for (const x of ours) { const k = keyOf(x)!; if (!bm.has(k) && !theirs.some((t) => keyOf(t) === k)) { out.push(x); seen.add(k); } }
    for (const t of theirs) {
      const k = keyOf(t)!;
      if (seen.has(k)) continue;
      seen.add(k);
      const o = om.get(k), bx = bm.get(k);
      if (o === undefined) { if (bx === undefined || !same(t, bx)) out.push(t); continue; } // we deleted it (unless they changed it)
      out.push(bx === undefined ? o : merge3(bx, o, t));
    }
    return out;
  }
  if (isObj(ours) && isObj(theirs)) {
    const b = isObj(base) ? base : {};
    const out: Record<string, J> = {};
    for (const k of new Set([...Object.keys(theirs), ...Object.keys(ours)])) {
      if (!(k in ours) && k in b) continue;              // we removed the key
      if (!(k in ours)) { out[k] = theirs[k]; continue; }
      if (!(k in theirs)) { if (!(k in b)) out[k] = ours[k]; continue; }
      out[k] = merge3(b[k], ours[k], theirs[k]);
    }
    return out;
  }
  return ours;
}
