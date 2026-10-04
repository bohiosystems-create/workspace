/**
 * Offline document parser: builds a ProjectModelSpec with no AI, by recognising the usual project files by their
 * columns — an area / accommodation schedule, a setting-out (survey) schedule, a programme export — plus site
 * dimensions, the grid convention, roads, gates, cranes and zones written in a brief or logistics plan.
 * It works on any documents laid out this way, and is what the Studio uses when no AI key is configured.
 */
import type { Phase, Use } from "./spec";

export interface InDoc { name: string; text: string }
export interface ParseLog { step: string; detail: string }

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const out: string[] = []; let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === "," || c === ";" || c === "\t") { out.push(cur.trim()); cur = ""; } else cur += c;
    }
    out.push(cur.trim()); rows.push(out);
  }
  return rows;
}
const MON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
/** ISO, P6 "01-Sep-26", "1 May 2027", "01/09/2026" (day first). */
export function parseDate(s: string): string {
  const t = s.trim().replace(/\*|A$/g, "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s,]+(\d{2,4})$/.exec(t);
  if (m && MON[m[2].toLowerCase()]) { const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); return `${y}-${String(MON[m[2].toLowerCase()]).padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t); if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}
const col = (head: string[], ...keys: (string | RegExp)[]) => head.findIndex((h) => keys.some((k) => (typeof k === "string" ? h.toLowerCase().includes(k) : k.test(h))));
const n = (s: string | undefined) => { const v = parseFloat(String(s ?? "").replace(/[^\d.\-]/g, "")); return Number.isFinite(v) ? v : NaN; };
const useOf = (s: string): Use => {
  const t = s.toLowerCase();
  return /town|villa/.test(t) ? "townhouse" : /hotel/.test(t) ? "hotel" : /retail|mall|podium|shop/.test(t) ? "retail" : /office|commercial/.test(t) ? "office" : /park|car|mscp/.test(t) ? "parking" : /school|education/.test(t) ? "school" : /mosque|masjid/.test(t) ? "mosque" : /util|substation|plant|tank|stp/.test(t) ? "utility" : /club|amenit|gym|community/.test(t) ? "amenity" : "residential";
};
const phaseOf = (s: string): Phase | null => {
  const t = s.toLowerCase();
  if (/hand ?over|commission|t&c|testing/.test(t)) return "handover";
  if (/fit-?out|finish|mep|interior/.test(t)) return "fitout";
  if (/fa[cç]ade|curtain|cladding|glazing|envelope/.test(t)) return "facade";
  if (/super ?structure|frame|structure|slab|core|dome/.test(t)) return "structure";
  if (/pil(e|ing)|excavat|raft|substructure|foundation|basement|shoring/.test(t)) return "substructure";
  return null;
};

export function parseOffline(docs: InDoc[]): { raw: Record<string, unknown>; log: ParseLog[] } {
  const log: ParseLog[] = [];
  const all = docs.map((d) => d.text).join("\n");
  const sources: { file: string; used: string }[] = [];
  const assumptions: string[] = [];

  // ---- site size and grid convention
  let width = 0, depth = 0;
  const sm = /(\d+(?:\.\d+)?)\s*m\s*(?:\(?\s*)?(?:east[\s–-]*west|e[\s–-]*w)\)?\s*(?:by|x|×)\s*(\d+(?:\.\d+)?)\s*m\s*(?:\(?\s*)?(?:north[\s–-]*south|n[\s–-]*s)/i.exec(all);
  if (sm) { width = Number(sm[1]); depth = Number(sm[2]); const d = docs.find((x) => sm && x.text.includes(sm[0])); if (d) sources.push({ file: d.name, used: `site ${width} × ${depth} m` }); log.push({ step: "Site", detail: `${width} m east–west × ${depth} m north–south` }); }
  const southOrigin = /origin[^.\n]{0,40}south[\s-]*west|south[\s-]*west corner[^.\n]{0,30}origin|northing increasing north/i.test(all) || !/origin[^.\n]{0,40}north[\s-]*west/i.test(all);
  log.push({ step: "Grid", detail: southOrigin ? "Easting/Northing from the south-west corner — converted to the site grid (z from the north edge)" : "origin at the north-west corner" });
  const ddm = /data date[^0-9A-Za-z]{0,6}(?:for reporting[^0-9A-Za-z]{0,4})?(\d{4}-\d{2}-\d{2}|\d{1,2}[-\s][A-Za-z]{3,9}[-\s]\d{2,4})/i.exec(all);
  const dataDate = ddm ? parseDate(ddm[1]) : "";

  // ---- classify CSV tables by their columns
  type Tab = { doc: InDoc; head: string[]; rows: string[][] };
  const tabs: Tab[] = docs.filter((d) => /\.(csv|tsv|txt)$/i.test(d.name) || d.text.split("\n")[1]?.split(",").length > 3).map((d) => { const r = parseCsv(d.text); return { doc: d, head: (r[0] ?? []).map((h) => h.trim()), rows: r.slice(1) }; }).filter((t) => t.head.length > 2);
  const area = tabs.find((t) => col(t.head, "storey", "floors", "levels above") >= 0 && col(t.head, "building", "block", "ref") >= 0);
  const so = tabs.find((t) => col(t.head, "easting", /^x$/i) >= 0 && col(t.head, "northing", /^y$/i) >= 0);
  const prog = tabs.find((t) => col(t.head, "start") >= 0 && col(t.head, "finish", "end") >= 0 && col(t.head, "activity name", "description", "task") >= 0);

  // ---- buildings from the area schedule
  const bs: Record<string, any>[] = [];
  if (area) {
    const h = area.head, iRef = col(h, "ref", "id", "code"), iName = col(h, "name"), iUse = col(h, "use", "type"), iF = col(h, "storeys", "floors", "levels above"), iB = col(h, "basement"), iFtf = col(h, "floor-to-floor", "storey height", "ftf"), iW = col(h, "e-w", "width", "length"), iD = col(h, "n-s", "depth");
    for (const r of area.rows) {
      const id = (r[iRef] ?? r[0]).trim(); if (!id) continue;
      const use = useOf(`${r[iUse] ?? ""} ${r[iName] ?? ""}`);
      bs.push({ id, name: r[iName] || id, use, floors: Math.max(1, Math.round(n(r[iF]) || 1)), basements: n(r[iB]) || 0, storeyHeight: n(r[iFtf]) || undefined, w: n(r[iW]) || undefined, d: n(r[iD]) || undefined, source: `${area.doc.name} · ${id}`, confidence: "high" });
    }
    sources.push({ file: area.doc.name, used: `${bs.length} buildings: use, storeys, floor-to-floor, footprint` });
    log.push({ step: "Buildings", detail: `${bs.length} from ${area.doc.name}` });
  }
  // ---- positions from the setting-out schedule (bounding box of each building's points)
  if (so) {
    const h = so.head, iB = col(h, "building", "block", "ref"), iE = col(h, "easting", /^x$/i), iN = col(h, "northing", /^y$/i);
    const pts: Record<string, [number, number][]> = {};
    for (const r of so.rows) { const k = (r[iB] ?? "").trim(); const e = n(r[iE]), nn = n(r[iN]); if (k && Number.isFinite(e) && Number.isFinite(nn)) (pts[k] ??= []).push([e, nn]); }
    let placed = 0;
    for (const [k, p] of Object.entries(pts)) {
      const minE = Math.min(...p.map((q) => q[0])), maxE = Math.max(...p.map((q) => q[0])), minN = Math.min(...p.map((q) => q[1])), maxN = Math.max(...p.map((q) => q[1]));
      let b = bs.find((x) => x.id === k); if (!b) { b = { id: k, name: k, use: "residential", floors: 4, confidence: "low" }; bs.push(b); }
      if (!depth) depth = Math.max(depth, maxN + 20); if (!width) width = Math.max(width, maxE + 20);
      b.x = minE; b.w = maxE - minE; b.d = maxN - minN; b.z = southOrigin ? depth - maxN : minN;
      b.source = `${b.source ?? ""}${b.source ? " · " : ""}${so.doc.name} (${p.length} points)`; placed++;
    }
    sources.push({ file: so.doc.name, used: `positions of ${placed} buildings (corner coordinates)` });
    log.push({ step: "Setting-out", detail: `${placed} footprints positioned from ${so.doc.name}` });
  }
  if (!width) { width = 300; assumptions.push("Site size not stated: assumed 300 × 200 m"); }
  if (!depth) depth = 200;
  // buildings without coordinates: lay out on a grid and say so
  let gx = 10, gz = 10, rowH = 0;
  for (const b of bs) if (b.x === undefined) {
    const w = b.w ?? 30, d = b.d ?? 30;
    if (gx + w > width - 10) { gx = 10; gz += rowH + 15; rowH = 0; }
    b.x = gx; b.z = gz; b.w = w; b.d = d; gx += w + 15; rowH = Math.max(rowH, d); b.confidence = "low";
    assumptions.push(`${b.id}: no setting-out found — placed on a layout grid`);
  }

  // ---- programme: activity → building (by ID prefix or name) and phase (by keywords)
  const acts: Record<string, string>[] = [];
  let pStart = "", pFinish = "";
  if (prog) {
    const h = prog.head, iId = col(h, "activity id", /^id$/i), iN = col(h, "activity name", "description", "task"), iS = col(h, "start"), iF = col(h, "finish", "end");
    let mapped = 0;
    for (const r of prog.rows) {
      const id = r[iId] ?? "", name = r[iN] ?? "", s = parseDate(r[iS] ?? ""), f = parseDate(r[iF] ?? "");
      if (!s || !f) continue;
      if (!pStart || s < pStart) pStart = s; if (!pFinish || f > pFinish) pFinish = f;
      const ph = phaseOf(name); if (!ph) continue;
      const pre = id.split(/[-_ ]/)[0];
      const b = bs.find((x) => x.id === pre) ?? bs.find((x) => name.toLowerCase().includes(String(x.name).toLowerCase()));
      if (!b) continue;
      acts.push({ id, building: b.id, phase: ph, name, start: s, finish: f, source: `${prog.doc.name} · ${id}` }); mapped++;
    }
    const ddp = /data date\s*([0-9A-Za-z-]+)/i.exec(prog.doc.text);
    sources.push({ file: prog.doc.name, used: `${mapped} activities mapped to buildings and phases` });
    log.push({ step: "Programme", detail: `${mapped} activities from ${prog.doc.name}${ddp ? ` (data date ${ddp[1]})` : ""}` });
  }

  // ---- logistics: roads, gates, cranes, zones written in prose / tables
  const toZ = (nn: number) => (southOrigin ? depth - nn : nn);
  const roads: Record<string, unknown>[] = [], gates: Record<string, unknown>[] = [], cranes: Record<string, unknown>[] = [], zones: Record<string, unknown>[] = [];
  for (const d of docs) {
    if (/\.csv$/i.test(d.name)) continue;
    for (const line of d.text.split("\n")) {
      const coords = [...line.matchAll(/\((-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\)/g)].map((m) => [Number(m[1]), Number(m[2])]);
      const bold = /\*\*([^*]+)\*\*/.exec(line)?.[1]?.trim();
      if (/road|boulevard|street|avenue/i.test(line) && coords.length >= 2) {
        const wm = /(\d+(?:\.\d+)?)\s*m wide/i.exec(line);
        roads.push({ name: bold ?? "Road", width: wm ? Number(wm[1]) : 8, points: coords.map(([e, nn]) => [e, toZ(nn)]) });
      } else if (/gate/i.test(line) && coords.length === 1) {
        gates.push({ name: bold ?? (/gate\s*\w+/i.exec(line)?.[0] ?? "Gate"), x: coords[0][0], z: toZ(coords[0][1]) });
      } else if (/^\|\s*TC\d+/i.test(line.trim()) && coords.length === 1) {
        const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
        const r = n(cells[2]); const serves = cells[3] ?? "";
        const b = bs.find((x) => serves.toLowerCase().includes(String(x.name).toLowerCase()));
        cranes.push({ id: cells[0], x: coords[0][0], z: toZ(coords[0][1]), radius: Number.isFinite(r) ? r : 50, building: b?.id });
      } else {
        const zm = /E\s*(\d+)\s*[–-]\s*(\d+)\s*,\s*N\s*(\d+)\s*[–-]\s*(\d+)/i.exec(line);
        if (zm && bold) {
          const [e1, e2, n1, n2] = zm.slice(1).map(Number);
          const kind = /laydown|storage/i.test(bold) ? "laydown" : /compound|office|welfare/i.test(bold) ? "compound" : /park(ing)?\b(?!.*landscape)/i.test(bold) && !/central park|landscape/i.test(line) ? "parking" : /park|landscape|garden/i.test(line) ? "landscape" : "other";
          zones.push({ name: bold, kind, x: e1, z: toZ(n2), w: e2 - e1, d: n2 - n1 });
        }
      }
    }
    if (roads.length || gates.length || cranes.length || zones.length) { if (!sources.some((s) => s.file === d.name)) sources.push({ file: d.name, used: `${roads.length} roads, ${gates.length} gates, ${cranes.length} cranes, ${zones.length} zones` }); }
  }
  if (roads.length || cranes.length) log.push({ step: "Logistics", detail: `${roads.length} roads, ${gates.length} gates, ${cranes.length} cranes, ${zones.length} zones` });
  // storey heights from a design basis if the schedule had none
  for (const b of bs) if (!b.storeyHeight) { assumptions.push(`${b.id}: floor-to-floor not stated — default for ${b.use} used`); }

  const name = /^#\s*(.+?)\s*[—–-]\s*(?:project brief|brief)/im.exec(all)?.[1] ?? /project[:\s]+([A-Z][\w\s]+?)(?:\s*[—–-]|\n)/.exec(all)?.[1] ?? "Generated project";
  const location = /\*\*Location:\*\*\s*([^·\n]+)/.exec(all)?.[1]?.trim();
  return {
    raw: { name, location, site: { width, depth }, roads, zones, gates, cranes, buildings: bs, schedule: { start: pStart, finish: pFinish, dataDate: dataDate || pStart, activities: acts }, assumptions, sources },
    log,
  };
}
