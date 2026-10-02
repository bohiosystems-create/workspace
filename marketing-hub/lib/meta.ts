// Meta (Facebook / Instagram) ads connector — and "which agency runs this campaign?".
//
// META_MODE=mock (default)  sample ad accounts and campaigns, consistent with the campaign data
// META_MODE=live            Marketing API (Graph): META_ACCESS_TOKEN (system-user token with ads_read +
//                           business_management), META_AD_ACCOUNT_IDS (act_…, comma-separated), META_API_VERSION.
//                           Written against the Marketing API docs; NOT yet run against a real account.
// META_MODE=off             no Meta connector (ad-platform rows come from ADS_MODE only)
//
// Meta does not label a campaign with the agency that runs it, so the agent infers it from evidence:
//   NAME_CODE       our campaign code in the campaign name                     (strong)
//   UTM_CODE        utm_campaign on the campaign's ads equals a campaign code   (strong — also what ties CRM leads)
//   CREATOR         who created it (ad-account activity log) → a known agency   (strong)
//   ACCOUNT_OWNER   the ad account is owned by an agency's Business Manager     (supporting)
// Outcomes: VENDOR (with HIGH / MEDIUM / LOW confidence), IN_HOUSE (the client's own people), UNKNOWN_AGENCY
// (created by a business that is not one of the vendors), CONFLICT (evidence points at two vendors), UNRESOLVED.
// The manager confirms or corrects; a confirmation can teach the agent the creator ("remember"), which
// re-attributes that creator's other campaigns. Only attributed spend (HIGH/MEDIUM or confirmed) flows into
// the ad-platform figures that check the vendors' reported spend.
import { prisma } from "./prisma";
import { single, serial } from "./single";
import { mockRows, upsertAdRows } from "./adaccounts";
import { ensureMarketingSeeded } from "./seed-marketing";
import { type Lang, tx, nm, K } from "./i18n";

export const metaMode = () => (process.env.META_MODE === "live" ? "live" : process.env.META_MODE === "off" ? "off" : "mock");
const r1 = (x: number) => Math.round(x * 10) / 10;

type Week = { week: string; spendK: number; impressionsK: number; clicks: number; leads: number };
type RawAccount = { id: string; name: string; ownerBusinessId: string | null; ownerBusinessName: string | null; agencies: { id: string; name: string }[]; currency: string };
type RawCampaign = {
  id: string; accountId: string; name: string; objective: string | null; status: string; createdTime: Date | null;
  creatorId: string | null; creatorName: string | null; creatorBusinessId: string | null; creatorBusinessName: string | null;
  utm: string[]; weeks: Week[];
};
export type Signal = { type: "NAME_CODE" | "UTM_CODE" | "CREATOR" | "CREATOR_IN_HOUSE" | "CREATOR_UNKNOWN" | "ACCOUNT_OWNER"; vendorId: string | null; weight: number; code?: string; who?: string };

// ------------------------------------------------------------------ sample
const CLIENT_BIZ = { id: "100200300400500", name: "Bohio Developments" };
const BIZ: Record<string, { id: string; name: string }> = {
  "Tasweeq Digital": { id: "552100000000123", name: "Tasweeq Digital" },
  "Sada Influence": { id: "563400000000456", name: "Sada Influence" },
  "Nakhla Communications": { id: "570200000000789", name: "Nakhla Communications" },
};
const OUTSIDER = { id: "109900000000321", name: "Digital Wave Agency" };

function mondays(from: string, to: string) {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  for (; d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 7)) out.push(d.toISOString().slice(0, 10));
  return out;
}

