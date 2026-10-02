import type { Activity, Db } from "../types";
import { descendantIds, locationPath, resolveLocation, score, terms } from "./query";

/** Domain queries over db.data, returning compact, model-friendly objects. */
const D = (db: Db) => db.data;
const addDays = (iso: string, n: number) => { const d = new Date(iso.slice(0, 10) + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diff = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86400000);
export const today = (db: Db) => D(db).meta.dataDate;

function locFilter(db: Db, location?: string): { ids: Set<string> | null; error?: string; name?: string } {
  if (!location) return { ids: null };
  const l = resolveLocation(db, location);
  if (!l) return { ids: null, error: `No place matches "${location}".` };
  return { ids: descendantIds(db, l.id), name: locationPath(db, l.id) };
}
const slip = (a: Activity) => diff(a.baselineFinish, a.finish);
const actBrief = (db: Db, a: Activity) => ({
  id: a.id, name: a.name, location: locationPath(db, a.locationId), contractor: a.contractor,
  start: a.start, finish: a.finish, baselineFinish: a.baselineFinish, slipDays: slip(a), percent: a.percent, status: a.status,
  critical: a.critical, float: a.totalFloat, ...(a.milestone ? { milestone: true } : {}),
});

// ---------------------------------------------------------------- schedule
export function scheduleQuery(db: Db, o: { location?: string; query?: string; status?: string; from?: string; to?: string; critical?: boolean; late?: boolean; trade?: string; limit?: number }) {
  const lf = locFilter(db, o.location); if (lf.error) return { error: lf.error };
  const t = terms(o.query);
  let xs = D(db).schedule.filter((a) =>
    (!lf.ids || lf.ids.has(a.locationId)) &&
    (!o.status || a.status === o.status) &&
    (!o.critical || a.critical) &&
    (!o.late || (slip(a) > 3 && a.status !== "completed")) &&
    (!o.trade || a.trade.toLowerCase().includes(o.trade.toLowerCase())) &&
    (!o.from || a.finish >= o.from) && (!o.to || a.start <= o.to) &&
    (!t.length || score(t, `${a.trade} ${a.contractor} ${a.wbs}`, `${a.id} ${a.name}`) > 0));
  xs = xs.sort((a, b) => (o.late ? slip(b) - slip(a) : a.start.localeCompare(b.start)));
  return { dataDate: today(db), location: lf.name, count: xs.length, activities: xs.slice(0, o.limit ?? 25).map((a) => actBrief(db, a)) };
}

export function lookahead(db: Db, o: { weeks?: number; location?: string }) {
  const weeks = Math.min(Math.max(o.weeks ?? 2, 1), 8), from = today(db), to = addDays(from, weeks * 7);
  const lf = locFilter(db, o.location); if (lf.error) return { error: lf.error };
  const inLoc = (id: string) => !lf.ids || lf.ids.has(id);
  const acts = D(db).schedule.filter((a) => inLoc(a.locationId) && a.status !== "completed" && a.start <= to && a.finish >= from);
  const starting = acts.filter((a) => a.start >= from).sort((a, b) => a.start.localeCompare(b.start));
  const finishing = acts.filter((a) => a.finish <= to).sort((a, b) => a.finish.localeCompare(b.finish));
  const deliveries = D(db).procurement.deliveries.filter((d) => d.date >= from && d.date <= to && inLoc(d.locationId)).slice(0, 20);
  return {
    window: `${from} → ${to}`, location: lf.name,
    milestones: acts.filter((a) => a.milestone).map((a) => actBrief(db, a)),
    starting: starting.slice(0, 20).map((a) => actBrief(db, a)),
    finishing: finishing.slice(0, 20).map((a) => actBrief(db, a)),
    criticalInWindow: acts.filter((a) => a.critical).slice(0, 15).map((a) => actBrief(db, a)),
    deliveries,
    counts: { starting: starting.length, finishing: finishing.length, deliveries: deliveries.length },
  };
}

export function scheduleSummary(db: Db) {
  const S = D(db).schedule, d0 = today(db);
  const dur = (a: Activity) => Math.max(1, diff(a.start, a.finish));
  const bdur = (a: Activity) => Math.max(1, diff(a.baselineStart, a.baselineFinish));
  const earned = S.reduce((s, a) => s + dur(a) * a.percent, 0) / S.reduce((s, a) => s + dur(a), 0);
  const plannedPct = (a: Activity) => (a.baselineFinish <= d0 ? 100 : a.baselineStart > d0 ? 0 : (diff(a.baselineStart, d0) / bdur(a)) * 100);
  const planned = S.reduce((s, a) => s + bdur(a) * plannedPct(a), 0) / S.reduce((s, a) => s + bdur(a), 0);
  const ms = S.filter((a) => a.milestone).map((a) => ({ id: a.id, name: a.name, forecast: a.finish, baseline: a.baselineFinish, varianceDays: slip(a), status: a.status }));
  const worst = S.filter((a) => a.status !== "completed").sort((a, b) => slip(b) - slip(a)).slice(0, 8).map((a) => actBrief(db, a));
  return {
    dataDate: d0, activities: S.length,
    progressPercent: Math.round(earned * 10) / 10, plannedPercent: Math.round(planned * 10) / 10,
    spi: Math.round((earned / Math.max(planned, 0.1)) * 100) / 100,
    completed: S.filter((a) => a.status === "completed").length, inProgress: S.filter((a) => a.status === "in_progress").length,
    criticalLate: S.filter((a) => a.critical && slip(a) > 0 && a.status !== "completed").length,
    practicalCompletion: ms.find((m) => m.id === "M-990"),
    upcomingMilestones: ms.filter((m) => m.status !== "completed").sort((a, b) => a.forecast.localeCompare(b.forecast)).slice(0, 10),
    biggestSlippages: worst,
  };
}

export function getActivity(db: Db, id: string) {
  const a = D(db).schedule.find((x) => x.id.toLowerCase() === id.toLowerCase());
  if (!a) return { error: "Activity not found" };
  const succ = D(db).schedule.filter((x) => x.predecessors.includes(a.id)).map((x) => x.id);
  const pkgs = D(db).procurement.packages.filter((p) => p.activityId === a.id).map((p) => ({ id: p.id, name: p.name, requiredOnSite: p.requiredOnSite, forecastOnSite: p.forecastOnSite }));
  return { ...actBrief(db, a), wbs: a.wbs, trade: a.trade, baselineStart: a.baselineStart, predecessors: a.predecessors, successors: succ, procurementNeeds: pkgs };
}

// ---------------------------------------------------------------- drawing register
export function registerQuery(db: Db, o: { location?: string; discipline?: string; sheet?: string; status?: string; query?: string; limit?: number }) {
  const lf = locFilter(db, o.location); if (lf.error) return { error: lf.error };
  const t = terms(o.query);
  const xs = D(db).register.filter((s) =>
    (!lf.ids || lf.ids.has(s.locationId)) &&
    (!o.discipline || s.discipline.toLowerCase() === o.discipline.toLowerCase() || (o.discipline.toUpperCase() === "MEP" && ["HVAC", "PLB", "ELE", "FIRE"].includes(s.discipline))) &&
    (!o.status || s.status.toLowerCase() === o.status.toLowerCase()) &&
    (!o.sheet || s.sheet.toLowerCase().includes(o.sheet.toLowerCase())) &&
    (!t.length || score(t, s.discipline, `${s.sheet} ${s.title}`) > 0));
  return {
    count: xs.length,
    sheets: xs.slice(0, o.limit ?? 30).map((s) => ({ sheet: s.sheet, title: s.title, rev: s.revision, status: s.status, issued: s.issued, lastChange: s.history[s.history.length - 1]?.reason, openableDocId: s.docId })),
  };
}

// ---------------------------------------------------------------- regulations
export function regulationsQuery(db: Db, o: { query?: string; topic?: string; location?: string; status?: string; limit?: number }) {
  const t = terms(o.query);
  const loc = o.location ? resolveLocation(db, o.location) : undefined;
  const chain = new Set<string>();
  if (loc) { let c: string | undefined = loc.id; while (c) { chain.add(c); c = db.locations.find((l) => l.id === c)?.parentId; } chain.add("site"); }
  const xs = D(db).regulations
    .filter((r) => (!o.topic || r.topic.toLowerCase().includes(o.topic.toLowerCase())) && (!o.status || r.status.toLowerCase() === o.status.toLowerCase()) && (!loc || r.applies.some((a) => chain.has(a))))
    .map((r) => ({ r, s: score(t, `${r.requirement} ${r.authority} ${r.applies.join(" ")}`, `${r.code} ${r.title} ${r.topic}`) }))
    .filter((x) => !t.length || x.s > 0).sort((a, b) => b.s - a.s);
  return { note: D(db).meta.disclaimer, count: xs.length, regulations: xs.slice(0, o.limit ?? 10).map((x) => x.r) };
}

// ---------------------------------------------------------------- safety
export function safetyFor(db: Db, o: { activity?: string; location?: string; query?: string }) {
  const S = D(db).safety;
  const loc = o.location ? resolveLocation(db, o.location) : undefined;
  const keys = new Set<string>([...terms(o.activity), ...terms(o.query)]);
  if (loc) { let c: string | undefined = loc.id; while (c) { keys.add(c); const l = db.locations.find((x) => x.id === c); if (l) keys.add(l.type); c = l?.parentId; } }
  const k = [...keys];
  const match = (xs: string[], extra: string) => k.some((w) => xs.some((a) => a.toLowerCase().includes(w) || w.includes(a.toLowerCase())) || extra.toLowerCase().includes(w));
  const reqs = S.requirements.filter((r) => match(r.appliesTo, `${r.topic} ${r.requirement}`)).sort((a, b) => Number(b.critical) - Number(a.critical));
  const ids = loc ? descendantIds(db, loc.id) : null;
  const permits = S.permits.filter((p) => (p.status === "Active" || p.status === "Suspended") && (!ids || ids.has(p.locationId)));
  const risks = S.risks.filter((r) => k.some((w) => `${r.activity} ${r.hazards.join(" ")}`.toLowerCase().includes(w)));
  const incidents = S.incidents.filter((i) => ids?.has(i.locationId)).slice(0, 5);
  const ppe = new Set<string>(); reqs.forEach((r) => r.ppe.forEach((p) => ppe.add(p)));
  return {
    location: loc ? locationPath(db, loc.id) : undefined,
    requirements: reqs.slice(0, 12), ppeRequired: [...ppe],
    permitsRequired: [...new Set(reqs.map((r) => r.permit).filter(Boolean))],
    activePermitsHere: permits, riskAssessments: risks.slice(0, 5), recentIncidentsHere: incidents,
  };
}
export function hseOverview(db: Db) {
  const S = D(db).safety;
  return {
    stats: S.stats, activePermits: S.permits.filter((p) => p.status === "Active").map((p) => ({ id: p.id, type: p.type, location: locationPath(db, p.locationId), description: p.description, validTo: p.validTo })),
    openIncidents: S.incidents.filter((i) => i.status === "Open"), recentIncidents: S.incidents.slice(0, 8).map((i) => ({ id: i.id, date: i.date, type: i.type, location: locationPath(db, i.locationId), description: i.description })),
    ppeMatrix: S.ppeMatrix,
  };
}
export function permitsQuery(db: Db, o: { status?: string; location?: string; type?: string }) {
  const lf = locFilter(db, o.location); if (lf.error) return { error: lf.error };
  const xs = D(db).safety.permits.filter((p) => (!o.status || p.status.toLowerCase() === o.status.toLowerCase()) && (!lf.ids || lf.ids.has(p.locationId)) && (!o.type || p.type.toLowerCase().includes(o.type.toLowerCase())));
  return { count: xs.length, permits: xs.map((p) => ({ ...p, location: locationPath(db, p.locationId) })) };
}

// ---------------------------------------------------------------- procurement
/** Users say "PO-4500123", "po 4500123" or "4500123"; ERPs store "4500123" or "PO-4500123". */
const poKey = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^PO(?=\d)/, "");
const supName = (db: Db, id?: string) => D(db).procurement.suppliers.find((s) => s.id === id)?.name ?? id ?? "";
const poValue = (lines: { qty: number; unitPrice: number }[]) => lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
export function poQuery(db: Db, o: { query?: string; supplier?: string; status?: string; package?: string; limit?: number }) {
  const P = D(db).procurement, t = terms(o.query);
  const xs = P.pos.filter((p) =>
    (!o.status || p.status.toLowerCase().includes(o.status.toLowerCase())) &&
    (!o.package || p.packageId.toLowerCase() === o.package.toLowerCase()) &&
    (!o.supplier || supName(db, p.supplierId).toLowerCase().includes(o.supplier.toLowerCase())) &&
    (!t.length || score(t, `${supName(db, p.supplierId)} ${p.lines.map((l) => l.item).join(" ")} ${P.packages.find((k) => k.id === p.packageId)?.name ?? ""}`, p.po) > 0));
  return {
    source: P.source, lastSync: P.lastSync, count: xs.length,
    purchaseOrders: xs.slice(0, o.limit ?? 15).map((p) => ({ po: p.po, package: p.packageId, supplier: supName(db, p.supplierId), date: p.date, status: p.status, value: Math.round(poValue(p.lines)), currency: p.currency, items: p.lines.map((l) => `${l.item} (${l.delivered}/${l.qty} ${l.unit})`).join("; ") })),
  };
}
export function getPo(db: Db, po: string) {
  const P = D(db).procurement;
  const k = poKey(po);
  const p = P.pos.find((x) => poKey(x.po) === k || (x.externalId && poKey(x.externalId) === k));
  if (!p) return { error: `PO ${po} not found (source: ${P.source}).` };
  const pkg = P.packages.find((k) => k.id === p.packageId);
  return { ...p, supplier: supName(db, p.supplierId), value: Math.round(poValue(p.lines)), package: pkg && { id: pkg.id, name: pkg.name, requiredOnSite: pkg.requiredOnSite, forecastOnSite: pkg.forecastOnSite }, deliveries: P.deliveries.filter((d) => d.po === p.po) };
}
export function deliveriesQuery(db: Db, o: { from?: string; to?: string; status?: string; location?: string; po?: string; query?: string }) {
  const lf = locFilter(db, o.location); if (lf.error) return { error: lf.error };
  const from = o.from ?? today(db), to = o.to ?? addDays(from, 7), t = terms(o.query);
  const xs = D(db).procurement.deliveries.filter((d) =>
    (o.po ? poKey(d.po) === poKey(o.po) : d.date >= from && d.date <= to) &&
    (!o.status || d.status.toLowerCase() === o.status.toLowerCase()) && (!lf.ids || lf.ids.has(d.locationId)) &&
    (!t.length || score(t, d.items, `${d.po} ${d.id}`) > 0));
  return { window: o.po ? undefined : `${from} → ${to}`, count: xs.length, deliveries: xs.slice(0, 30).map((d) => ({ ...d, location: locationPath(db, d.locationId), supplier: supName(db, D(db).procurement.pos.find((p) => p.po === d.po)?.supplierId) })) };
}
export function packagesQuery(db: Db, o: { query?: string; atRisk?: boolean; status?: string }) {
  const t = terms(o.query);
  const xs = D(db).procurement.packages.filter((p) => (!o.atRisk || p.forecastOnSite > p.requiredOnSite) && (!o.status || p.status.toLowerCase() === o.status.toLowerCase()) && (!t.length || score(t, `${p.trade} ${p.notes} ${supName(db, p.supplierId)}`, `${p.id} ${p.name}`) > 0));
  return { count: xs.length, packages: xs.map((p) => ({ ...p, supplier: supName(db, p.supplierId), floatDays: diff(p.forecastOnSite, p.requiredOnSite), budgetUsedPct: Math.round((p.committed / p.budget) * 100) })) };
}
export function stockQuery(db: Db, o: { query?: string; low?: boolean }) {
  const t = terms(o.query);
  const xs = D(db).procurement.stock.filter((s) => (!o.low || s.qty < s.min) && (!t.length || score(t, s.locationId, s.item) > 0));
  return { stock: xs.map((s) => ({ ...s, location: locationPath(db, s.locationId), belowMinimum: s.qty < s.min })) };
}
export function requestsQuery(db: Db, o: { status?: string }) {
  return { requests: D(db).procurement.requests.filter((r) => !o.status || r.status.toLowerCase() === o.status.toLowerCase()).map((r) => ({ ...r, location: locationPath(db, r.locationId) })) };
}

