// Creative performance — the ads inside each live campaign: format, message, language, spend, impressions, clicks,
// leads and qualified leads. SAMPLE DATA, derived deterministically from each campaign's real totals (the creatives of a
// campaign add up to its spend, leads and qualified leads) with patterns seen in Saudi real-estate advertising:
// payment-plan and price messages qualify better, lifestyle content brings cheap but weaker leads, Arabic outperforms
// English, and a creative shown too often (frequency > 4) fatigues. Live: from the ad platforms' ad-level reports.
import { familyOf } from "./history";

type Tpl = { name: string; nameAr: string; format: string; message: string; lang: "AR" | "EN"; weight: number; ctr: number; leadEff: number; qualEff: number; freq: number };
const MSG_AR: Record<string, string> = { "Payment plan": "خطة السداد", Price: "السعر", Lifestyle: "أسلوب الحياة", Location: "الموقع", "Floor plans": "المخططات", "Show unit tour": "جولة الوحدة النموذجية", Investment: "العائد الاستثماري", Launch: "الإطلاق", Brand: "العلامة" };
const FORMAT_AR: Record<string, string> = { "Video 15s": "فيديو 15 ثانية", "Video 30s": "فيديو 30 ثانية", Carousel: "عرض دوّار", Static: "صورة ثابتة", Story: "قصة", "Search ad": "إعلان بحث", "Lead form": "نموذج عملاء", "Featured listing": "إعلان مميز", "Standard listing": "إعلان عادي", "Creator reel": "ريل صانع محتوى", "Creator live tour": "جولة مباشرة لصانع محتوى", Billboard: "لوحة إعلانية", "Digital screen": "شاشة رقمية", Article: "مقال", "Press release": "بيان صحفي" };
export const tr = { msg: MSG_AR, format: FORMAT_AR };

const T = (name: string, nameAr: string, format: string, message: string, lang: "AR" | "EN", weight: number, ctr: number, leadEff: number, qualEff: number, freq: number): Tpl => ({ name, nameAr, format, message, lang, weight, ctr, leadEff, qualEff, freq });
const TEMPLATES: Record<string, Tpl[]> = {
  DIGITAL: [
    T("Payment plan 10/90 — video", "خطة سداد 10/90 — فيديو", "Video 15s", "Payment plan", "AR", 26, 1.4, 1.1, 1.45, 3.1),
    T("Floor plans carousel", "مخططات الوحدات — عرض دوّار", "Carousel", "Floor plans", "AR", 18, 1.1, 1.0, 1.2, 2.6),
    T("Search — apartments for sale", "بحث — شقق للبيع", "Search ad", "Location", "AR", 20, 4.8, 1.3, 1.25, 1.0),
    T("Lifestyle — sea view story", "أسلوب الحياة — قصة إطلالة البحر", "Story", "Lifestyle", "AR", 14, 0.9, 1.35, 0.55, 4.6),
    T("Price from — static (English)", "السعر يبدأ من — صورة ثابتة (إنجليزي)", "Static", "Price", "EN", 10, 0.7, 0.8, 1.0, 3.4),
    T("Instant lead form — register interest", "نموذج تسجيل اهتمام فوري", "Lead form", "Launch", "AR", 12, 1.2, 1.6, 0.45, 3.9),
  ],
  INFLUENCER: [
    T("Creator reel — family day at the project", "ريل صانع محتوى — يوم عائلي في المشروع", "Creator reel", "Lifestyle", "AR", 45, 2.1, 1.1, 0.8, 2.2),
    T("Live show-unit tour", "جولة مباشرة في الوحدة النموذجية", "Creator live tour", "Show unit tour", "AR", 35, 1.6, 0.9, 1.45, 1.8),
    T("Creator reel — English", "ريل صانع محتوى — إنجليزي", "Creator reel", "Lifestyle", "EN", 20, 1.3, 0.8, 0.7, 2.5),
  ],
  PORTAL: [
    T("Featured listing — video tour", "إعلان مميز — جولة فيديو", "Featured listing", "Show unit tour", "AR", 55, 3.2, 1.25, 1.15, 1.0),
    T("Standard listings", "إعلانات عادية", "Standard listing", "Price", "AR", 45, 1.6, 0.8, 0.85, 1.0),
  ],
  OUTDOOR: [
    T("Corniche billboards", "لوحات الكورنيش", "Billboard", "Brand", "AR", 70, 0, 1.0, 1.0, 0),
    T("Digital screens — Tahlia St.", "شاشات رقمية — شارع التحلية", "Digital screen", "Payment plan", "AR", 30, 0, 1.0, 1.0, 0),
  ],
  PR: [
    T("Launch article — business media", "مقال الإطلاق — الإعلام الاقتصادي", "Article", "Investment", "AR", 60, 0, 1.1, 1.1, 0),
    T("Press release — phase 2", "بيان صحفي — المرحلة الثانية", "Press release", "Launch", "AR", 40, 0, 0.85, 0.85, 0),
  ],
};
const CPM: Record<string, number> = { DIGITAL: 18, INFLUENCER: 26, PORTAL: 40, OUTDOOR: 30, PR: 0 };