async function fetchMock(): Promise<{ accounts: RawAccount[]; campaigns: RawCampaign[] }> {
  const meta = (await mockRows()).filter((r) => r.platform === "META");
  const byCode = (code: string, share = 1, rest = false): Week[] => {
    const rows = meta.filter((r) => r.campaignCode === code).sort((a, b) => a.week.localeCompare(b.week));
    return rows.map((r) => {
      const main = (x: number, digits = 1) => Math.round(x * share * 10 ** digits) / 10 ** digits;
      const pick = (x: number, digits = 1) => (rest ? r1(x - main(x, digits)) : main(x, digits));
      return { week: r.week, spendK: pick(r.spendK), impressionsK: Math.round(rest ? r.impressionsK - Math.round(r.impressionsK * share) : r.impressionsK * share), clicks: Math.round(rest ? r.clicks - Math.round(r.clicks * share) : r.clicks * share), leads: rest ? r.platformLeads - Math.round(r.platformLeads * share) : Math.round(r.platformLeads * share) };
    });
  };
  const flat = (weeks: string[], spendK: number, leads: number, impPerK = 40): Week[] => weeks.map((w) => ({ week: w, spendK, impressionsK: Math.round(spendK * impPerK), clicks: Math.round(spendK * 95), leads }));
  const T = BIZ["Tasweeq Digital"], S = BIZ["Sada Influence"];
  const accounts: RawAccount[] = [
    { id: "act_220100100", name: "Bohio Developments — Main", ownerBusinessId: CLIENT_BIZ.id, ownerBusinessName: CLIENT_BIZ.name, currency: "SAR", agencies: [T, S, BIZ["Nakhla Communications"], OUTSIDER] },
    { id: "act_220200200", name: "TD | Bohio Andalus", ownerBusinessId: T.id, ownerBusinessName: T.name, currency: "SAR", agencies: [] },
  ];
  const c = (id: string, accountId: string, name: string, objective: string, status: string, created: string, creator: [string, string], biz: { id: string; name: string }, utm: string[], weeks: Week[]): RawCampaign =>
    ({ id, accountId, name, objective, status, createdTime: new Date(created), creatorId: creator[0], creatorName: creator[1], creatorBusinessId: biz.id, creatorBusinessName: biz.name, utm, weeks });
  const campaigns: RawCampaign[] = [
    c("120200000000001", "act_220100100", "ASH-SEARCH-26 | Ash Shati | Leads | Always-on", "OUTCOME_LEADS", "ACTIVE", "2025-12-28", ["61550001", "Layla Nasser"], T, ["ASH-SEARCH-26"], byCode("ASH-SEARCH-26")),
    c("120200000000002", "act_220200200", "AND-OFFPLAN-26 | Andalus launch | Lead form", "OUTCOME_LEADS", "ACTIVE", "2026-01-29", ["61550002", "Fahad Al-Harbi"], T, ["AND-OFFPLAN-26"], byCode("AND-OFFPLAN-26", 0.8)),
    c("120200000000003", "act_220200200", "Andalus | Retargeting | 30-day site visitors", "OUTCOME_LEADS", "ACTIVE", "2026-02-15", ["61550002", "Fahad Al-Harbi"], T, [], byCode("AND-OFFPLAN-26", 0.8, true)),
    c("120200000000004", "act_220100100", "ASH-CREATOR-26 – Lifestyle creators (partnership ads)", "OUTCOME_ENGAGEMENT", "ACTIVE", "2026-01-04", ["61550011", "Noor Bakri"], S, ["ASH-CREATOR-26"], byCode("ASH-CREATOR-26")),
    c("120200000000005", "act_220100100", "Andalus creators — launch wave", "OUTCOME_ENGAGEMENT", "PAUSED", "2026-02-02", ["61550011", "Noor Bakri"], S, ["AND-CREATOR-26"], byCode("AND-CREATOR-26")),
    c("120200000000006", "act_220100100", "Marina Tower | Corniche video views", "OUTCOME_AWARENESS", "ACTIVE", "2026-04-01", ["61550003", "Omar Saleh"], T, ["MAR-OOH-26"], flat(mondays("2026-04-01", "2026-05-31"), 4.2, 0, 260)),
    c("120200000000007", "act_220100100", "Boosted post: Ramadan payment plan", "OUTCOME_ENGAGEMENT", "ARCHIVED", "2026-02-20", ["61550099", "Bohio Developments (page admin)"], CLIENT_BIZ, [], flat(mondays("2026-02-23", "2026-03-16"), 1.5, 3)),
    c("120200000000008", "act_220100100", "New campaign 14/05", "OUTCOME_LEADS", "ACTIVE", "2026-05-14", ["61550777", "Rami K."], OUTSIDER, [], flat(mondays("2026-05-15", "2026-05-31"), 4, 11)),
  ];
  return { accounts, campaigns };
}

const ensureSampleIdentities = single(async function ensureSampleIdentitiesImpl() {
  if (metaMode() !== "mock" || (await prisma.metaIdentity.count()) > 0) return;
  const vendors = await prisma.vendor.findMany();
  await prisma.metaIdentity.create({ data: { kind: "BUSINESS", value: CLIENT_BIZ.id, label: CLIENT_BIZ.name, inHouse: true, createdBy: "sample" } });
  for (const [name, b] of Object.entries(BIZ)) {
    const v = vendors.find((x) => x.name === name);
    if (v) await prisma.metaIdentity.create({ data: { kind: "BUSINESS", value: b.id, label: b.name, vendorId: v.id, createdBy: "sample" } });
  }
});

