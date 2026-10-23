// A tool's answer must reach the model as valid JSON, whatever its size. Cutting the text at a character limit (as
// before) broke the JSON mid-record and dropped whatever came last (often the milestones or deliveries). Instead the
// longest lists are shortened until the answer fits, and the answer says which lists were cut and how much, so the
// agent can tell the user and ask a narrower question.
type Obj = Record<string, unknown>;

export function fitJson(o: unknown, max = 14_000): string {
  let s = JSON.stringify(o);
  if (s === undefined || s.length <= max) return s ?? "null";
  const root: Obj = Array.isArray(o) ? { items: structuredClone(o) } : (structuredClone(o) as Obj);
  const total = new Map<string, number>(), shown = new Map<string, number>();
  for (let i = 0; i < 80 && s.length > max; i++) {
    // the longest list (by its size in the answer), up to three levels down
    let best: { parent: Obj | unknown[]; key: string; len: number; path: string } | null = null;
    const walk = (v: unknown, path: string, depth: number) => {
      if (depth > 3 || !v || typeof v !== "object") return;
      for (const [k, x] of Object.entries(v as Obj)) {
        const p = path ? `${path}.${k}` : k;
        if (Array.isArray(x) && x.length > 1) { const l = JSON.stringify(x).length; if (!best || l > best.len) best = { parent: v as Obj, key: k, len: l, path: p }; }
        if (!Array.isArray(v)) walk(x, p, depth + 1);
      }
    };
    walk(root, "", 0);
    if (!best) break;
    const b = best as { parent: Obj; key: string; len: number; path: string };
    const arr = b.parent[b.key] as unknown[];
    if (!total.has(b.path)) total.set(b.path, arr.length);
    const keep = Math.max(1, Math.min(arr.length - 1, Math.floor(arr.length * Math.min(0.8, (max / s.length) * 0.95))));
    b.parent[b.key] = arr.slice(0, keep);
    shown.set(b.path, keep);
    s = JSON.stringify(root);
  }
  if (s.length > max) return JSON.stringify({ error: "Too much to show at once. Narrow the question: a place, a date window, a status or a trade." });
  const cut = Object.fromEntries([...shown].map(([p, n]) => [p, `first ${n} of ${total.get(p)}`]));
  return JSON.stringify({ ...root, truncated: { lists: cut, note: "Some lists were shortened to fit. Say so, and narrow the question for the rest." } });
}
