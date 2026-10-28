// Who is who, and who may approve what. Everyone is known by their mobile number: the same number signs in to the
// app (by sending a code from WhatsApp, lib/auth/session.ts), talks to the agent on WhatsApp, and opens the field app.
// The directory is built from the project contacts and the facility teams, plus people an admin adds in the app and
// the admins named in KINAN_ADMINS. Pure (no Node APIs), so the standalone page uses it too.
import type { Db } from "../types";
import { PLANTS, techPhone } from "../fm/data";
import { GAS_CONTRACTORS, GAS_CREWS } from "../fm/gasplant";
import { HAS_OPERATIONS } from "../edition";

export type Role = "guest" | "field" | "supervisor" | "manager" | "director" | "admin";
export type Risk = "low" | "medium" | "high";
/** Which proposals a person deals with: construction ("site"), operations ("fm"), or both. */
export type Domain = "site" | "fm" | "all";
/** Who someone works for. Only the client's own staff approve the client's decisions; a contractor's people carry out
 *  and report their own work; consultants advise; authorities inspect. */
export type OrgType = "client" | "contractor" | "consultant" | "authority";

export interface Person {
  id: string; name: string; phone: string; role: Role; title: string; org: string; domain: Domain;
  /** an operations person belongs to one facility (approvals there only, unless director/admin) */
  facilityId?: string;
  /** the technician record behind an operations person (their jobs in the field app) */
  techId?: string;
  /** a contractor crew's lead: the crew they run (its jobs in the field app) */
  crewId?: string;
  /** client / contractor / consultant / authority, from the organisation (orgTypeOf) */
  orgType: OrgType;
  /** the organisation's key (orgKey): the same company however it is written ("Al-Bunyan Contracting (Main Contractor)") */
  orgId: string;
  source: "directory" | "admin" | "env";
}
/** A person added or changed by an admin (kept in the database). */
export interface PersonEdit { phone: string; name: string; role: Role; title?: string; org?: string; domain?: Domain; facilityId?: string; removed?: boolean; by: string; at: string }

/** What each role may approve: the highest risk, and the most money one approval may commit (SAR). */
export const LIMITS: Record<Role, { risk: Risk | null; spend: number; label: string }> = {
  guest: { risk: null, spend: 0, label: "Can ask and report; approves nothing" },
  field: { risk: null, spend: 0, label: "Updates their own work and reports faults; approves nothing" },
  supervisor: { risk: "low", spend: 25_000, label: "Approves low-risk proposals up to SAR 25,000" },
  manager: { risk: "medium", spend: 250_000, label: "Approves low and medium risk up to SAR 250,000; signs autopilot policies" },
  director: { risk: "high", spend: Infinity, label: "Approves anything; signs autopilot policies" },
  admin: { risk: "high", spend: Infinity, label: "Approves anything; manages people and roles" },
};
export const ROLE_LABEL: Record<Role, string> = { guest: "Guest", field: "Field team", supervisor: "Supervisor", manager: "Manager", director: "Director", admin: "Admin" };
const RANK: Record<Risk, number> = { low: 0, medium: 1, high: 2 };

/** One key per company, however it is written: "Al-Bunyan Contracting (Main Contractor)" → "al-bunyan-contracting". */
export const orgKey = (org: string) => String(org ?? "").replace(/\(.*?\)/g, "").trim().toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, "-").replace(/^-+|-+$/g, "");
/** The client is Kinan (its project team and the facilities it operates); the rest work for it, advise it or inspect. */
export function orgTypeOf(org: string): OrgType {
  if (/kinan/i.test(org)) return "client";
  if (/consultant/i.test(org)) return "consultant";
  if (/civil defen[cs]e|red crescent|authority|ministry|municipality/i.test(org)) return "authority";
  return "contractor";
}
/** Safety decisions anyone with a safety duty may take, whoever they work for: closing expired permits, stopping work,
 *  calling a robot back. Low risk only — they stop things, they don't commit money. */
export const SAFETY_KINDS = new Set(["permit_close", "permit", "safety_stop", "robot_recall", "security_response"]);
const SAFETY_DUTY = /\bhse\b|safety|permit|security/i;

export const digits = (x: string) => String(x ?? "").replace(/\D/g, "");