// -------------------------------------------------------------------- live
async function fetchLive(): Promise<{ accounts: RawAccount[]; campaigns: RawCampaign[] }> {
  const token = process.env.META_ACCESS_TOKEN, ids = (process.env.META_AD_ACCOUNT_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!token || !ids.length) throw new Error("META_MODE=live needs META_ACCESS_TOKEN and META_AD_ACCOUNT_IDS.");
  const ver = process.env.META_API_VERSION || "v23.0";
  const get = async (path: string, params: Record<string, string> = {}, pages = 20) => {
    let url: string | null = `https://graph.facebook.com/${ver}/${path}?${new URLSearchParams({ ...params, access_token: token })}`;
    const out: any[] = [];
    let first: any = null;
    for (let i = 0; url && i < pages; i++) {
      const res: Response = await fetch(url);
      const j: any = await res.json();
      if (!res.ok || j.error) throw new Error(`Meta API ${path}: ${j.error?.message ?? res.status}`);
      first ??= j;
      if (Array.isArray(j.data)) out.push(...j.data); else return j;
      url = j.paging?.next ?? null;
    }
    return first && Array.isArray(first.data) ? out : first;
  };
  const since = new Date(Date.now() - 26 * 7 * 86_400_000);
  while (since.getUTCDay() !== 1) since.setUTCDate(since.getUTCDate() - 1);
  const range = JSON.stringify({ since: since.toISOString().slice(0, 10), until: new Date().toISOString().slice(0, 10) });
  const accounts: RawAccount[] = [], campaigns: RawCampaign[] = [];
  for (const act of ids.map((x) => (x.startsWith("act_") ? x : `act_${x}`))) {
    const info = await get(act, { fields: "name,currency,business{id,name}" });
    const agencies = (await get(`${act}/agencies`, { fields: "id,name" })) as any[];
    accounts.push({ id: act, name: info.name, currency: info.currency, ownerBusinessId: info.business?.id ?? null, ownerBusinessName: info.business?.name ?? null, agencies: (agencies ?? []).map((a) => ({ id: String(a.id), name: String(a.name) })) });
    const camps = (await get(`${act}/campaigns`, { fields: "id,name,objective,status,created_time", limit: "500" })) as any[];
    const acts = (await get(`${act}/activities`, { fields: "actor_id,actor_name,event_type,object_id,event_time", since: String(Math.floor(Date.now() / 1000) - 365 * 86_400), limit: "500" })) as any[];
    const creator = new Map(acts.filter((a) => a.event_type === "create_campaign_group").map((a) => [String(a.object_id), { id: String(a.actor_id), name: String(a.actor_name) }]));
    const ads = (await get(`${act}/ads`, { fields: "campaign_id,creative{url_tags}", limit: "500" })) as any[];
    const utm = new Map<string, Set<string>>();
    for (const ad of ads) {
      const tag = new URLSearchParams(String(ad.creative?.url_tags ?? "")).get("utm_campaign");
      if (tag) (utm.get(String(ad.campaign_id)) ?? utm.set(String(ad.campaign_id), new Set()).get(String(ad.campaign_id))!).add(tag);
    }
    const ins = (await get(`${act}/insights`, { level: "campaign", time_increment: "7", fields: "campaign_id,spend,impressions,clicks,actions,date_start", time_range: range, limit: "500" })) as any[];
    const weeks = new Map<string, Week[]>();
    for (const r of ins) {
      const leads = (r.actions ?? []).filter((a: any) => ["lead", "onsite_conversion.lead_grouped", "leadgen_grouped"].includes(a.action_type)).reduce((s: number, a: any) => s + Number(a.value || 0), 0);
      (weeks.get(String(r.campaign_id)) ?? weeks.set(String(r.campaign_id), []).get(String(r.campaign_id))!).push({ week: String(r.date_start), spendK: r1(Number(r.spend || 0) / 1000), impressionsK: Math.round(Number(r.impressions || 0) / 1000), clicks: Number(r.clicks || 0), leads });
    }
    for (const x of camps) {
      const cr = creator.get(String(x.id));
      campaigns.push({ id: String(x.id), accountId: act, name: String(x.name), objective: x.objective ?? null, status: String(x.status), createdTime: x.created_time ? new Date(x.created_time) : null, creatorId: cr?.id ?? null, creatorName: cr?.name ?? null, creatorBusinessId: null, creatorBusinessName: null, utm: [...(utm.get(String(x.id)) ?? [])], weeks: weeks.get(String(x.id)) ?? [] });
    }
  }
  return { accounts, campaigns };
}

// ------------------------------------------------------------- attribution
type Ctx = { codeOwner: Map<string, string>; idByBusiness: Map<string, { vendorId: string | null; inHouse: boolean; label: string }>; idByUser: Map<string, { vendorId: string | null; inHouse: boolean; label: string }>; accounts: Map<string, RawAccount> };
type Attribution = { kind: string; vendorId: string | null; code: string | null; confidence: "HIGH" | "MEDIUM" | "LOW"; signals: Signal[]; flags: string[]; candidates: string[] };

