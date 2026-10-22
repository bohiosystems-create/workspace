// The construction orchestrator: reads the programme, procurement, permits and quality records and proposes what to
// do next — expedite a late package, resequence work around a late delivery, recover a slipping critical activity,
// raise or approve material requests, close expired permits, chase permits and overdue NCRs. Every proposal carries
// its reasons, its risk, what it costs (when it commits money) and who carries it out. Deterministic and pure: the
// server, the agent's tools, WhatsApp and the standalone page all see the same list.
import type { Activity, Db, MaterialRequest } from "../types";
import { addDays, daysBetween } from "../data/util";
import { doubtLine } from "../proposals";
import type { SiteAction, SiteKind } from "./types";

export const SITE_KIND_LABEL: Record<SiteKind, string> = {
  expedite: "expedite a package", resequence: "resequence around a late delivery", recover: "recover a slipping critical activity",
  stock_mr: "raise a material request", approve_mr: "approve a material request", permit_close: "close an expired permit",
  permit_chase: "chase a permit", ncr_escalate: "escalate an overdue NCR",
};
/** Night-shift cost assumption for recovery proposals (crew of ~25 on overtime, plant and lighting), SAR per night. */
export const NIGHT_SHIFT_SAR = 6_500;

const fmt = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return y ? `${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]}` : iso; };
const sar = (n: number) => `SAR ${Math.round(n).toLocaleString("en-US")}`;
const slip = (a: Activity) => daysBetween(a.baselineFinish, a.finish);
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 3);

export interface SiteLearned { closed: Set<string>; doubts?: Map<string, { rejected: number; of: number; reasons: string[] }> }

