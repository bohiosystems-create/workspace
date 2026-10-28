// One approvals queue across the building site and every facility, for whoever is signed in: what each orchestrator
// proposes, whether this person may approve it (and why not), and the decision itself. Also the "Today" screen —
// the morning picture in a few lines, the approvals, and how the decisions are working out. Pure: the server and
// the standalone page share it.
import type { Db } from "./types";
import { canApprove, type Person, publicPerson } from "./auth/people";
import { siteActions, decideSite } from "./site/api";
import { SITE_KIND_LABEL } from "./site/orchestrator";
import { act, actions, overview, autopilotOn, withinPolicy } from "./fm/api";
import { KIND_LABEL } from "./fm/orchestrator";
import { fmToday } from "./fm/engine";
import { scheduleSummary } from "./core/project";
import type { RejectReason } from "./proposals";
import { outcomes } from "./outcomes";
import { HAS_OPERATIONS } from "./edition";

export interface ApprovalItem {
  key: string; domain: "site" | "fm"; scopeId: string; scopeName: string; kind: string; kindLabel: string;
  title: string; why: string[]; risk: "low" | "medium" | "high"; cost?: number; costNote?: string; owner?: string;
  /** operations: the autopilot will carry it out by itself under the signed policy */
  autopilot?: boolean;
  can: { ok: boolean; why?: string };
}

export function approvals(db: Db, user: Person | null | undefined): ApprovalItem[] {
  const out: ApprovalItem[] = [];
  for (const a of siteActions(db)) out.push({ key: `site|${a.id}`, domain: "site", scopeId: "kinan-heights", scopeName: db.project.name, kind: a.kind, kindLabel: SITE_KIND_LABEL[a.kind],
    title: a.title, why: a.why, risk: a.risk, ...(a.cost ? { cost: a.cost } : {}), ...(a.costNote ? { costNote: a.costNote } : {}), ...(a.owner ? { owner: a.owner } : {}), can: canApprove(user, { domain: "site", risk: a.risk, cost: a.cost }) });
  const d = fmToday(db);
  for (const a of HAS_OPERATIONS ? actions(db, d) : []) {
    const f = d.facilities.find((x) => x.id === a.facilityId)!;
    out.push({ key: `fm|${a.id}`, domain: "fm", scopeId: f.id, scopeName: f.name, kind: a.kind, kindLabel: KIND_LABEL[a.kind], title: a.title, why: a.why, risk: a.risk, ...(a.cost ? { cost: a.cost } : {}),
      autopilot: autopilotOn(db, a.facilityId) && withinPolicy(db, a), can: canApprove(user, { domain: "fm", facilityId: a.facilityId, risk: a.risk, cost: a.cost }) });
  }
  // what this person can act on first; within that, the riskiest first; the autopilot's own work last
  const r = { high: 0, medium: 1, low: 2 } as const;
  return out.sort((x, y) => Number(y.can.ok) - Number(x.can.ok) || Number(!!x.autopilot) - Number(!!y.autopilot) || r[x.risk] - r[y.risk]);
}

export function decideApproval(db: Db, b: { key: string; decision: "approved" | "rejected"; reason?: RejectReason; note?: string }, user: Person | null | undefined, channel: "web" | "whatsapp" | "field"): { message: string } {
  const [domain, ...rest] = String(b.key).split("|");
  const actionId = rest.join("|");
  if (domain === "site") return { message: decideSite(db, { actionId, decision: b.decision, reason: b.reason, note: b.note }, user, channel).message };
  if (domain === "fm") return { message: act(db, { action: "decide", actionId, decision: b.decision, reason: b.reason }, user?.name ?? "Unknown", channel, user).message };
  throw new Error("Unknown proposal.");
}

/** The first screen: the day in a few lines, the approvals waiting, and the outcomes so far. */
export function today(db: Db, user: Person | null | undefined) {
  const s = scheduleSummary(db);
  const fm = HAS_OPERATIONS ? overview(db) : { facilities: [] };
  const list = approvals(db, user);
  const mine = list.filter((x) => x.can.ok && !x.autopilot);
  const lines: { tone: "ok" | "warn" | "bad"; text: string; go?: string }[] = [];
  lines.push({ tone: s.spi >= 0.97 ? "ok" : s.spi >= 0.9 ? "warn" : "bad", go: "site", text: `${db.project.name}: ${s.progressPercent}% built against ${s.plannedPercent}% planned (SPI ${s.spi}); ${s.criticalLate} critical activit${s.criticalLate === 1 ? "y" : "ies"} late now${s.criticalForecastLater ? ` (${s.criticalForecastLater} later ones forecast late)` : ""}${s.practicalCompletion ? `, completion forecast ${s.practicalCompletion.forecast} (${s.practicalCompletion.varianceDays > 0 ? `+${s.practicalCompletion.varianceDays}` : s.practicalCompletion.varianceDays} days)` : ""}.` });
  const pkg = db.data.procurement.packages.filter((p) => p.forecastOnSite > p.requiredOnSite && p.status !== "Complete");
  if (pkg.length) lines.push({ tone: "warn", go: "site", text: `${pkg.length} package${pkg.length > 1 ? "s" : ""} late for the work that needs ${pkg.length > 1 ? "them" : "it"}: ${pkg.slice(0, 2).map((p) => p.name).join("; ")}.` });
  for (const f of fm.facilities) {
    const k = f.kpis;
    lines.push({ tone: k.criticalDown || k.criticalAlarms ? "bad" : k.overdueWos || k.availability < 97 ? "warn" : "ok", go: `fm:${f.facility.id}`,
      text: `${f.facility.name}: ${k.availability}% available, ${k.output.name.toLowerCase()} ${k.output.value.toLocaleString("en-US")} of ${k.output.target.toLocaleString("en-US")} ${k.output.unit}${f.top[0] ? ` — ${f.top[0]}` : ""}.` });
  }
  return {
    date: db.data.meta.dataDate, me: user ? publicPerson(user) : null, lines,
    approvals: list, counts: { mine: mine.length, all: list.length, autopilot: list.filter((x) => x.autopilot).length, money: mine.reduce((n, x) => n + (x.cost ?? 0), 0) },
    outcomes: outcomes(db),
  };
}