export function attribute(c: Pick<RawCampaign, "name" | "utm" | "accountId" | "creatorId" | "creatorName" | "creatorBusinessId" | "creatorBusinessName">, ctx: Ctx, codesInAccount?: Map<string, Set<string>>): Attribution {
  const signals: Signal[] = [];
  const upper = c.name.toUpperCase();
  for (const [code, vendorId] of ctx.codeOwner) if (upper.includes(code)) signals.push({ type: "NAME_CODE", vendorId, weight: 0.45, code });
  for (const u of c.utm) { const code = u.toUpperCase(); const v = ctx.codeOwner.get(code); if (v) signals.push({ type: "UTM_CODE", vendorId: v, weight: 0.4, code }); }
  const who = (c.creatorBusinessId && ctx.idByBusiness.get(c.creatorBusinessId)) || (c.creatorId && ctx.idByUser.get(c.creatorId)) || null;
  const whoName = c.creatorBusinessName || c.creatorName || "";
  if (who?.inHouse) signals.push({ type: "CREATOR_IN_HOUSE", vendorId: null, weight: 0, who: who.label });
  else if (who?.vendorId) signals.push({ type: "CREATOR", vendorId: who.vendorId, weight: 0.4, who: c.creatorName || who.label });
  else if (c.creatorBusinessId || c.creatorId) signals.push({ type: "CREATOR_UNKNOWN", vendorId: null, weight: 0, who: whoName });
  const acc = ctx.accounts.get(c.accountId);
  const owner = acc?.ownerBusinessId ? ctx.idByBusiness.get(acc.ownerBusinessId) : undefined;
  if (owner?.vendorId) signals.push({ type: "ACCOUNT_OWNER", vendorId: owner.vendorId, weight: 0.25, who: owner.label });

  const score = new Map<string, number>();
  for (const s of signals) if (s.vendorId) score.set(s.vendorId, (score.get(s.vendorId) ?? 0) + s.weight);
  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1]);
  const flags: string[] = [];
  if (!c.utm.length) flags.push("NO_UTM");
  const codeFor = (vendorId: string) => {
    const direct = signals.find((s) => (s.type === "NAME_CODE" || s.type === "UTM_CODE") && s.vendorId === vendorId)?.code;
    if (direct) return direct;
    const inAcc = [...(codesInAccount?.get(`${c.accountId}|${vendorId}`) ?? [])];
    if (inAcc.length === 1) { flags.push("CODE_INFERRED"); return inAcc[0]; }
    return null;
  };
  const candidates = ranked.map(([v]) => v);
  if (!ranked.length) {
    if (signals.some((s) => s.type === "CREATOR_IN_HOUSE")) return { kind: "IN_HOUSE", vendorId: null, code: null, confidence: "HIGH", signals, flags: [...flags, "IN_HOUSE"], candidates };
    if (signals.some((s) => s.type === "CREATOR_UNKNOWN")) return { kind: "UNKNOWN_AGENCY", vendorId: null, code: null, confidence: "HIGH", signals, flags: [...flags, "UNKNOWN_AGENCY"], candidates };
    return { kind: "UNRESOLVED", vendorId: null, code: null, confidence: "LOW", signals, flags, candidates };
  }
  const [top, second] = ranked;
  if (second && second[1] >= 0.35) return { kind: "CONFLICT", vendorId: null, code: null, confidence: "LOW", signals, flags: [...flags, "CODE_OF_OTHER_VENDOR"], candidates };
  const confidence = top[1] >= 0.75 ? "HIGH" : top[1] >= 0.4 ? "MEDIUM" : "LOW";
  const code = codeFor(top[0]);
  if (!code) flags.push("NO_CODE");
  return { kind: "VENDOR", vendorId: top[0], code, confidence, signals, flags, candidates };
}

async function context(accounts: RawAccount[]): Promise<Ctx> {
  const [campaigns, ids] = await Promise.all([prisma.campaign.findMany(), prisma.metaIdentity.findMany()]);
  const codeOwner = new Map(campaigns.filter((x) => x.crmCode).map((x) => [x.crmCode!.toUpperCase(), x.vendorId]));
  const m = (kind: string) => new Map(ids.filter((i) => i.kind === kind).map((i) => [i.value, { vendorId: i.vendorId, inHouse: i.inHouse, label: i.label }]));
  return { codeOwner, idByBusiness: m("BUSINESS"), idByUser: m("USER"), accounts: new Map(accounts.map((a) => [a.id, a])) };
}

/** Attribute every campaign (two passes: the second infers missing codes from the vendor's other campaigns in the same account). */
function attributeAll(rows: RawCampaign[], ctx: Ctx) {
  const first = rows.map((r) => ({ r, a: attribute(r, ctx) }));
  const codesInAccount = new Map<string, Set<string>>();
  for (const { r, a } of first) if (a.kind === "VENDOR" && a.code && a.confidence !== "LOW") {
    const k = `${r.accountId}|${a.vendorId}`;
    (codesInAccount.get(k) ?? codesInAccount.set(k, new Set()).get(k)!).add(a.code);
  }
  return rows.map((r) => ({ r, a: attribute(r, ctx, codesInAccount) }));
}

// ---------------------------------------------------------------------- sync
const counts = (a: { kind: string; vendorId: string | null; campaignCode: string | null; confidence: string; review: string }) =>
  a.kind === "VENDOR" && !!a.vendorId && !!a.campaignCode && (a.review === "CONFIRMED" || a.confidence !== "LOW");

/** Rebuild the META rows of the ad-platform table from attributed campaigns (what checks the vendors' reported spend). */
async function rebuildPlatformRows() {
  const camps = await prisma.metaCampaign.findMany();
  const want = new Map<string, { week: string; campaignCode: string; spendK: number; impressionsK: number; clicks: number; platformLeads: number }>();
  for (const c of camps.filter(counts)) for (const w of JSON.parse(c.weeks) as Week[]) {
    const k = `${w.week}|${c.campaignCode}`;
    const x = want.get(k) ?? { week: w.week, campaignCode: c.campaignCode!, spendK: 0, impressionsK: 0, clicks: 0, platformLeads: 0 };
    x.spendK = r1(x.spendK + w.spendK); x.impressionsK += w.impressionsK; x.clicks += w.clicks; x.platformLeads += w.leads;
    want.set(k, x);
  }
  for (const ex of (await prisma.adPlatformWeek.findMany()).filter((r) => r.platform === "META"))
    if (!want.has(`${ex.week}|${ex.campaignCode}`) && ex.spendK !== 0) await prisma.adPlatformWeek.update({ where: { id: ex.id }, data: { spendK: 0, impressionsK: 0, clicks: 0, platformLeads: 0 } });
  await upsertAdRows([...want.values()].map((x) => ({ ...x, platform: "META" as const })));
}

