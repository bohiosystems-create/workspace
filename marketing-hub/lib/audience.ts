// Lead profiles — who the campaigns bring: city, nationality, buyer type, budget band, unit type and age band, with
// qualified and win rates per segment. SAMPLE DATA: the CRM sample has no profile fields, so each lead's profile is
// derived deterministically from its CRM id (the same lead always gets the same profile) with realistic, project-
// specific mixes, and segments that buy more often appear more often among qualified leads. Lead counts, stages and
// sales are the CRM's own. Live: these fields come from the CRM (Yardi) lead record.
import { prisma } from "./prisma";
import { familyOf } from "./history";

export const DIMENSIONS = ["city", "nationality", "buyerType", "budgetBand", "unitType", "ageBand", "lostReason", "responseBand"] as const;
export type Dimension = (typeof DIMENSIONS)[number];
export const DIM_LABEL: Record<Dimension, [string, string]> = {
  city: ["City", "المدينة"], nationality: ["Nationality", "الجنسية"], buyerType: ["Buyer type", "نوع المشتري"], budgetBand: ["Budget", "الميزانية"],
  unitType: ["Unit type", "نوع الوحدة"], ageBand: ["Age", "العمر"], lostReason: ["Reason lost", "سبب الخسارة"], responseBand: ["First response", "أول استجابة"],
};
export const VALUE_AR: Record<string, string> = {
  Jeddah: "جدة", Riyadh: "الرياض", Makkah: "مكة المكرمة", Madinah: "المدينة المنورة", "Dammam / Khobar": "الدمام / الخبر", "Taif": "الطائف", Abroad: "خارج المملكة",
  Saudi: "سعودي", GCC: "خليجي", "Arab expat": "مقيم عربي", "Other expat": "مقيم آخر",
  "End user (family)": "مستخدم نهائي (أسرة)", Investor: "مستثمر", "First-time buyer": "مشترٍ لأول مرة",
  "Under SAR 1M": "أقل من مليون ر.س", "SAR 1–2M": "1–2 مليون ر.س", "SAR 2–3M": "2–3 مليون ر.س", "Over SAR 3M": "أكثر من 3 ملايين ر.س",
  Apartment: "شقة", Townhouse: "تاون هاوس", Villa: "فيلا", Penthouse: "بنتهاوس", "Office / retail": "مكتب / تجزئة",
  "Not a buyer": "ليس مشترياً", "No response": "عدم الرد", Price: "السعر", "Chose competitor": "اختار منافساً", Location: "الموقع", Financing: "التمويل", Other: "أخرى",
  "Jeddah North": "شمال جدة", "Jeddah Corniche": "كورنيش جدة", "Jeddah South": "جنوب جدة", "Riyadh North": "شمال الرياض",
  "25–34": "25–34", "35–44": "35–44", "45–54": "45–54", "55+": "55+",
  "Within 4 hours": "خلال 4 ساعات", "4–24 hours": "4–24 ساعة", "Over 24 hours": "أكثر من 24 ساعة", "Never contacted": "لم يُتواصل معه",
};