/** The construction team's role from their job title and company. */
function siteRole(title: string, company: string): Role {
  if (/director/i.test(title)) return "director";
  if (/kinan/i.test(company) && /manager/i.test(title)) return "manager";
  if (/project manager|construction manager/i.test(title)) return "supervisor";
  return "field";
}
function fmRole(title: string): Role {
  if (/manager/i.test(title)) return "manager";
  if (/supervisor/i.test(title)) return "supervisor";
  return "field";
}

/** The facility teams (names, roles and numbers are fixed in lib/fm/data). */
const fmTeams = () => PLANTS.map((P, pi) => ({ facilityId: P.f.id, facility: P.f.name, techs: P.techs.map(([name, role], i) => ({ id: `${P.f.id}:t${i + 1}`, name, role, phone: techPhone(pi, i) })) }));

/** KINAN_ADMINS="966548363683:Matteo Bevilacqua,16122109689:Elric Wan" — full rights, everywhere. */
function envAdmins(env: Record<string, string | undefined>): Person[] {
  return String(env.KINAN_ADMINS ?? "").split(",").map((x) => x.trim()).filter(Boolean).map((e) => {
    const [num, ...rest] = e.split(":");
    const phone = digits(num);
    return { id: `p_${phone}`, name: rest.join(":").trim() || `+${phone}`, phone, role: "admin" as Role, title: "Administrator", org: "Kinan", orgType: "client" as OrgType, orgId: "kinan", domain: "all" as Domain, source: "env" as const };
  }).filter((p) => p.phone.length >= 8);
}

export function directory(db: Db, env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {}): Person[] {
  const out = new Map<string, Person>();
  const put = (p: Person) => { if (p.phone) out.set(p.phone, p); };
  for (const c of db.data?.contacts ?? []) {
    const phone = digits(c.phone);
    put({ id: `p_${phone}`, name: c.name, phone, role: siteRole(c.role, c.company), title: c.role, org: c.company, orgType: orgTypeOf(c.company), orgId: orgKey(c.company), domain: "site", source: "directory" });
  }
  for (const t of HAS_OPERATIONS ? fmTeams() : []) for (const x of t.techs) {
    const phone = digits(x.phone);
    put({ id: `p_${phone}`, name: x.name, phone, role: fmRole(x.role), title: x.role, org: t.facility, orgType: orgTypeOf(t.facility), orgId: orgKey(t.facility), domain: "fm", facilityId: t.facilityId, techId: x.id, source: "directory" });
  }
  // contractor crew leads at the facilities: they see and report their crew's jobs, and approve no client decision
  for (const c of HAS_OPERATIONS ? GAS_CREWS : []) {
    const phone = digits(c.leadPhone), org = GAS_CONTRACTORS.find((k) => k.id === c.contractorId)?.name ?? "Contractor";
    put({ id: `p_${phone}`, name: c.lead, phone, role: "supervisor", title: `Crew lead — ${c.name}`, org, orgType: orgTypeOf(org), orgId: orgKey(org), domain: "fm", facilityId: c.facilityId, crewId: c.id, source: "directory" });
  }
  // a demo executive who sees both sides (construction and operations)
  put({ id: "p_966500000001", name: "Executive (demo)", phone: "966500000001", role: "director", title: "Chief Operating Officer (demo)", org: "Kinan", orgType: "client", orgId: "kinan", domain: "all", source: "directory" });
  for (const e of db.people ?? []) {
    const phone = digits(e.phone);
    if (e.removed) { out.delete(phone); continue; }
    const before = out.get(phone);
    const org = e.org || before?.org || "Kinan";
    put({ ...(before ?? { id: `p_${phone}`, source: "admin" as const, title: ROLE_LABEL[e.role as Role] }), name: e.name || before?.name || `+${phone}`, phone, role: e.role,
      ...(e.title ? { title: e.title } : {}), org, orgType: orgTypeOf(org), orgId: orgKey(org), domain: e.domain ?? before?.domain ?? "all", ...(e.facilityId ? { facilityId: e.facilityId } : {}), source: before?.source === "directory" ? "directory" : "admin" } as Person);
  }
  for (const a of envAdmins(env)) put({ ...(out.get(a.phone) ?? {}), ...a, name: a.name.startsWith("+") ? out.get(a.phone)?.name ?? a.name : a.name });
  return [...out.values()];
}
export const findByPhone = (db: Db, phone: string) => { const d = digits(phone); return d ? directory(db).find((p) => p.phone === d) : undefined; };
export const findById = (db: Db, id: string) => directory(db).find((p) => p.id === id);