async function storeAttribution(rows: RawCampaign[], accounts: RawAccount[]) {
  const ctx = await context(accounts);
  const existing = new Map((await prisma.metaCampaign.findMany()).map((c) => [c.id, c]));
  for (const { r, a } of attributeAll(rows, ctx)) {
    const ex = existing.get(r.id);
    const keep = ex?.review === "CONFIRMED";
    const data = {
      accountId: r.accountId, name: r.name, objective: r.objective, status: r.status, createdTime: r.createdTime,
      creatorId: r.creatorId, creatorName: r.creatorName, creatorBusinessId: r.creatorBusinessId, creatorBusinessName: r.creatorBusinessName,
      utmCampaigns: JSON.stringify(r.utm), spendK: r1(r.weeks.reduce((s, w) => s + w.spendK, 0)), leads: r.weeks.reduce((s, w) => s + w.leads, 0), weeks: JSON.stringify(r.weeks),
      signals: JSON.stringify(a.signals), flags: JSON.stringify(a.flags), syncedAt: new Date(),
      ...(keep ? {} : { kind: a.kind, vendorId: a.vendorId, campaignCode: a.code, confidence: a.confidence }),
    };
    if (ex) await prisma.metaCampaign.update({ where: { id: r.id }, data });
    else await prisma.metaCampaign.create({ data: { id: r.id, ...data, kind: a.kind, vendorId: a.vendorId, campaignCode: a.code, confidence: a.confidence, review: "AUTO" } });
  }
}

const rawFromStore = async (): Promise<{ accounts: RawAccount[]; campaigns: RawCampaign[] }> => {
  const [acc, camps] = await Promise.all([prisma.metaAdAccount.findMany(), prisma.metaCampaign.findMany()]);
  return {
    accounts: acc.map((a) => ({ id: a.id, name: a.name, ownerBusinessId: a.ownerBusinessId, ownerBusinessName: a.ownerBusinessName, agencies: JSON.parse(a.agencies), currency: a.currency })),
    campaigns: camps.map((c) => ({ id: c.id, accountId: c.accountId, name: c.name, objective: c.objective, status: c.status, createdTime: c.createdTime, creatorId: c.creatorId, creatorName: c.creatorName, creatorBusinessId: c.creatorBusinessId, creatorBusinessName: c.creatorBusinessName, utm: JSON.parse(c.utmCampaigns), weeks: JSON.parse(c.weeks) })),
  };
};

export const syncMeta = serial(async () => {
  await ensureMarketingSeeded();
  const mode = metaMode();
  if (mode === "off") throw new Error("META_MODE=off.");
  await ensureSampleIdentities();
  const { accounts, campaigns } = mode === "live" ? await fetchLive() : await fetchMock();
  const have = new Set((await prisma.metaAdAccount.findMany()).map((a) => a.id));
  for (const a of accounts) {
    const data = { name: a.name, ownerBusinessId: a.ownerBusinessId, ownerBusinessName: a.ownerBusinessName, agencies: JSON.stringify(a.agencies), currency: a.currency, syncedAt: new Date() };
    if (have.has(a.id)) await prisma.metaAdAccount.update({ where: { id: a.id }, data }); else await prisma.metaAdAccount.create({ data: { id: a.id, ...data } });
  }
  await storeAttribution(campaigns, accounts);
  await rebuildPlatformRows();
  await prisma.sourceSync.create({ data: { source: "META", mode, rows: campaigns.length } });
  return campaigns.length;
});

export const ensureMetaSynced = single(async function ensureMetaSyncedImpl() {
  if (metaMode() === "mock" && (await prisma.metaCampaign.count()) === 0) await syncMeta();
});

