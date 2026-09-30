import { buildMarketingDashboard } from "./marketing";
import { buildInvoiceDashboard, ensureOracleSynced } from "./invoices";
import { buildRecommendations, createDraft, type Polish, type Rec } from "./recommendations";

// What the chat can put in front of the user besides text. Cards are rendered live from
// current data, so approving / editing an email happens in the card, never through the model.
export type ChatCard = { kind: "rec"; key: string } | { kind: "email"; id: string };
export type ChatReply = { reply: string; cards: ChatCard[]; engine: "claude" | "rules" };

const n = (x: number | null | undefined, suf = "") => (x === null || x === undefined ? "n/a" : `${x}${suf}`);

export async function buildChatContext() {
  await ensureOracleSynced();
  const [mkt, inv, recs] = await Promise.all([buildMarketingDashboard(), buildInvoiceDashboard(), buildRecommendations()]);
  return { mkt, inv, recs };
}
export type ChatContext = Awaited<ReturnType<typeof buildChatContext>>;

// Stable short ids (R1, R2…) for the recommendations as currently ranked.
export const recId = (i: number) => `R${i + 1}`;

// Compact, model-friendly snapshot (no email bodies, no internal keys).
export function snapshotForModel(c: ChatContext) {
  const { mkt, inv, recs } = c;
  return {
    asOf: mkt.asOf.slice(0, 10),
    currency: "SAR (spend/amounts in K, sales in M)",
    totals: { ...mkt.kpis, funnel: mkt.funnel, monthly: mkt.monthly },
    vendors: mkt.vendors.map((v) => ({
      name: v.name, category: v.category, model: v.model, contact: v.contact, contractEnd: v.contractEnd.slice(0, 10),
      spendK: v.spendK, leads: v.leads, contracts: v.contracts, salesM: v.revenueM, costToSalesPct: v.costToSalesPct,
      qualifiedRatePct: v.qualRatePct, latestResponseHrs: v.latestRespHrs, slaResponseHrs: v.slaResponseHrs,
      slaQualifiedPct: v.slaQualifiedPct, slaBreaches: v.slaBreaches, score: v.score, verdict: v.verdict,
    })),
    campaigns: mkt.campaigns.map((x) => ({
      name: x.name, vendor: x.vendor, asset: x.asset, channel: x.channel, status: x.status, budgetK: x.budgetK, spendK: x.spendK,
      pacingPct: x.pacingPct, leads: x.leads, cplSar: x.cplSar, qualifiedRatePct: x.qualRatePct, viewings: x.viewings,
      reservations: x.reservations, contracts: x.contracts, salesM: x.revenueM, cacK: x.cacK, costToSalesPct: x.costToSalesPct,
      cplTrendPct: x.cplTrendPct, attribution: x.attribution, health: x.health,
    })),
    assets: mkt.assets,
    marketingAlerts: mkt.alerts.map((a) => `${a.severity}: ${a.title}`),
    invoices: {
      kpis: inv.kpis, oracleMode: inv.integration.mode,
      vendorPayables: inv.vendors.map((v) => ({ vendor: v.name, invoicedK: v.invoicedK, deliveredK: v.deliveredK, outstandingK: v.outstandingK, overdueK: v.overdueK, unbilledK: v.unbilledK })),
      exceptions: inv.invoices.filter((r) => r.flags.length).map((r) => ({
        invoice: r.invoiceNumber, vendor: r.vendor, campaign: r.campaign, amountK: r.amountK, payment: r.payment, decision: r.decision,
        flags: r.flags.map((f) => f.text),
      })),
      deliveredNotInvoiced: inv.unbilled,
      poUtilisation: inv.purchaseOrders.filter((p) => p.utilisationPct >= 90),
    },
    recommendations: recs.recommendations.map((r, i) => ({
      id: recId(i), type: r.type, severity: r.severity, vendor: r.vendor, title: r.title, rationale: r.rationale,
      impactK: r.impactK, handling: r.channel === "EMAIL" ? "email to vendor (needs human approval)" : "internal decision", state: r.state,
    })),
  };
}

// ------------------------------------------------------------- tool helpers
export function recCards(c: ChatContext, ids: string[]): ChatCard[] {
  return ids
    .map((id) => Number(id.replace(/\D/g, "")) - 1)
    .filter((i) => i >= 0 && i < c.recs.recommendations.length)
    .map((i) => ({ kind: "rec" as const, key: c.recs.recommendations[i].key }));
}

