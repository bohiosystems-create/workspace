import { prisma } from "./prisma";
import { buildMarketingDashboard } from "./marketing";
import { ensureOracleSynced, buildInvoiceDashboard } from "./invoices";
import { deliverMail, defaultCc, outlookDelivery, outlookMode, outlookSender, outlookSenderName } from "./outlook";

export type Rec = {
  key: string;
  type: "SLA_BREACH" | "CONTRACT_RENEWAL" | "UNDERPERFORMING" | "INVOICE_EXCEPTIONS" | "UNBILLED" | "OVERDUE_PAYMENT" | "REALLOCATE" | "SCALE_UP";
  severity: "crit" | "warn" | "info";
  vendorId: string;
  vendor: string;
  title: string;
  rationale: string;
  evidence: string[]; // facts the email is allowed to cite
  impactK: number | null; // SAR K at stake, when quantifiable
  channel: "EMAIL" | "INTERNAL";
  href?: string; // where an INTERNAL decision is taken
  state: "OPEN" | "DRAFTED" | "SENT" | "DISMISSED";
  emailId: string | null;
};

export type EmailRow = {
  id: string; recKey: string; vendorId: string; vendor: string; to: string; cc: string; subject: string; body: string;
  drafter: string; revision: number; status: string; approvedBy: string | null; approvedAt: string | null;
  sentAt: string | null; delivery: string | null; error: string | null; createdAt: string;
};

const sevRank = { crit: 0, warn: 1, info: 2 } as const;
const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
};
const k1 = (x: number) => Math.round(x * 10) / 10;