type Camp = { id: string; name: string; vendor: string; asset: string; channel: string; status: string; spendK: number; leads: number; qualified: number };

/** Creatives of every live campaign that has ads (brokers have none). Sums match each campaign's totals. */
export function creativesFor(campaigns: Camp[]) {
  const out: any[] = [];
  for (const c of campaigns) {
    const fam = familyOf(c.channel), tpls = TEMPLATES[fam];
    if (!tpls) continue;
    const share = (k: (t: Tpl) => number) => { const w = tpls.map(k), s = w.reduce((a, b) => a + b, 0); return w.map((x) => x / s); };
    const spendW = share((t) => t.weight), leadW = share((t) => t.weight * t.leadEff), qualBase = tpls.map((t, i) => leadW[i] * t.qualEff), qs = qualBase.reduce((a, b) => a + b, 0);
    // Spread the campaign's leads and qualified leads, then fix rounding so they add up exactly.
    const leads = leadW.map((w) => Math.round(w * c.leads)), quals = qualBase.map((w) => Math.round((w / qs) * c.qualified));
    leads[0] += c.leads - leads.reduce((a, b) => a + b, 0); quals[0] += c.qualified - quals.reduce((a, b) => a + b, 0);
    tpls.forEach((t, i) => {
      const spendK = Math.round(c.spendK * spendW[i] * 10) / 10;
      const impressions = CPM[fam] ? Math.round((spendK * 1000 / CPM[fam]) * 1000) : null;
      const clicks = impressions && t.ctr ? Math.round(impressions * t.ctr / 100) : null;
      const q = Math.max(0, Math.min(quals[i], leads[i]));
      out.push({
        campaignId: c.id, campaign: c.name, vendor: c.vendor, project: c.asset, family: fam, creative: t.name, creativeAr: t.nameAr, format: t.format, message: t.message, language: t.lang,
        spendK, impressions, clicks, ctrPct: impressions && clicks ? Math.round((clicks / impressions) * 1000) / 10 : null, frequency: t.freq || null,
        leads: leads[i], qualified: q, cplSAR: leads[i] ? Math.round((spendK * 1000) / leads[i]) : null, cpqlSAR: q ? Math.round((spendK * 1000) / q) : null,
        qualRatePct: leads[i] ? Math.round((q / leads[i]) * 1000) / 10 : null, fatigued: t.freq > 4,
      });
    });
  }
  return out;
}
export type Creative = ReturnType<typeof creativesFor>[number];

/** Totals grouped by message, format or language (across campaigns, or filtered). */
export function creativeSummary(rows: Creative[], by: "message" | "format" | "language" | "creative") {
  const m = new Map<string, { key: string; spendK: number; leads: number; qualified: number; creatives: number }>();
  for (const r of rows) {
    const k = r[by] as string;
    const x = m.get(k) ?? (m.set(k, { key: k, spendK: 0, leads: 0, qualified: 0, creatives: 0 }), m.get(k)!);
    x.spendK += r.spendK; x.leads += r.leads; x.qualified += r.qualified; x.creatives++;
  }
  return [...m.values()].map((x) => ({ ...x, spendK: Math.round(x.spendK * 10) / 10, cpqlSAR: x.qualified ? Math.round((x.spendK * 1000) / x.qualified) : null, qualRatePct: x.leads ? Math.round((x.qualified / x.leads) * 1000) / 10 : null }))
    .sort((a, b) => (a.cpqlSAR ?? 1e9) - (b.cpqlSAR ?? 1e9));
}