// Mixes per project: [value, share among all leads, lift among qualified-or-better leads].
type Mix = [string, number, number][];
const MIX: Record<Exclude<Dimension, "lostReason" | "responseBand">, Record<string, Mix>> = {
  city: {
    _: [["Jeddah", 62, 1.1], ["Riyadh", 14, 1.15], ["Makkah", 8, 0.9], ["Madinah", 4, 0.8], ["Dammam / Khobar", 4, 0.9], ["Taif", 2, 0.8], ["Abroad", 6, 0.5]],
    "Marina Tower": [["Jeddah", 48, 1.0], ["Riyadh", 24, 1.3], ["Makkah", 6, 0.8], ["Dammam / Khobar", 6, 1.0], ["Abroad", 16, 0.7]],
  },
  nationality: {
    _: [["Saudi", 72, 1.1], ["GCC", 8, 1.2], ["Arab expat", 13, 0.7], ["Other expat", 7, 0.6]],
    "Marina Tower": [["Saudi", 60, 1.05], ["GCC", 17, 1.35], ["Arab expat", 13, 0.7], ["Other expat", 10, 0.7]],
  },
  buyerType: {
    _: [["End user (family)", 52, 1.1], ["First-time buyer", 24, 0.8], ["Investor", 24, 1.1]],
    "Marina Tower": [["End user (family)", 32, 0.9], ["First-time buyer", 10, 0.7], ["Investor", 58, 1.15]],
    "Andalus Quarter": [["End user (family)", 46, 1.1], ["First-time buyer", 38, 0.75], ["Investor", 16, 1.2]],
  },
  budgetBand: {
    "Ash Shati Residences": [["Under SAR 1M", 30, 0.6], ["SAR 1–2M", 46, 1.25], ["SAR 2–3M", 18, 1.2], ["Over SAR 3M", 6, 0.8]],
    "Marina Tower": [["Under SAR 1M", 14, 0.4], ["SAR 1–2M", 26, 0.9], ["SAR 2–3M", 32, 1.2], ["Over SAR 3M", 28, 1.3]],
    "Andalus Quarter": [["Under SAR 1M", 52, 0.8], ["SAR 1–2M", 38, 1.3], ["SAR 2–3M", 8, 1.1], ["Over SAR 3M", 2, 0.8]],
    _: [["Under SAR 1M", 30, 0.7], ["SAR 1–2M", 40, 1.2], ["SAR 2–3M", 20, 1.1], ["Over SAR 3M", 10, 1.0]],
  },
  unitType: {
    "Ash Shati Residences": [["Apartment", 64, 1.0], ["Townhouse", 28, 1.1], ["Penthouse", 8, 0.9]],
    "Marina Tower": [["Apartment", 54, 1.0], ["Penthouse", 18, 1.2], ["Office / retail", 28, 0.9]],
    "Andalus Quarter": [["Apartment", 70, 0.95], ["Townhouse", 30, 1.15]],
    _: [["Apartment", 66, 1.0], ["Townhouse", 26, 1.0], ["Penthouse", 8, 1.0]],
  },
  ageBand: {
    _: [["25–34", 34, 0.8], ["35–44", 36, 1.15], ["45–54", 20, 1.15], ["55+", 10, 0.9]],
    "Marina Tower": [["25–34", 18, 0.7], ["35–44", 34, 1.05], ["45–54", 30, 1.2], ["55+", 18, 1.0]],
  },
};
// Channel nudges (brokers bring more investors; creators more first-time buyers).
const CHANNEL_NUDGE: Record<string, Partial<Record<string, number>>> = {
  BROKER: { Investor: 1.5, "First-time buyer": 0.6, Riyadh: 1.3, GCC: 1.3 },
  INFLUENCER: { "First-time buyer": 1.6, "25–34": 1.5, Investor: 0.6 },
  PORTAL: { "Arab expat": 1.3, "Other expat": 1.3 },
  OUTDOOR: { Jeddah: 1.2 },
  PR: { Investor: 1.3, "45–54": 1.3, "55+": 1.3 },
};

/** Deterministic hash of a string to [0, 1) per salt. */
function u(id: string, salt: number) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
function pick(mix: Mix, r: number, level: number, nudge: Partial<Record<string, number>>) {
  // level 0 = not qualified, 1 = qualified / viewing / reserved, 2 = won (lift applied twice).
  const w = mix.map(([v, share, lift]) => share * lift ** level * (nudge[v] ?? 1));
  const tot = w.reduce((a, b) => a + b, 0);
  let x = r * tot;
  for (let i = 0; i < mix.length; i++) { x -= w[i]; if (x < 0) return mix[i][0]; }
  return mix[mix.length - 1][0];
}
const QUALIFIED_PLUS = new Set(["QUALIFIED", "VIEWING", "RESERVED", "WON"]);

export type LeadRow = { campaignCode: string | null; campaign: string | null; project: string | null; vendor: string | null; family: string | null; month: string; stage: string; dealValueM: number | null; profile: Record<Dimension, string> };

/** Every CRM lead with its campaign, project, channel family and profile. */
export async function leadProfiles(): Promise<LeadRow[]> {
  const [leads, camps] = await Promise.all([prisma.crmLead.findMany(), prisma.campaign.findMany({ include: { asset: true, vendor: true } })]);
  const byId = new Map(camps.map((c) => [c.id, c]));
  return leads.map((l) => {
    const c = l.campaignId ? byId.get(l.campaignId) : undefined;
    const project = c?.asset.name ?? null, fam = c ? familyOf(c.channel) : null, q = l.stage === "WON" ? 2 : QUALIFIED_PLUS.has(l.stage) ? 1 : 0;
    const nudge = CHANNEL_NUDGE[fam ?? ""] ?? {};
    const prof = {} as Record<Dimension, string>;
    (Object.keys(MIX) as (keyof typeof MIX)[]).forEach((d, i) => { prof[d] = pick(MIX[d][project ?? "_"] ?? MIX[d]._, u(l.crmId, i + 1), q, nudge); });
    prof.lostReason = l.stage === "LOST" ? l.lostReason ?? "Other" : "—";
    const hrs = l.firstResponseAt ? (l.firstResponseAt.getTime() - l.createdAt.getTime()) / 3600000 : null;
    prof.responseBand = hrs === null ? "Never contacted" : hrs <= 4 ? "Within 4 hours" : hrs <= 24 ? "4–24 hours" : "Over 24 hours";
    return { campaignCode: c?.crmCode ?? null, campaign: c?.name ?? null, project, vendor: c?.vendor.name ?? null, family: fam, month: l.createdAt.toISOString().slice(0, 7), stage: l.stage, dealValueM: l.stage === "WON" ? l.dealValueM : null, profile: prof };
  });
}