// ------------------------------------------------------------ recommendations
export async function buildRecommendations() {
  await ensureOracleSynced();
  const [mkt, inv, vendors, states, emails] = await Promise.all([
    buildMarketingDashboard(),
    buildInvoiceDashboard(),
    prisma.vendor.findMany(),
    prisma.recommendationState.findMany(),
    prisma.outboundEmail.findMany(),
  ]);
  const vName = new Map(vendors.map((v) => [v.id, v.name]));
  const recs: Omit<Rec, "state" | "emailId">[] = [];

  // 1. Contractual SLA breaches → ask the vendor for a remediation plan.
  for (const v of mkt.vendors) {
    if (v.slaBreaches.length === 0) continue;
    const affected = mkt.campaigns.filter((c) => c.vendorId === v.id && c.status === "LIVE");
    recs.push({
      key: `SLA_BREACH:${v.id}:${hash(v.slaBreaches.join("|"))}`,
      type: "SLA_BREACH", severity: v.latestRespHrs !== null && v.latestRespHrs > v.slaResponseHrs * 1.5 ? "crit" : "warn",
      vendorId: v.id, vendor: v.name,
      title: `${v.name} is outside its contractual SLA`,
      rationale: `${v.slaBreaches.join("; ")} (spend-weighted, latest month). Slow response and weak lead quality directly reduce viewings and reservations.`,
      evidence: [
        ...v.slaBreaches.map((b) => `SLA: ${b}`),
        `Live campaigns affected: ${affected.map((c) => c.name).join("; ") || "none"}`,
        `Scorecard: ${v.score}/100 (${v.verdict})`,
      ],
      impactK: k1(affected.reduce((s, c) => s + c.spendK, 0)),
      channel: "EMAIL",
    });
  }

  // 2. Contracts expiring within 3 months → open the renewal conversation on our terms.
  for (const v of mkt.vendors) {
    if (v.monthsToExpiry > 3 || v.monthsToExpiry < 0) continue;
    const end = new Date(v.contractEnd).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    recs.push({
      key: `CONTRACT_RENEWAL:${v.id}:${v.contractEnd.slice(0, 7)}`,
      type: "CONTRACT_RENEWAL", severity: v.verdict === "Review" ? "warn" : "info",
      vendorId: v.id, vendor: v.name,
      title: `${v.name} contract ends ${end}`,
      rationale: `Scorecard ${v.score}/100 (${v.verdict}); cost-to-sales ${v.costToSalesPct ?? "n/a"}%, qualified rate ${v.qualRatePct ?? "n/a"}%. ${v.verdict === "Review" ? "Performance does not currently support a like-for-like renewal — negotiate performance-linked terms." : "Open renewal early to keep leverage."}`,
      evidence: [
        `Contract end date: ${end}`,
        `Spend to date: SAR ${v.spendK}K across ${v.campaigns} campaign(s); ${v.contracts} attributed contracts (SAR ${v.revenueM}M)`,
        `Cost-to-sales ${v.costToSalesPct ?? "n/a"}%; qualified-lead rate ${v.qualRatePct ?? "n/a"}%`,
      ],
      impactK: v.spendK, channel: "EMAIL",
    });
  }

  // 3. Campaigns converting badly → ask for an improvement plan.
  const weakByVendor = new Map<string, typeof mkt.campaigns>();
  for (const c of mkt.campaigns) {
    if (c.status !== "LIVE" || c.health !== "Weak" || c.attribution === "Weak") continue;
    weakByVendor.set(c.vendorId, [...(weakByVendor.get(c.vendorId) ?? []), c]);
  }
  for (const [vendorId, cs] of weakByVendor) {
    recs.push({
      key: `UNDERPERFORMING:${vendorId}:${hash(cs.map((c) => c.id).join("|"))}`,
      type: "UNDERPERFORMING", severity: "crit", vendorId, vendor: vName.get(vendorId)!,
      title: `${cs.length} ${vName.get(vendorId)} campaign${cs.length > 1 ? "s" : ""} not converting into sales`,
      rationale: cs.map((c) => `${c.name}: ${c.costToSalesPct ?? "n/a"}% cost-to-sales, qualified rate ${c.qualRatePct ?? "n/a"}%`).join("; ") + ". Above the 3% ceiling.",
      evidence: cs.flatMap((c) => [
        `${c.name}: SAR ${c.spendK}K spent → ${c.contracts} contracts (SAR ${c.revenueM}M); cost-to-sales ${c.costToSalesPct ?? "n/a"}%`,
        `${c.name}: cost per lead SAR ${c.cplSar ?? "n/a"}${c.cplTrendPct ? ` (${c.cplTrendPct > 0 ? "+" : ""}${c.cplTrendPct}% latest month)` : ""}; qualified rate ${c.qualRatePct ?? "n/a"}%`,
      ]),
      impactK: k1(cs.reduce((s, c) => s + c.remainingK, 0)), channel: "EMAIL",
    });
  }

  // 4. Invoice exceptions → dispute / request credit note or clarification.
  const excByVendor = new Map<string, typeof inv.invoices>();
  for (const r of inv.invoices) {
    if (r.decision === "APPROVED") continue;
    if (!r.flags.some((f) => f.code !== "OVERDUE")) continue;
    if (r.outstandingK === 0 && !r.flags.some((f) => ["OVERBILLED", "VARIANCE", "DUPLICATE"].includes(f.code))) continue;
    excByVendor.set(r.vendorId, [...(excByVendor.get(r.vendorId) ?? []), r]);
  }
  for (const [vendorId, rs] of excByVendor) {
    const crit = rs.some((r) => r.blocked);
    recs.push({
      key: `INVOICE_EXCEPTIONS:${vendorId}:${hash(rs.map((r) => r.id).sort().join("|"))}`,
      type: "INVOICE_EXCEPTIONS", severity: crit ? "crit" : "warn", vendorId, vendor: vName.get(vendorId)!,
      title: `${rs.length} ${vName.get(vendorId)} invoice${rs.length > 1 ? "s need" : " needs"} correction or clarification`,
      rationale: rs.map((r) => `${r.invoiceNumber} (SAR ${r.amountK}K): ${r.flags.filter((f) => f.code !== "OVERDUE").map((f) => f.text).join(" ")}`).join(" "),
      evidence: rs.map((r) => `Invoice ${r.invoiceNumber} dated ${r.invoiceDate.slice(0, 10)}, SAR ${r.amountK}K${r.poNumber ? `, PO ${r.poNumber}` : ", no PO"}: ${r.flags.filter((f) => f.code !== "OVERDUE").map((f) => f.text).join(" ")}`),
      impactK: k1(rs.reduce((s, r) => s + r.amountK, 0)), channel: "EMAIL",
    });
  }

  // 5. Delivered but never invoiced → ask for the invoice (accrue meanwhile).
  const unbByVendor = new Map<string, typeof inv.unbilled>();
  for (const u of inv.unbilled) {
    const vid = vendors.find((v) => v.name === u.vendor)?.id;
    if (vid) unbByVendor.set(vid, [...(unbByVendor.get(vid) ?? []), u]);
  }
  for (const [vendorId, us] of unbByVendor) {
    recs.push({
      key: `UNBILLED:${vendorId}:${hash(us.map((u) => u.campaign + u.period).join("|"))}`,
      type: "UNBILLED", severity: "warn", vendorId, vendor: vName.get(vendorId)!,
      title: `${vName.get(vendorId)} delivered but has not invoiced`,
      rationale: us.map((u) => `${u.campaign} ${u.period}: SAR ${u.deliveredK}K`).join("; ") + ". Accrue the cost and request the invoice.",
      evidence: us.map((u) => `${u.campaign}, ${u.period}: SAR ${u.deliveredK}K delivered, no invoice received`),
      impactK: k1(us.reduce((s, u) => s + u.deliveredK, 0)), channel: "EMAIL",
    });
  }

  // 6. We are paying late → internal decision (approve & schedule payment).
  for (const v of inv.vendors) {
    const late = inv.invoices.filter((r) => r.vendorId === v.id && r.daysOverdue > 0 && r.decision !== "DISPUTED" && !r.blocked);
    if (late.length === 0) continue;
    const amt = k1(late.reduce((s, r) => s + r.outstandingK, 0));
    recs.push({
      key: `OVERDUE_PAYMENT:${v.id}:${hash(late.map((r) => r.id).sort().join("|"))}`,
      type: "OVERDUE_PAYMENT", severity: late.some((r) => r.daysOverdue > 30) ? "crit" : "warn", vendorId: v.id, vendor: v.name,
      title: `SAR ${amt}K overdue to ${v.name}`,
      rationale: `${late.length} clean invoice${late.length > 1 ? "s" : ""} past due (${Math.max(...late.map((r) => r.daysOverdue))} days at most). Late payment puts lead-response and delivery at risk.`,
      evidence: late.map((r) => `${r.invoiceNumber}: SAR ${r.outstandingK}K, ${r.daysOverdue} days overdue`),
      impactK: amt, channel: "INTERNAL", href: "/invoices",
    });
  }

  // 7. Budget moves proposed by the marketing engine (decided internally).
  for (const r of mkt.recommendations) {
    const vendorId = mkt.campaigns.find((c) => c.id === r.campaignId)!.vendorId;
    recs.push({
      key: `REALLOCATE:${r.campaignId}:${r.type}:${"toCampaignId" in r ? r.toCampaignId : ""}`,
      type: "REALLOCATE", severity: r.type === "PAUSE" ? "crit" : "warn", vendorId, vendor: r.vendor,
      title: r.type === "PAUSE" ? `Pause ${r.campaign}` : `Move SAR ${r.amountK}K from ${r.campaign} to ${r.toCampaign}`,
      rationale: `${r.rationale} ${r.impact}`,
      evidence: [r.rationale, r.impact],
      impactK: r.type === "PAUSE" ? null : r.amountK, channel: "INTERNAL", href: "/",
    });
  }

  // 8. Best performer with headroom → consider scaling.
  const best = mkt.vendors.find((v) => v.verdict === "Scale");
  if (best) {
    recs.push({
      key: `SCALE_UP:${best.id}:${best.score}`,
      type: "SCALE_UP", severity: "info", vendorId: best.id, vendor: best.name,
      title: `${best.name} is the strongest converter — consider more budget`,
      rationale: `Scorecard ${best.score}/100, ${best.costToSalesPct ?? "n/a"}% cost-to-sales, ${best.qualRatePct ?? "n/a"}% qualified rate, no SLA breaches. Confirm capacity before increasing spend.`,
      evidence: [`Scorecard ${best.score}/100`], impactK: null, channel: "INTERNAL", href: "/",
    });
  }

  // Attach triage state.
  const dismissed = new Set(states.filter((s) => s.status === "DISMISSED").map((s) => s.key));
  const emailRows: EmailRow[] = emails
    .map((e) => ({
      id: e.id, recKey: e.recKey, vendorId: e.vendorId, vendor: vName.get(e.vendorId) ?? "", to: e.toAddress, cc: e.ccAddresses,
      subject: e.subject, body: e.body, drafter: e.drafter, revision: e.revision, status: e.status, approvedBy: e.approvedBy,
      approvedAt: e.approvedAt ? e.approvedAt.toISOString() : null, sentAt: e.sentAt ? e.sentAt.toISOString() : null,
      delivery: e.delivery, error: e.error, createdAt: e.createdAt.toISOString(),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const emailFor = (key: string) => emailRows.find((e) => e.recKey === key && e.status !== "REJECTED");

  const out: Rec[] = recs.map((r) => {
    const e = emailFor(r.key);
    const state: Rec["state"] = e ? (e.status === "SENT" ? "SENT" : "DRAFTED") : dismissed.has(r.key) ? "DISMISSED" : "OPEN";
    return { ...r, state, emailId: e?.id ?? null };
  });
  out.sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || (b.impactK ?? 0) - (a.impactK ?? 0));

  return {
    recommendations: out,
    outbox: emailRows,
    integration: { mode: outlookMode(), delivery: outlookDelivery(), sender: outlookSender() },
  };
}

// ------------------------------------------------------------------ drafting
const OPENERS: Record<Rec["type"], (r: Rec) => { subject: string; intro: string; ask: string }> = {
  SLA_BREACH: (r) => ({
    subject: `Action required: service levels below contract — ${r.vendor}`,
    intro: "Our latest monthly review shows performance below the service levels set out in our agreement:",
    ask: "Please send us, within 5 business days, the root cause and a dated remediation plan, and confirm how response times and lead quality will be brought back within the contracted levels.",
  }),
  CONTRACT_RENEWAL: (r) => ({
    subject: `Contract renewal discussion — ${r.vendor}`,
    intro: "Ahead of your contract end date, we would like to review the partnership. Our current view of results:",
    ask: "Could you propose a time this month for a review, and bring your recommendations for the next term — including how fees could be linked to qualified leads and contracted sales? This is an invitation to discuss and does not commit either side.",
  }),
  UNDERPERFORMING: (r) => ({
    subject: `Campaign performance review — ${r.vendor}`,
    intro: "The following campaigns are not converting into sales at an acceptable cost:",
    ask: "Please share your diagnosis and a proposed optimisation plan (audience, creative, lead-qualification and follow-up) for each, with the results you expect over the next 30 days. We are reviewing budget allocation in parallel.",
  }),
  INVOICE_EXCEPTIONS: (r) => ({
    subject: `Invoice query — ${r.vendor} (${r.evidence.length} item${r.evidence.length > 1 ? "s" : ""})`,
    intro: "Our accounts payable reconciliation of your invoices against reported delivery and our purchase orders found the items below:",
    ask: "Please provide a corrected invoice or credit note, or supporting documentation for each item. Any of these invoices that are still unpaid cannot be approved for payment until this is resolved; your other invoices are unaffected.",
  }),
  UNBILLED: (r) => ({
    subject: `Missing invoice(s) — ${r.vendor}`,
    intro: "Your campaign reports show delivery for the periods below, but we have not received a matching invoice:",
    ask: "Please submit the invoice(s), quoting the relevant purchase order number, so they can be processed within the agreed payment terms.",
  }),
  OVERDUE_PAYMENT: () => ({ subject: "", intro: "", ask: "" }),
  REALLOCATE: () => ({ subject: "", intro: "", ask: "" }),
  SCALE_UP: () => ({ subject: "", intro: "", ask: "" }),
};

export function templateEmail(r: Rec, contact: string) {
  const o = OPENERS[r.type](r);
  const first = contact.split(" ")[0];
  const body = [
    `Dear ${first},`, "", o.intro, "", ...r.evidence.map((e) => `  • ${e}`), "", o.ask, "",
    "Thank you — happy to discuss by phone if easier.", "", "Kind regards,", outlookSenderName(),
  ].join("\n");
  return { subject: o.subject, body };
}

export type Polish = (draft: { subject: string; body: string }, facts: string[]) => Promise<{ subject: string; body: string } | null>;

export async function createDraft(key: string, polish?: Polish) {
  const { recommendations } = await buildRecommendations();
  const rec = recommendations.find((r) => r.key === key);
  if (!rec) throw new Error("Recommendation not found (the data may have changed — refresh).");
  if (rec.channel !== "EMAIL") throw new Error("This recommendation is an internal decision, not an email.");
  if (rec.state === "SENT") throw new Error("An email for this recommendation has already been sent.");
  if (rec.emailId) throw new Error("A draft already exists for this recommendation.");
  const vendor = await prisma.vendor.findMany().then((vs) => vs.find((v) => v.id === rec.vendorId)!);
  if (!vendor.email) throw new Error(`No email address on file for ${vendor.name}.`);

  let draft = templateEmail(rec, vendor.contact);
  let drafter = "template";
  if (polish) {
    try {
      const p = await polish(draft, rec.evidence);
      if (p && p.subject.trim() && p.body.trim()) { draft = p; drafter = "claude"; }
    } catch { /* fall back to the template */ }
  }
  await prisma.outboundEmail.create({
    data: {
      recKey: key, vendorId: vendor.id, toAddress: vendor.email, ccAddresses: defaultCc().join(", "),
      subject: draft.subject, body: draft.body, drafter, status: "DRAFT", revision: 1,
    },
  });
}

// ------------------------------------------------------------ human approval
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const parseCc = (s: string) => s.split(/[,;]/).map((x) => x.trim()).filter(Boolean);

async function getEmail(id: string) {
  const e = (await prisma.outboundEmail.findMany()).find((x) => x.id === id);
  if (!e) throw new Error("Email not found.");
  return e;
}

export async function updateDraft(a: { id: string; subject: string; body: string; cc: string }) {
  const e = await getEmail(a.id);
  if (e.status === "SENT" || e.status === "REJECTED") throw new Error(`A ${e.status.toLowerCase()} email cannot be edited.`);
  const cc = parseCc(a.cc);
  if (cc.some((c) => !EMAIL_RE.test(c))) throw new Error("One of the cc addresses is not valid.");
  if (!a.subject.trim() || !a.body.trim()) throw new Error("Subject and body are required.");
  await prisma.outboundEmail.update({
    where: { id: e.id },
    data: { subject: a.subject.trim(), body: a.body, ccAddresses: cc.join(", "), revision: e.revision + 1, status: "DRAFT", error: null },
  });
}

// The only path that sends. Requires a named approver and the exact revision they reviewed.
export async function approveAndSend(a: { id: string; approver: string; revision: number }) {
  const e = await getEmail(a.id);
  const approver = a.approver?.trim();
  if (!approver) throw new Error("Approver name is required.");
  if (e.status === "SENT") throw new Error("This email has already been sent.");
  if (e.status === "REJECTED") throw new Error("This draft was rejected.");
  if (e.revision !== a.revision) throw new Error("The draft changed since you reviewed it — review the latest version and approve again.");
  if (/\[\[|\]\]/.test(e.body + e.subject)) throw new Error("The draft still contains a placeholder.");
  const already = (await prisma.outboundEmail.findMany()).find((x) => x.recKey === e.recKey && x.status === "SENT");
  if (already) throw new Error("An email for this recommendation has already been sent.");

  try {
    const res = await deliverMail({ to: e.toAddress, cc: parseCc(e.ccAddresses), subject: e.subject, body: e.body });
    const now = new Date();
    await prisma.outboundEmail.update({
      where: { id: e.id },
      data: { status: "SENT", approvedBy: approver, approvedAt: now, sentAt: now, delivery: res.delivery, providerRef: res.providerRef, error: null },
    });
    await prisma.marketingAction.create({
      data: {
        type: "EMAIL_SENT", campaign: `${(await prisma.vendor.findMany()).find((v) => v.id === e.vendorId)?.name} · ${e.subject}`,
        detail: `${res.delivery === "mock" ? "Simulated send" : res.delivery === "draft" ? "Saved to Outlook drafts" : "Sent"} to ${e.toAddress}; approved by ${approver}.`,
      },
    });
  } catch (err: any) {
    await prisma.outboundEmail.update({ where: { id: e.id }, data: { status: "FAILED", error: err?.message ?? "Send failed." } });
    throw new Error(`Not sent: ${err?.message ?? "delivery failed"}. The draft is kept — you can retry.`);
  }
}

export async function rejectDraft(id: string, approver: string) {
  const e = await getEmail(id);
  if (e.status === "SENT") throw new Error("This email has already been sent.");
  await prisma.outboundEmail.update({ where: { id }, data: { status: "REJECTED", approvedBy: approver?.trim() || null } });
}

export async function setDismissed(key: string, dismissed: boolean) {
  const ex = (await prisma.recommendationState.findMany()).find((s) => s.key === key);
  if (dismissed) {
    if (ex) await prisma.recommendationState.update({ where: { key }, data: { status: "DISMISSED" } });
    else await prisma.recommendationState.create({ data: { key, status: "DISMISSED" } });
  } else if (ex) {
    await prisma.recommendationState.delete({ where: { key } });
  }
}

// Shared request handler (used by the API route and the static demo).
export async function handleRecommendationRequest(b: any, polish?: Polish) {
  switch (b.action) {
    case "DRAFT": return createDraft(String(b.key), polish);
    case "UPDATE": return updateDraft({ id: String(b.id), subject: String(b.subject ?? ""), body: String(b.body ?? ""), cc: String(b.cc ?? "") });
    case "APPROVE_SEND": return approveAndSend({ id: String(b.id), approver: String(b.approver ?? ""), revision: Number(b.revision) });
    case "REJECT": return rejectDraft(String(b.id), String(b.approver ?? ""));
    case "DISMISS": return setDismissed(String(b.key), true);
    case "RESTORE": return setDismissed(String(b.key), false);
    default: throw new Error("Unknown action.");
  }
}