export function proposeSite(db: Db, learned: SiteLearned, now = new Date()): SiteAction[] {
  const d = db.data, date = d.meta.dataDate, out: SiteAction[] = [];
  const push = (a: SiteAction) => { if (!learned.closed.has(a.id) && !out.some((x) => x.id === a.id)) out.push(a); };
  const act = new Map(d.schedule.map((a) => [a.id, a]));
  const contact = (re: RegExp, company?: RegExp) => d.contacts.find((c) => re.test(c.role) && (!company || company.test(c.company)));
  const supplierName = (id?: string) => d.procurement.suppliers.find((s) => s.id === id)?.name ?? "the supplier";
  const procurementLead = contact(/procurement|commercial/i, /kinan/i) ?? contact(/procurement/i);
  const nowIso = now.toISOString().slice(0, 16).replace("T", " ");

  // 1. Packages that will arrive after the work needs them: expedite, and resequence the work around them.
  for (const p of d.procurement.packages.filter((x) => x.forecastOnSite > x.requiredOnSite && x.status !== "Complete")) {
    const late = daysBetween(p.requiredOnSite, p.forecastOnSite);
    const a = p.activityId ? act.get(p.activityId) : undefined;
    const delayed = d.procurement.deliveries.filter((x) => x.status === "Delayed" && d.procurement.pos.find((po) => po.po === x.po)?.packageId === p.id);
    push({ id: `expedite:${p.id}`, domain: "site", kind: "expedite", title: `Ask ${supplierName(p.supplierId)} to expedite ${p.name} (${late} days late)`,
      why: [`Needed on site ${fmt(p.requiredOnSite)}, forecast ${fmt(p.forecastOnSite)}`, ...(a ? [`Feeds ${a.id} ${a.name}${a.critical ? " — on the critical path" : ` (${a.totalFloat} days float)`}`] : []),
        ...(delayed.length ? [`${delayed.length} deliver${delayed.length > 1 ? "ies" : "y"} delayed: ${delayed[0].remarks ?? delayed[0].items}`] : []), `Status ${p.status}. ${p.notes}`.slice(0, 160)],
      risk: "low", owner: procurementLead?.name ?? "Procurement", locationId: a?.locationId, targets: { packageId: p.id, activityId: a?.id },
      patches: [{ t: "package_note", id: p.id, text: `Expedite requested ${date}: recover up to ${late} days on ${fmt(p.forecastOnSite)}.` }],
      instruction: `Expedite ${p.id} ${p.name} with ${supplierName(p.supplierId)}: confirm a recovery date within 48 h (forecast ${fmt(p.forecastOnSite)}, needed ${fmt(p.requiredOnSite)}).` });

    // resequence: the work waiting for it starts when it arrives; the same crew brings forward work that is ready
    if (a && a.status === "not_started" && p.forecastOnSite > a.start) {
      const shift = daysBetween(a.start, addDays(p.forecastOnSite, 2));
      const dur = daysBetween(a.start, a.finish);
      const waiting = new Set(d.procurement.packages.filter((x) => x.forecastOnSite > x.requiredOnSite).map((x) => x.activityId));
      const ready = d.schedule.filter((b) => b.id !== a.id && b.status === "not_started" && b.contractor === a.contractor && b.trade === a.trade && !waiting.has(b.id)
        && b.start > a.start && daysBetween(a.start, b.start) <= 60 && b.predecessors.every((id) => act.get(id)?.status === "completed"))
        .sort((x, y) => x.start.localeCompare(y.start))[0];
      const pull = ready ? daysBetween(a.start, ready.start) : 0;
      const newStart = addDays(a.start, shift);
      push({ id: `resequence:${a.id}:${p.forecastOnSite}`, domain: "site", kind: "resequence",
        title: ready ? `Resequence: start ${ready.id} now, move ${a.id} to ${fmt(newStart)} when ${p.id} arrives` : `Re-plan ${a.id} to start ${fmt(newStart)}, when ${p.id} arrives`,
        why: [`${a.id} ${a.name} was due to start ${fmt(a.start)}; ${p.name} now arrives ${fmt(p.forecastOnSite)}`,
          ...(ready ? [`${ready.id} ${ready.name} has all its predecessors done and the same crew (${a.contractor.replace(/ \(.*\)$/, "")}): it keeps them working instead of standing idle`] : ["No ready work for the same crew was found to bring forward"]),
          a.critical ? `${a.id} is critical: the finish moves ${shift} days unless the package is recovered — approve together with the expedite` : `${a.id} has ${a.totalFloat} days float${shift > a.totalFloat ? ` — less than the ${shift}-day move: it becomes critical` : ""}`],
        risk: a.critical || shift > a.totalFloat ? "high" : "medium", owner: contact(/planning|planner|project manager/i, /bunyan/i)?.name ?? "Planning", locationId: a.locationId,
        targets: { activityId: a.id, packageId: p.id },
        patches: [{ t: "activity", id: a.id, start: newStart, finish: addDays(newStart, dur) }, ...(ready ? [{ t: "activity" as const, id: ready.id, start: date > a.start ? date : a.start, finish: addDays(date > a.start ? date : a.start, daysBetween(ready.start, ready.finish)) }] : [])],
        instruction: ready ? `Resequence approved: ${ready.id} starts now (brought forward ${pull} days); ${a.id} moves to ${fmt(newStart)} to follow ${p.id}.` : `${a.id} re-planned to ${fmt(newStart)} to follow ${p.id}.` });
    }
  }

  // 2. Critical work slipping, with time left to recover: a night shift.
  for (const a of d.schedule.filter((x) => x.status === "in_progress" && (x.critical ? slip(x) >= 3 : slip(x) >= 7) && daysBetween(date, x.finish) >= 3).sort((x, y) => Number(y.critical) - Number(x.critical) || slip(y) - slip(x)).slice(0, 3)) {
    // three weeks of night shifts at most, recovering about a third of a day per night
    const left = Math.min(21, daysBetween(date, a.finish)), rec = Math.min(slip(a), Math.max(1, Math.round(left * 0.3)));
    const cost = left * NIGHT_SHIFT_SAR;
    push({ id: `recover:${a.id}`, domain: "site", kind: "recover", title: `Night shift on ${a.id} for ${left} nights to recover ${rec} of ${slip(a)} days`,
      why: [`${a.name}: ${a.percent}% done, forecast ${fmt(a.finish)} vs baseline ${fmt(a.baselineFinish)} (+${slip(a)} days)`, a.critical ? "On the critical path: every day lost moves completion" : `Not critical yet, but ${slip(a)} days behind is eating the float of the work that follows (${a.trade.toLowerCase()} trade)`, `${left} nights at about ${sar(NIGHT_SHIFT_SAR)} each (crew, plant, lighting) — estimate`, "Night work needs the heat-stress and lighting controls in the method statement"],
      risk: cost > 25_000 ? "medium" : "low", cost, costNote: `${left} × ${sar(NIGHT_SHIFT_SAR)} (estimate)`, owner: a.contractor.replace(/ \(.*\)$/, ""), locationId: a.locationId, targets: { activityId: a.id },
      patches: [{ t: "activity", id: a.id, finish: addDays(a.finish, -rec) }],
      instruction: `Recovery approved: add a night shift on ${a.id} ${a.name} for ${left} nights to recover ${rec} days (target finish ${fmt(addDays(a.finish, -rec))}).` });
  }

  // 3. Stock below its minimum with nothing on request: raise the material request.
  const openMr = d.procurement.requests.filter((r) => r.status !== "Rejected");
  for (const s of d.procurement.stock.filter((x) => x.qty < x.min)) {
    const w = words(s.item);
    if (openMr.some((r) => words(r.item).some((x) => w.includes(x)))) continue;
    const qty = Math.ceil((s.min * 2 - s.qty) / (s.min >= 1000 ? 100 : 1)) * (s.min >= 1000 ? 100 : 1);
    const id = `MR-${String(400 + (d.procurement.requests.length % 500)).padStart(3, "0")}`;
    const mr: MaterialRequest = { id, item: s.item, qty, unit: s.unit, neededBy: addDays(date, 7), locationId: s.locationId, requestedBy: "Orchestrator (approved)", created: date, status: "Submitted", notes: `Stock ${s.qty} ${s.unit} below the minimum ${s.min}.` };
    push({ id: `stock:${s.item}:${s.qty}`, domain: "site", kind: "stock_mr", title: `Raise a material request: ${qty} ${s.unit} ${s.item}`,
      why: [`In stock ${s.qty.toLocaleString("en-US")} ${s.unit}, minimum ${s.min.toLocaleString("en-US")}`, "No open material request for it", "Goes to procurement for approval — commits no spend by itself"],
      risk: "low", owner: procurementLead?.name ?? "Procurement", locationId: s.locationId, targets: { mrId: id }, patches: [{ t: "mr_add", mr }] });
  }

  // 4. Material requests waiting for approval and needed within a week.
  for (const r of d.procurement.requests.filter((x) => x.status === "Submitted" && daysBetween(date, x.neededBy) <= 7)) {
    const days = daysBetween(date, r.neededBy);
    push({ id: `approve_mr:${r.id}`, domain: "site", kind: "approve_mr", title: `Approve ${r.id}: ${r.qty} ${r.unit} ${r.item}`,
      why: [`Needed ${days <= 0 ? "now" : `in ${days} day${days > 1 ? "s" : ""}`} (${fmt(r.neededBy)}) by ${r.requestedBy}`, `Submitted ${fmt(r.created)}, still waiting`, ...(r.notes ? [r.notes] : [])],
      risk: "low", owner: procurementLead?.name ?? "Procurement", locationId: r.locationId, targets: { mrId: r.id }, patches: [{ t: "mr_status", id: r.id, status: "Approved" }] });
  }

  // 5. Permits: still "active" after they expired; requested and never issued.
  const expired = d.safety.permits.filter((x) => x.status === "Active" && x.validTo < nowIso);
  if (expired.length) {
    const types = [...new Set(expired.map((p) => p.type.replace(/ Permit.*$/, "").toLowerCase()))];
    push({ id: `permit_close:${expired.map((p) => p.id).join(",")}`, domain: "site", kind: "permit_close", title: expired.length > 1 ? `Close ${expired.length} expired permits (${types.join(", ")})` : `Close expired permit ${expired[0].id} (${expired[0].type})`,
      why: [`Still marked active after they expired: ${expired.map((p) => `${p.id} (${p.validTo})`).join(", ")}`, "Work under an expired permit must stop until it is re-issued", `Holders: ${[...new Set(expired.map((p) => p.holder))].join(", ")}`],
      risk: "low", owner: contact(/hse/i)?.name ?? expired[0].issuer, locationId: expired[0].locationId, targets: { permitId: expired[0].id },
      patches: expired.map((p) => ({ t: "permit" as const, id: p.id, status: "Closed" as const })),
      instruction: `Expired permits closed: ${expired.map((p) => p.id).join(", ")}. Re-issue before work continues there.` });
  }
  const permitsLead = contact(/permit/i, /kinan/i);
  for (const p of d.safety.permits.filter((x) => x.status === "Requested" && x.validFrom.slice(0, 10) < date)) {
    push({ id: `permit_chase:${p.id}`, domain: "site", kind: "permit_chase", title: `Chase ${p.id}: ${p.type} requested ${daysBetween(p.validFrom.slice(0, 10), date)} days ago`,
      why: [p.description, `Requested for ${p.validFrom.slice(0, 10)}, not issued`, `Issuer: ${p.issuer}`], risk: "low", owner: permitsLead?.name ?? p.issuer, locationId: p.locationId, targets: { permitId: p.id },
      patches: [], instruction: `Chase ${p.id} ${p.type}: issue (with its conditions) or cancel today.` });
  }

  // 6. NCRs past their close-out date: escalate to the contractor's project manager.
  for (const n of d.quality.ncrs.filter((x) => x.status === "Open" && x.due && daysBetween(x.due, date) >= (x.severity === "Major" ? 1 : 5))) {
    const over = daysBetween(n.due, date);
    const pm = contact(/project manager/i, new RegExp(n.contractor.split(" ")[0], "i"));
    push({ id: `ncr:${n.id}:${n.due}`, domain: "site", kind: "ncr_escalate", title: `Escalate ${n.id} to ${pm?.name ?? n.contractor}: ${over} day${over === 1 ? "" : "s"} overdue`,
      why: [`${n.severity}: ${n.title}`, `Close-out was due ${fmt(n.due)}`, `Disposition: ${n.disposition}`.slice(0, 140)], risk: "low", owner: pm?.name ?? n.contractor, locationId: n.locationId, targets: { ncrId: n.id },
      patches: [{ t: "ncr_due", id: n.id, due: addDays(date, n.severity === "Major" ? 3 : 7) }],
      instruction: `${n.id} escalated to ${pm?.name ?? n.contractor}: close out by ${fmt(addDays(date, n.severity === "Major" ? 3 : 7))} (${n.severity}, ${over} days overdue).` });
  }

  const doubt = (a: SiteAction) => learned.doubts?.get(`site|${a.kind}`);
  for (const a of out) { const l = doubt(a); if (l) a.why = [...a.why, doubtLine(SITE_KIND_LABEL[a.kind], l, false)]; }
  const order = { high: 0, medium: 1, low: 2 } as const;
  return out.sort((x, y) => Number(!!doubt(x)) - Number(!!doubt(y)) || order[x.risk] - order[y.risk] || x.title.localeCompare(y.title));
}