// Creates a DRAFT only. Sending is a separate, human-approved step in the UI.
export async function draftForRec(c: ChatContext, id: string, polish?: Polish): Promise<{ ok: boolean; message: string; card?: ChatCard }> {
  const i = Number(id.replace(/\D/g, "")) - 1;
  const rec: Rec | undefined = c.recs.recommendations[i];
  if (!rec) return { ok: false, message: `No recommendation ${id}.` };
  if (rec.channel !== "EMAIL") return { ok: false, message: `${id} is an internal decision, not an email to the vendor.` };
  if (rec.state === "SENT") return { ok: false, message: `An email for ${id} was already sent.` };
  if (rec.state !== "DRAFTED") {
    try { await createDraft(rec.key, polish); } catch (e: any) { return { ok: false, message: e.message }; }
  }
  const fresh = await buildRecommendations();
  const email = fresh.outbox.find((e) => e.recKey === rec.key && e.status !== "REJECTED");
  if (!email) return { ok: false, message: "Draft could not be created." };
  return { ok: true, message: `Draft created for ${rec.vendor}: "${email.subject}". It has NOT been sent; the user must review and approve it.`, card: { kind: "email", id: email.id } };
}

// ----------------------------------------------------------- rules answerer
const STOP = new Set(["the", "and", "for", "of", "a", "to", "in", "on", "is", "are", "what", "how", "about", "tell", "me", "show", "my", "our", "with", "campaign", "campaigns"]);
const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t));

function findVendor(q: string, c: ChatContext) {
  const ql = q.toLowerCase();
  return c.mkt.vendors.find((v) => ql.includes(v.name.toLowerCase())) ??
    c.mkt.vendors.find((v) => tokens(v.name).some((t) => t.length > 4 && ql.includes(t) && !["digital", "network", "communications", "influence", "brokerage"].includes(t))) ?? null;
}
function findCampaign(q: string, c: ChatContext) {
  const qt = new Set(tokens(q));
  let best: { c: (typeof c.mkt.campaigns)[number]; score: number } | null = null;
  for (const x of c.mkt.campaigns) {
    const score = tokens(`${x.name} ${x.channel}`).filter((t) => qt.has(t)).length;
    if (score >= 2 && (!best || score > best.score)) best = { c: x, score };
  }
  return best?.c ?? null;
}

const recLine = (r: Rec, i: number) => `- **${recId(i)}** [${r.severity === "crit" ? "urgent" : r.severity === "warn" ? "important" : "FYI"}] ${r.title}${r.impactK ? ` (SAR ${r.impactK}K)` : ""}`;