/** May this person approve this proposal? With the reason when not.
 *  `kind` is the kind of proposal (safety decisions have their own rule); `party` is the company it concerns — the one
 *  paid, chased or escalated to — which can't decide about itself. */
export function canApprove(p: Person | null | undefined, a: { domain: "site" | "fm"; facilityId?: string; risk: Risk; cost?: number; kind?: string; party?: string }): { ok: boolean; why?: string } {
  if (!p) return { ok: false, why: "Sign in to approve." };
  if (a.party && p.orgId && orgKey(a.party) === p.orgId) return { ok: false, why: `It concerns ${p.org}, ${p.name.split(" ")[0]}'s own company — someone else decides it.` };
  const safety = !!a.kind && SAFETY_KINDS.has(a.kind) && a.risk === "low" && SAFETY_DUTY.test(p.title);
  if (p.orgType !== "client" && p.role !== "admin" && !safety)
    return { ok: false, why: `${p.org} is ${p.orgType === "authority" ? "an authority" : `a ${p.orgType}`} here: its people carry out and report their own work; the client's staff approve.` };
  // where they work comes first, a safety duty included: an HSE officer stops work on their own site or facility
  if (p.domain !== "all" && p.domain !== a.domain) return { ok: false, why: `${p.name} approves ${p.domain === "site" ? "construction" : "operations"} proposals only.` };
  if (a.domain === "fm" && p.facilityId && a.facilityId && p.facilityId !== a.facilityId && p.role !== "director" && p.role !== "admin") return { ok: false, why: "Another facility's proposal." };
  if (safety) return { ok: true };
  const lim = LIMITS[p.role];
  if (!lim.risk) return { ok: false, why: `${ROLE_LABEL[p.role]}: ${lim.label.toLowerCase()}.` };
  if (RANK[a.risk] > RANK[lim.risk]) return { ok: false, why: `${a.risk} risk needs a ${a.risk === "high" ? "director" : "manager"}.` };
  if ((a.cost ?? 0) > lim.spend) return { ok: false, why: `SAR ${Math.round(a.cost ?? 0).toLocaleString("en-US")} is above the ${ROLE_LABEL[p.role].toLowerCase()} limit of SAR ${lim.spend.toLocaleString("en-US")}.` };
  return { ok: true };
}
/** Turning autopilot on, and signing what it may do, is a manager's call for their facility (or a director's). */
export function canSetPolicy(p: Person | null | undefined, facilityId: string): { ok: boolean; why?: string } {
  if (!p) return { ok: false, why: "Sign in as a manager to change the autopilot." };
  if (p.role === "director" || p.role === "admin") return { ok: true };
  if (p.role !== "manager") return { ok: false, why: "Only a manager or director can sign the autopilot policy." };
  if (p.domain === "site") return { ok: false, why: "A construction manager doesn't run a facility's autopilot." };
  if (p.facilityId && p.facilityId !== facilityId) return { ok: false, why: "Another facility's autopilot." };
  return { ok: true };
}
/** The public view of a person (no phone number) — for the sign-in list and the "who approved" line. */
export const publicPerson = (p: Person) => ({ id: p.id, name: p.name, role: p.role, roleLabel: ROLE_LABEL[p.role], title: p.title, org: p.org, orgType: p.orgType, domain: p.domain, facilityId: p.facilityId, techId: p.techId, crewId: p.crewId, limits: limitsLabel(p) });
/** What this person may approve, in words: a contractor's or consultant's people approve no client decision. */
export function limitsLabel(p: Person): string {
  if (p.orgType === "client" || p.role === "admin") return LIMITS[p.role].label;
  return `Works for ${p.org} (${p.orgType}): carries out and reports their own work; approves no client decisions${SAFETY_DUTY.test(p.title) ? "; closes expired permits and stops unsafe work" : ""}`;
}
export type PublicPerson = ReturnType<typeof publicPerson>;