// ------------------------------------------------------------------ actions
/** The manager confirms or corrects who runs a campaign; optionally teaches the agent the creator. */
export async function assignMetaCampaign(b: { id: string; target: string; code?: string | null; approver: string; remember?: boolean }, l: Lang) {
  const T = (en: string, ar: string) => tx(l, en, ar);
  if (!b.approver?.trim()) throw new Error(T("Your name is required.", "اسمكم مطلوب."));
  const c = (await prisma.metaCampaign.findMany()).find((x) => x.id === b.id);
  if (!c) throw new Error(T("Campaign not found.", "الحملة غير موجودة."));
  const vendors = await prisma.vendor.findMany();
  let kind = "VENDOR", vendorId: string | null = null, code: string | null = null;
  if (b.target === "IN_HOUSE") kind = "IN_HOUSE";
  else if (b.target === "UNKNOWN") kind = "UNKNOWN_AGENCY";
  else {
    const v = vendors.find((x) => x.id === b.target);
    if (!v) throw new Error(T("Pick a vendor.", "اختاروا مورداً."));
    vendorId = v.id;
    const codes = (await prisma.campaign.findMany()).filter((x) => x.vendorId === v.id && x.crmCode).map((x) => x.crmCode!);
    code = b.code && codes.includes(b.code) ? b.code : codes.length === 1 ? codes[0] : null;
    if (!code) throw new Error(T("Pick the campaign code this Meta campaign belongs to.", "اختاروا رمز الحملة الذي تنتمي إليه حملة ميتا هذه."));
  }
  await prisma.metaCampaign.update({ where: { id: c.id }, data: { kind, vendorId, campaignCode: code, confidence: "HIGH", review: "CONFIRMED", reviewedBy: b.approver.trim(), reviewedAt: new Date() } });
  const label = kind === "IN_HOUSE" ? T("in-house", "داخلي") : kind === "UNKNOWN_AGENCY" ? T("not one of our agencies", "ليست من وكالاتنا") : `${nm(l, vendors.find((v) => v.id === vendorId)!.name)} · ${code}`;
  await prisma.marketingAction.create({ data: { type: "META_ATTRIBUTION", campaign: c.name, detail: T(`Confirmed as ${label} by ${b.approver.trim()}.`, `أكّد ${b.approver.trim()} أنها: ${label}.`) } });
  // Teach the agent who the creator is, then re-attribute that creator's other unconfirmed campaigns.
  if (b.remember && kind !== "UNKNOWN_AGENCY" && (c.creatorBusinessId || c.creatorId)) {
    const ids = await prisma.metaIdentity.findMany();
    const [k, value] = c.creatorBusinessId ? ["BUSINESS", c.creatorBusinessId] : ["USER", c.creatorId!];
    const ex = ids.find((i) => i.kind === k && i.value === value);
    // Only learn creators we don't know yet: one confirmation must never re-label an agency's whole business.
    if (!ex) {
      await prisma.metaIdentity.create({ data: { kind: k, value, label: c.creatorBusinessName || c.creatorName || value, vendorId, inHouse: kind === "IN_HOUSE", createdBy: b.approver.trim() } });
      const raw = await rawFromStore();
      await storeAttribution(raw.campaigns, raw.accounts);
    }
  }
  await rebuildPlatformRows();
}

// -------------------------------------------------------------------- views
const SIGNAL_TEXT: Record<Signal["type"], (s: Signal, v: string, l: Lang) => string> = {
  NAME_CODE: (s, v, l) => tx(l, `Name contains ${s.code} (${v})`, `الاسم يتضمن ${s.code} (${v})`),
  UTM_CODE: (s, v, l) => tx(l, `Ads tagged utm_campaign=${s.code} (${v})`, `الإعلانات موسومة utm_campaign=${s.code} (${v})`),
  CREATOR: (s, v, l) => tx(l, `Created by ${s.who} — ${v}`, `أنشأها ${s.who} — ${v}`),
  CREATOR_IN_HOUSE: (s, _v, l) => tx(l, `Created by your own team (${s.who})`, `أنشأها فريقكم (${s.who})`),
  CREATOR_UNKNOWN: (s, _v, l) => tx(l, `Created by ${s.who} — not one of your agencies`, `أنشأها ${s.who} — ليست من وكالاتكم`),
  ACCOUNT_OWNER: (_s, v, l) => tx(l, `Ad account belongs to ${v}`, `الحساب الإعلاني يعود إلى ${v}`),
};
const FLAG_TEXT: Record<string, [string, string]> = {
  NO_UTM: ["No utm_campaign on the ads — leads reach the CRM without a campaign code", "لا يوجد utm_campaign على الإعلانات — يصل العملاء إلى النظام دون رمز حملة"],
  CODE_INFERRED: ["Campaign code inferred from the agency's other campaigns in this account", "رمز الحملة مُستنتج من حملات الوكالة الأخرى في هذا الحساب"],
  NO_CODE: ["Agency identified but no campaign code — spend can't be matched to a campaign", "حُدّدت الوكالة دون رمز حملة — لا يمكن ربط الإنفاق بحملة"],
  CODE_OF_OTHER_VENDOR: ["Evidence points at two different agencies", "الأدلة تشير إلى وكالتين مختلفتين"],
  UNKNOWN_AGENCY: ["Created by a business that is not one of your vendors", "أنشأتها جهة ليست من مورديكم"],
  IN_HOUSE: ["Your own team's activity — not counted against any agency", "نشاط فريقكم — لا يُحتسب على أي وكالة"],
};