export async function localAnswer(question: string, ctx?: ChatContext, polish?: Polish): Promise<ChatReply> {
  const c = ctx ?? (await buildChatContext());
  const q = question.toLowerCase();
  const { mkt, inv, recs } = c;
  const cards: ChatCard[] = [];
  const done = (reply: string): ChatReply => ({ reply, cards, engine: "rules" });
  const active = recs.recommendations.map((r, i) => ({ r, i })).filter((x) => x.r.state === "OPEN" || x.r.state === "DRAFTED");

  const vendor = findVendor(question, c);
  const campaign = findCampaign(question, c);
  const recRef = q.match(/\br\s?(\d{1,2})\b/);

  // 1. Draft an email (explicit request).
  if (/\b(draft|write|compose|email|e-mail|mail)\b/.test(q) && (vendor || recRef || /worst|first|top|most urgent/.test(q))) {
    let targets = active.filter((x) => x.r.channel === "EMAIL");
    if (recRef) targets = targets.filter((x) => x.i === Number(recRef[1]) - 1);
    else if (vendor) targets = targets.filter((x) => x.r.vendorId === mkt.vendors.find((v) => v.name === vendor.name)!.id);
    else targets = targets.slice(0, 1);
    if (targets.length === 0) return done(`There is nothing to email ${vendor ? vendor.name : "about"} right now — no open recommendation needs a vendor email.`);
    if (targets.length === 1) {
      const d = await draftForRec(c, recId(targets[0].i), polish);
      if (d.card) cards.push(d.card);
      return done(d.ok ? `I've drafted it (${recId(targets[0].i)}: ${targets[0].r.title}). Nothing has been sent — review the message below, edit it if you like, then approve to send.` : d.message);
    }
    cards.push(...targets.map((x) => ({ kind: "rec" as const, key: x.r.key })));
    return done(`There are ${targets.length} open items for ${vendor?.name ?? "that vendor"}. Which one should I draft an email for? Use "Draft email" on the card, or say e.g. "draft R${targets[0].i + 1}".`);
  }

  // 2. Recommendations / next steps.
  if (/recommend|what should|next step|priorit|to.?do|action|what now|first\b|urgent|advice|suggest/.test(q) && !vendor) {
    const top = active.slice(0, 5);
    cards.push(...top.map((x) => ({ kind: "rec" as const, key: x.r.key })));
    return done(`There are ${active.length} open recommendations. The most important:\n${top.map((x) => recLine(x.r, x.i)).join("\n")}\n\nI can draft the vendor email for any of them — say "draft R${(top[0]?.i ?? 0) + 1}" or use the button on a card. Emails are only sent after you approve them.`);
  }

  // 3. A specific campaign.
  if (campaign) {
    return done(
      `**${campaign.name}** (${campaign.vendor}, ${campaign.asset}, ${campaign.status.toLowerCase()})\n` +
      `- Spend SAR ${campaign.spendK}K of ${campaign.budgetK}K budget (pacing ${n(campaign.pacingPct, "%")})\n` +
      `- Funnel: ${campaign.leads} leads → ${campaign.qualified} qualified (${n(campaign.qualRatePct, "%")}) → ${campaign.viewings} viewings → ${campaign.reservations} reservations → ${campaign.contracts} contracts\n` +
      `- Sales SAR ${campaign.revenueM}M; cost-to-sales ${n(campaign.costToSalesPct, "%")}; CAC SAR ${n(campaign.cacK, "K")}; cost per lead SAR ${n(campaign.cplSar)}${campaign.cplTrendPct ? ` (${campaign.cplTrendPct > 0 ? "+" : ""}${campaign.cplTrendPct}% latest month)` : ""}\n` +
      `- Health: ${campaign.health}${campaign.attribution === "Weak" ? " — brand channel, so last-touch attribution understates its sales" : ""}`
    );
  }

  // 4. A specific vendor.
  if (vendor) {
    const v = vendor;
    const row = inv.vendors.find((x) => x.id === v.id);
    const mine = active.filter((x) => x.r.vendorId === v.id);
    cards.push(...mine.slice(0, 4).map((x) => ({ kind: "rec" as const, key: x.r.key })));
    return done(
      `**${v.name}** — ${v.category}, scorecard ${v.score}/100 (${v.verdict})\n` +
      `- SAR ${v.spendK}K spend across ${v.campaigns} campaign(s) → ${v.contracts} contracts, SAR ${v.revenueM}M sales (cost-to-sales ${n(v.costToSalesPct, "%")})\n` +
      `- Qualified-lead rate ${n(v.qualRatePct, "%")}; response ${n(v.latestRespHrs, "h")} vs ${v.slaResponseHrs}h SLA${v.slaBreaches.length ? ` — breaches: ${v.slaBreaches.join("; ")}` : " — within SLA"}\n` +
      (row ? `- Payables: invoiced SAR ${row.invoicedK}K, outstanding ${row.outstandingK}K, overdue ${row.overdueK}K, delivered-not-invoiced ${row.unbilledK}K\n` : "") +
      `- Contract ends ${new Date(v.contractEnd).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}\n` +
      (mine.length ? `\n${mine.length} open recommendation${mine.length > 1 ? "s" : ""} for this vendor:` : "\nNo open recommendations for this vendor.")
    );
  }

  // 5. Invoices / Oracle.
  if (/invoice|overdue|unbill|payable|oracle|\bpo\b|purchase order|payment|pay\b/.test(q)) {
    const k = inv.kpis;
    const exc = inv.invoices.filter((r) => r.flags.some((f) => f.code !== "OVERDUE") && r.outstandingK > 0 && r.decision === "PENDING");
    cards.push(...active.filter((x) => ["INVOICE_EXCEPTIONS", "UNBILLED", "OVERDUE_PAYMENT"].includes(x.r.type)).slice(0, 4).map((x) => ({ kind: "rec" as const, key: x.r.key })));
    return done(
      `Supplier invoices (Oracle ${inv.integration.mode}): SAR ${k.invoicedK}K invoiced, ${k.outstandingK}K outstanding, **${k.overdueK}K overdue**, ${k.flaggedK}K blocked by reconciliation exceptions, ${k.unbilledK}K delivered but not yet invoiced.\n` +
      (exc.length ? `Exceptions to resolve:\n${exc.slice(0, 5).map((r) => `- ${r.invoiceNumber} (${r.vendor}, SAR ${r.amountK}K): ${r.flags.filter((f) => f.code !== "OVERDUE").map((f) => f.text).join(" ")}`).join("\n")}` : "No unresolved exceptions.")
    );
  }

  // 6. Contracts.
  if (/contract|renew|expir|agreement/.test(q) && !/contracts?\s*(signed|closed|count)|sales/.test(q)) {
    const list = [...mkt.vendors].sort((a, b) => a.monthsToExpiry - b.monthsToExpiry);
    cards.push(...active.filter((x) => x.r.type === "CONTRACT_RENEWAL").slice(0, 3).map((x) => ({ kind: "rec" as const, key: x.r.key })));
    return done(`Vendor contracts by end date:\n${list.map((v) => `- ${v.name}: ${new Date(v.contractEnd).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} (${v.monthsToExpiry} month${v.monthsToExpiry === 1 ? "" : "s"}) — score ${v.score}, ${v.verdict}`).join("\n")}`);
  }

  // 7. Best / worst.
  if (/best|top|strong|convert|winner|perform|worst|weak|bad|under|poor|lowest|cheapest|expensive/.test(q)) {
    const live = mkt.campaigns.filter((x) => x.status === "LIVE" && x.costToSalesPct !== null && x.attribution === "Direct").sort((a, b) => a.costToSalesPct! - b.costToSalesPct!);
    const vs = mkt.vendors;
    cards.push(...active.filter((x) => ["UNDERPERFORMING", "SCALE_UP", "REALLOCATE"].includes(x.r.type)).slice(0, 3).map((x) => ({ kind: "rec" as const, key: x.r.key })));
    return done(
      `Vendors by scorecard:\n${vs.map((v) => `- ${v.name}: ${v.score}/100 (${v.verdict}), cost-to-sales ${n(v.costToSalesPct, "%")}`).join("\n")}\n\n` +
      `Most efficient live campaigns (cost-to-sales): ${live.slice(0, 3).map((x) => `${x.name} ${x.costToSalesPct}%`).join("; ")}.\n` +
      `Least efficient: ${live.slice(-3).reverse().map((x) => `${x.name} ${x.costToSalesPct}%`).join("; ")}. PR and outdoor are last-touch under-attributed.`
    );
  }

  // 8. Totals / funnel.
  if (/spend|sales|revenue|lead|funnel|conversion|cac|total|overall|summary|how are we|how is/.test(q)) {
    const f = mkt.funnel;
    const m = mkt.monthly;
    return done(
      `Overall (Jan–May 2026): SAR ${mkt.kpis.spendK}K spend → ${f.map((x) => `${x.value} ${x.stage.toLowerCase()}`).join(" → ")}; SAR ${mkt.kpis.revenueM}M contracted sales. Blended cost-to-sales ${n(mkt.kpis.costToSalesPct, "%")}, CAC SAR ${n(mkt.kpis.cacK, "K")} per contract.\n` +
      `Latest month (${m[m.length - 1].month}): SAR ${m[m.length - 1].spendK}K spend, ${m[m.length - 1].contracts} contracts, SAR ${m[m.length - 1].revenueM}M sales.\n` +
      `By asset: ${mkt.assets.map((a) => `${a.asset} SAR ${a.revenueM}M (${n(a.costToSalesPct, "%")})`).join("; ")}.`
    );
  }

  // Fallback.
  cards.push(...active.slice(0, 3).map((x) => ({ kind: "rec" as const, key: x.r.key })));
  return done(
    `I can answer questions about the vendors, campaigns, results, sales conversion and supplier invoices, and I can draft vendor emails for you to approve. Try: "which vendor converts best?", "how is Ash Shati Broker Push doing?", "any invoice problems?", "draft an email to Hajar Outdoor".\n\nRight now the top open items are:`
  );
}