// ---------------------------------------------------------------- quality & contacts
export function ncrQuery(db: Db, o: { status?: string; location?: string; query?: string }) {
  const lf = locFilter(db, o.location); if (lf.error) return { error: lf.error };
  const t = terms(o.query);
  const xs = D(db).quality.ncrs.filter((n) => (!o.status || n.status.toLowerCase() === o.status.toLowerCase()) && (!lf.ids || lf.ids.has(n.locationId)) && (!t.length || score(t, `${n.disposition} ${n.contractor}`, n.title) > 0));
  return { count: xs.length, ncrs: xs.map((n) => ({ ...n, location: locationPath(db, n.locationId) })) };
}
export function contactsQuery(db: Db, o: { query?: string }) {
  const t = terms(o.query);
  return { contacts: D(db).contacts.map((c) => ({ c, s: score(t, `${c.company} ${c.area ?? ""}`, `${c.name} ${c.role}`) })).filter((x) => !t.length || x.s > 0).sort((a, b) => b.s - a.s).slice(0, 8).map((x) => x.c) };
}

// ---------------------------------------------------------------- universal search
export function searchProject(db: Db, q: string, limit = 15) {
  const t = terms(q); if (!t.length) return { hits: [] };
  const hits: { type: string; id: string; title: string; detail: string; score: number }[] = [];
  const add = (type: string, id: string, title: string, detail: string, s: number) => { if (s > 0) hits.push({ type, id, title, detail, score: s }); };
  for (const d of db.docs) add("document", d.id, d.title, `${d.category} · ${locationPath(db, d.locationId)} — ${d.summary}`, score(t, `${d.summary} ${d.text}`, `${d.title} ${d.tags.join(" ")}`));
  for (const a of D(db).schedule) add("activity", a.id, a.name, `${a.start} → ${a.finish} · ${a.percent}% · ${a.status}`, score(t, a.contractor, `${a.id} ${a.name}`) - 0.5);
  for (const s of D(db).register) add("drawing sheet", s.sheet, s.title, `Rev ${s.revision} · ${s.status}`, score(t, s.discipline, `${s.sheet} ${s.title}`) - 1);
  for (const r of D(db).regulations) add("regulation", r.id, `${r.code} — ${r.title}`, r.requirement.slice(0, 140), score(t, `${r.requirement} ${r.authority}`, `${r.code} ${r.title} ${r.topic}`));
  for (const r of D(db).safety.requirements) add("safety requirement", r.id, r.topic, r.requirement.slice(0, 140), score(t, r.requirement, `${r.topic} ${r.appliesTo.join(" ")}`));
  for (const p of D(db).procurement.pos) add("purchase order", p.po, `${p.po} — ${supName(db, p.supplierId)}`, `${p.status} · ${p.lines.map((l) => l.item).join(", ")}`, score(t, p.lines.map((l) => l.item).join(" "), `${p.po} ${supName(db, p.supplierId)}`));
  for (const p of D(db).procurement.packages) add("procurement package", p.id, p.name, `${p.status} · need ${p.requiredOnSite} · forecast ${p.forecastOnSite}`, score(t, p.notes, `${p.id} ${p.name}`));
  for (const n of D(db).quality.ncrs) add("NCR", n.id, n.title, `${n.status} · ${n.disposition}`, score(t, n.disposition, `${n.id} ${n.title}`));
  for (const c of D(db).contacts) add("contact", c.phone, `${c.name} — ${c.role}`, `${c.company} · ${c.phone}`, score(t, c.company, `${c.name} ${c.role}`) - 0.5);
  hits.sort((a, b) => b.score - a.score);
  return { hits: hits.slice(0, limit).map(({ score: _s, ...h }) => h) };
}