export async function metaState(lang: Lang) {
  await ensureMetaSynced();
  const [accounts, camps, vendors, ids, syncs] = await Promise.all([prisma.metaAdAccount.findMany(), prisma.metaCampaign.findMany(), prisma.vendor.findMany(), prisma.metaIdentity.findMany(), prisma.sourceSync.findMany()]);
  const vName = (id: string | null) => (id ? nm(lang, vendors.find((v) => v.id === id)?.name ?? "") : "");
  const knownBiz = new Map(ids.filter((i) => i.kind === "BUSINESS").map((i) => [i.value, i]));
  const allCodes = (await prisma.campaign.findMany()).filter((c) => c.crmCode).map((c) => ({ code: c.crmCode!, vendorId: c.vendorId }));
  const rows = camps.map((c) => {
    const signals = JSON.parse(c.signals) as Signal[];
    // Once the manager has confirmed, doubts about who runs it are settled; tracking problems still show.
    const flags = (JSON.parse(c.flags) as string[]).filter((f) => c.review !== "CONFIRMED" || !["CODE_OF_OTHER_VENDOR", "CODE_INFERRED", "NO_CODE"].includes(f));
    const needsReview = c.review !== "CONFIRMED" && c.kind !== "IN_HOUSE" && (c.kind !== "VENDOR" || c.confidence === "LOW" || !c.campaignCode || flags.includes("CODE_INFERRED"));
    return {
      id: c.id, name: c.name, account: accounts.find((a) => a.id === c.accountId)?.name ?? c.accountId, status: c.status, objective: c.objective,
      createdTime: c.createdTime?.toISOString() ?? null, creator: c.creatorBusinessName ? `${c.creatorName ?? ""} · ${c.creatorBusinessName}` : c.creatorName,
      spendK: c.spendK, leads: c.leads, utm: JSON.parse(c.utmCampaigns) as string[],
      kind: c.kind, vendorId: c.vendorId, vendor: vName(c.vendorId), code: c.campaignCode, confidence: c.confidence, review: c.review, reviewedBy: c.reviewedBy,
      signals: signals.map((s) => SIGNAL_TEXT[s.type](s, vName(s.vendorId), lang)),
      flags: flags.map((f) => ({ code: f, text: tx(lang, ...(FLAG_TEXT[f] ?? [f, f]) as [string, string]) })),
      suggested: signals.filter((s) => s.vendorId).map((s) => s.vendorId!).filter((v, i, a) => a.indexOf(v) === i),
      counted: counts(c), needsReview,
      creatorKnown: signals.some((x) => x.type === "CREATOR" || x.type === "CREATOR_IN_HOUSE"),
    };
  }).sort((a, b) => Number(b.needsReview) - Number(a.needsReview) || b.spendK - a.spendK);
  const total = r1(rows.reduce((s, r) => s + r.spendK, 0));
  const sum = (f: (r: (typeof rows)[number]) => boolean) => r1(rows.filter(f).reduce((s, r) => s + r.spendK, 0));
  const byVendor = vendors.map((v) => ({ vendorId: v.id, vendor: vName(v.id), spendK: sum((r) => r.counted && r.vendorId === v.id), campaigns: rows.filter((r) => r.vendorId === v.id).length })).filter((x) => x.campaigns);
  return {
    mode: metaMode(), lastSync: syncs.filter((s) => s.source === "META").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]?.createdAt.toISOString() ?? null,
    summary: {
      campaigns: rows.length, spendK: total, attributedK: sum((r) => r.counted), attributedPct: total ? Math.round((sum((r) => r.counted) / total) * 100) : 0,
      inHouseK: sum((r) => r.kind === "IN_HOUSE"), unknownK: sum((r) => r.kind === "UNKNOWN_AGENCY"), conflictK: sum((r) => r.kind === "CONFLICT" || r.kind === "UNRESOLVED"),
      needsReview: rows.filter((r) => r.needsReview).length, byVendor,
    },
    accounts: accounts.map((a) => ({
      id: a.id, name: a.name, owner: a.ownerBusinessName, ownerIs: a.ownerBusinessId ? (knownBiz.get(a.ownerBusinessId)?.inHouse ? "CLIENT" : knownBiz.get(a.ownerBusinessId)?.vendorId ? "VENDOR" : "UNKNOWN") : "UNKNOWN",
      agencies: (JSON.parse(a.agencies) as { id: string; name: string }[]).map((g) => ({ name: g.name, known: !!knownBiz.get(g.id)?.vendorId })),
    })),
    campaigns: rows,
    vendorOptions: vendors.filter((v) => v.status !== "BENCH").map((v) => ({ id: v.id, name: vName(v.id), codes: allCodes.filter((c) => c.vendorId === v.id).map((c) => c.code) })),
  };
}

// --------------------------------------------------------- recommendations
type MetaRec = { key: string; type: "META_UNKNOWN_AGENCY" | "META_CONFLICT" | "META_NO_UTM"; severity: "crit" | "warn" | "info"; vendorId: string; vendor: string; title: string; rationale: string; evidence: string[]; impactK: number | null; channel: "EMAIL" | "INTERNAL"; href?: string };