/** Leads, qualified and won per value of one dimension, optionally filtered. */
export function breakdown(rows: LeadRow[], dim: Dimension, f: { project?: string; family?: string; campaignCode?: string; vendor?: string; months?: string[] } = {}) {
  const sel = rows.filter((r) => (!f.project || r.project === f.project) && (!f.family || r.family === f.family) && (!f.campaignCode || r.campaignCode === f.campaignCode) && (!f.vendor || r.vendor === f.vendor) && (!f.months || f.months.includes(r.month)) && (dim !== "lostReason" || r.stage === "LOST"));
  const m = new Map<string, { value: string; leads: number; qualified: number; won: number; salesM: number }>();
  for (const r of sel) {
    const v = r.profile[dim];
    const x = m.get(v) ?? (m.set(v, { value: v, leads: 0, qualified: 0, won: 0, salesM: 0 }), m.get(v)!);
    x.leads++; if (QUALIFIED_PLUS.has(r.stage)) x.qualified++; if (r.stage === "WON") { x.won++; x.salesM += r.dealValueM ?? 0; }
  }
  const out = [...m.values()].map((x) => ({ ...x, salesM: Math.round(x.salesM * 10) / 10, sharePct: sel.length ? Math.round((x.leads / sel.length) * 1000) / 10 : 0, qualRatePct: x.leads ? Math.round((x.qualified / x.leads) * 1000) / 10 : null, winRatePct: x.leads ? Math.round((x.won / x.leads) * 1000) / 10 : null }))
    .sort((a, b) => b.leads - a.leads);
  return { dimension: dim, total: sel.length, rows: out };
}

// ---- 2023–2025: lead profiles for the past campaigns ------------------------------------------------------------
// The history has lead, qualified and contract counts per campaign and month, not individual leads. For profile
// questions across years ("did investors grow?", "buyer types in past Ramadan campaigns") we expand those counts into
// lead rows with the same deterministic method as above: the totals per campaign-month stay exactly the history's.
const PAST_LOST: Mix = [["Not a buyer", 26, 1], ["No response", 18, 1], ["Price", 16, 1], ["Chose competitor", 14, 1], ["Location", 10, 1], ["Financing", 10, 1], ["Other", 6, 1]];
const PAST_RESPONSE: Record<string, Mix> = {
  "2023": [["Within 4 hours", 30, 1], ["4–24 hours", 35, 1], ["Over 24 hours", 25, 1], ["Never contacted", 10, 1]],
  "2024": [["Within 4 hours", 38, 1], ["4–24 hours", 34, 1], ["Over 24 hours", 20, 1], ["Never contacted", 8, 1]],
  "2025": [["Within 4 hours", 45, 1], ["4–24 hours", 32, 1], ["Over 24 hours", 16, 1], ["Never contacted", 7, 1]],
};
const pastCache = new WeakMap<object, LeadRow[]>();
export function historyLeadRows(history: { rows: any[] }): LeadRow[] {
  const hit = pastCache.get(history);
  if (hit) return hit;
  const out: LeadRow[] = [];
  for (const r of history.rows) {
    const project = r.projectKey === "All projects" ? null : r.projectKey, fam = r.family as string, nudge = CHANNEL_NUDGE[fam] ?? {};
    for (const mo of r.months as { month: string; leads?: number; qualified: number; contracts: number; salesM: number }[]) {
      const leads = mo.leads ?? 0, won = Math.min(mo.contracts, leads), qual = Math.max(won, Math.min(mo.qualified, leads)), deal = won ? mo.salesM / won : null;
      for (let k = 0; k < leads; k++) {
        const id = `${r.code}|${mo.month}|${k}`, level = k < won ? 2 : k < qual ? 1 : 0;
        const stage = level === 2 ? "WON" : level === 1 ? (u(id, 21) < 0.3 ? "LOST" : u(id, 21) < 0.55 ? "QUALIFIED" : u(id, 21) < 0.9 ? "VIEWING" : "RESERVED") : u(id, 22) < 0.5 ? "LOST" : "CONTACTED";
        const prof = {} as Record<Dimension, string>;
        (Object.keys(MIX) as (keyof typeof MIX)[]).forEach((d, i) => { prof[d] = pick(MIX[d][project ?? "_"] ?? MIX[d]._, u(id, i + 1), level, nudge); });
        prof.lostReason = stage === "LOST" ? pick(PAST_LOST, u(id, 23), 0, {}) : "—";
        prof.responseBand = pick(PAST_RESPONSE[mo.month.slice(0, 4)] ?? PAST_RESPONSE["2025"], u(id, 24), level, { "Within 4 hours": 1 + level * 0.25, "Never contacted": level ? 0 : 1 });
        out.push({ campaignCode: r.code, campaign: r.name, project, vendor: r.vendorKey, family: fam, month: mo.month, stage, dealValueM: stage === "WON" ? deal : null, profile: prof });
      }
    }
  }
  pastCache.set(history, out);
  return out;
}