export async function metaRecommendations(lang: Lang): Promise<MetaRec[]> {
  if (metaMode() === "off") return [];
  await ensureMetaSynced();
  const [camps, vendors] = await Promise.all([prisma.metaCampaign.findMany(), prisma.vendor.findMany()]);
  const T = (en: string, ar: string) => tx(lang, en, ar);
  const out: MetaRec[] = [];
  for (const c of camps.filter((x) => x.review !== "CONFIRMED")) {
    const signals = JSON.parse(c.signals) as Signal[], flags = JSON.parse(c.flags) as string[];
    if (c.kind === "UNKNOWN_AGENCY") out.push({
      key: `META_UNKNOWN:${c.id}`, type: "META_UNKNOWN_AGENCY", severity: "crit", vendorId: "", vendor: c.creatorBusinessName ?? c.creatorName ?? "",
      title: T(`An agency that isn't one of your vendors is running Meta ads in your account (${c.creatorBusinessName ?? c.creatorName}, ${K("en", c.spendK)})`, `جهة ليست من مورديكم تدير إعلانات ميتا في حسابكم (${c.creatorBusinessName ?? c.creatorName}، ${K("ar", c.spendK)})`),
      rationale: T(`"${c.name}" was created by ${c.creatorName} (${c.creatorBusinessName ?? "unknown business"}), which has partner access to the ad account but no contract with you. Check who granted access in Business Manager; pause it or confirm who it works for.`, `أنشأ ${c.creatorName} (${c.creatorBusinessName ?? "جهة غير معروفة"}) الحملة «${c.name}»، ولديه صلاحية شريك على الحساب الإعلاني دون عقد معكم. تحققوا ممن منح الصلاحية في مدير الأعمال؛ أوقفوها أو أكّدوا لمن تعمل.`),
      evidence: [], impactK: c.spendK, channel: "INTERNAL", href: "/campaigns#meta",
    });
    if (c.kind === "CONFLICT") {
      const vs = signals.filter((s) => s.vendorId).map((s) => s.vendorId!).filter((v, i, a) => a.indexOf(v) === i).map((id) => vendors.find((v) => v.id === id)?.name ?? "");
      out.push({
        key: `META_CONFLICT:${c.id}`, type: "META_CONFLICT", severity: "warn", vendorId: "", vendor: vs.join(" / "),
        title: T(`Who runs "${c.name}"? The evidence points at ${vs.join(" and ")} (${K("en", c.spendK)})`, `من يدير «${c.name}»؟ الأدلة تشير إلى ${vs.map((x) => nm("ar", x)).join(" و")} (${K("ar", c.spendK)})`),
        rationale: T(`${signals.map((s) => SIGNAL_TEXT[s.type](s, nm("en", vendors.find((v) => v.id === s.vendorId)?.name ?? ""), "en")).join("; ")}. Until you confirm, this spend is not counted for either vendor and doesn't appear in their reports.`, `${signals.map((s) => SIGNAL_TEXT[s.type](s, nm("ar", vendors.find((v) => v.id === s.vendorId)?.name ?? ""), "ar")).join("؛ ")}. إلى أن تؤكدوا، لا يُحتسب هذا الإنفاق لأي من الموردَين ولا يظهر في تقاريرهما.`),
        evidence: [], impactK: c.spendK, channel: "INTERNAL", href: "/campaigns#meta",
      });
    }
    if (c.kind === "VENDOR" && c.vendorId && flags.includes("NO_UTM") && c.spendK > 0) {
      const v = vendors.find((x) => x.id === c.vendorId)!;
      const vl: Lang = lang;
      out.push({
        key: `META_NO_UTM:${c.id}`, type: "META_NO_UTM", severity: "warn", vendorId: v.id, vendor: v.name,
        title: T(`${v.name}: Meta campaign without tracking codes — its leads can't be attributed (${K("en", c.spendK)})`, `${nm("ar", v.name)}: حملة ميتا بلا رموز تتبع — لا يمكن نسب عملائها (${K("ar", c.spendK)})`),
        rationale: T(`"${c.name}" has no utm_campaign on its ads, so ${c.leads} platform leads reached the CRM without a campaign code. ${c.campaignCode ? `The agent inferred ${c.campaignCode} from the agency's other campaigns in the account, which keeps the spend check working, but the CRM can't credit the leads.` : ""}`, `لا يوجد utm_campaign على إعلانات «${c.name}»، لذا وصل ${c.leads} عميلاً من المنصة إلى النظام دون رمز حملة. ${c.campaignCode ? `استنتج الوكيل الرمز ${c.campaignCode} من حملات الوكالة الأخرى في الحساب، مما يُبقي مطابقة الإنفاق ممكنة، لكن النظام لا يستطيع نسب العملاء.` : ""}`),
        evidence: [tx(vl, `Meta campaign "${c.name}" (id ${c.id}): ${K("en", c.spendK)} spent, ${c.leads} leads, no utm_campaign on its ads`, `حملة ميتا «${c.name}» (المعرّف ${c.id}): أُنفق ${K("ar", c.spendK)}، ${c.leads} عميلاً، دون utm_campaign على إعلاناتها`), ...(c.campaignCode ? [tx(vl, `Expected code: ${c.campaignCode}`, `الرمز المتوقع: ${c.campaignCode}`)] : [])],
        impactK: c.spendK, channel: "EMAIL",
      });
    }
  }
  return out;
}
