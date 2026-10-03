// Market context for Jeddah (and Riyadh for reference): monthly residential transactions and price per sqm per district,
// mortgage rates, competitor developers' projects, offers and ad activity, and the marketing calendar.
// SAMPLE DATA, invented but plausible — competitor names are fictional. Live sources: REGA / Ministry of Justice
// transactions, Ejar, portal listings (Bayut, Aqar, Property Finder), SAMA mortgage data, the Meta Ad Library.
import { calendarList } from "./calendar";
const r1 = (x: number) => Math.round(x * 10) / 10;

export const DISTRICTS = [
  { key: "Jeddah North", ar: "شمال جدة", note: "Ash Shati, Obhur — where Ash Shati Residences is", noteAr: "الشاطئ وأبحر — موقع مساكن الشاطئ", project: "Ash Shati Residences", base: 6100, growth: 0.006, tx: 410, txGrowth: 0.008, offPlanPct: 38 },
  { key: "Jeddah Corniche", ar: "كورنيش جدة", note: "Al Hamra, Corniche — where Marina Tower is", noteAr: "الحمراء والكورنيش — موقع برج المارينا", project: "Marina Tower", base: 9400, growth: 0.003, tx: 150, txGrowth: 0.002, offPlanPct: 46 },
  { key: "Jeddah South", ar: "جنوب جدة", note: "Al Andalus and around — where Andalus Quarter is; heavy off-plan supply", noteAr: "الأندلس وما حولها — موقع حي الأندلس؛ معروض كبير على الخارطة", project: "Andalus Quarter", base: 4300, growth: -0.001, tx: 380, txGrowth: -0.004, offPlanPct: 61 },
  { key: "Riyadh North", ar: "شمال الرياض", note: "Reference market — where many Jeddah investors come from", noteAr: "سوق مرجعي — منه كثير من مستثمري جدة", project: null, base: 7600, growth: 0.007, tx: 1250, txGrowth: 0.006, offPlanPct: 42 },
];
// 2023-01 … 2026-05. The series is anchored on 2025-01 (index 0), so the earlier months extend it backwards without
// changing any value from 2025 on.
const MONTHS = Array.from({ length: 41 }, (_, i) => { const d = new Date(Date.UTC(2023, i, 1)); return d.toISOString().slice(0, 7); });
const IDX = (m: string) => (Number(m.slice(0, 4)) - 2025) * 12 + Number(m.slice(5, 7)) - 1;
const SEASON = (m: string) => ({ "02": 0.92, "03": 0.95, "07": 0.78, "08": 0.8, "09": 1.12, "11": 1.08, "12": 1.05 } as Record<string, number>)[m.slice(5)] ?? 1;

/** Monthly transactions and average price per sqm per district. */
export function marketSeries() {
  return DISTRICTS.map((d) => ({
    district: d.key, districtAr: d.ar, note: d.note, noteAr: d.noteAr, project: d.project, offPlanSharePct: d.offPlanPct,
    months: MONTHS.map((m) => IDX(m)).map((i, k) => ({ month: MONTHS[k], pricePerSqmSAR: Math.round(d.base * (1 + d.growth) ** i * (1 + Math.sin(i * 1.7) * 0.006)), transactions: Math.round(d.tx * (1 + d.txGrowth) ** i * SEASON(MONTHS[k])) })),
  }));
}
/** Latest month vs the same month last year, and last 3 months vs the 3 before. */
export function marketSummary() {
  return marketSeries().map((s) => {
    const last = s.months[s.months.length - 1], yAgo = s.months[s.months.length - 13];
    const l3 = s.months.slice(-3).reduce((a, b) => a + b.transactions, 0), p3 = s.months.slice(-6, -3).reduce((a, b) => a + b.transactions, 0);
    return { district: s.district, districtAr: s.districtAr, note: s.note, noteAr: s.noteAr, project: s.project, offPlanSharePct: s.offPlanSharePct, month: last.month, pricePerSqmSAR: last.pricePerSqmSAR, priceYoYPct: r1((last.pricePerSqmSAR / yAgo.pricePerSqmSAR - 1) * 100), transactions: last.transactions, transactionsYoYPct: r1((last.transactions / yAgo.transactions - 1) * 100), last3vsPrev3Pct: r1((l3 / p3 - 1) * 100) };
  });
}
export const MORTGAGE = MONTHS.map((m) => ({ m, i: IDX(m) })).map(({ m, i }) => ({ month: m, rateFromPct: r1(5.6 - i * 0.04), newMortgagesSARbn: r1(6.8 + i * 0.12 + Math.sin(i) * 0.3) }));

export const COMPETITORS = [
  { name: "Sahil Living", nameAr: "ساحل ليفنج", project: "Sahil Bay", projectAr: "خليج ساحل", district: "Jeddah North", type: "Apartments", pricePerSqmSAR: 6400, launched: "2025-10", offer: "10/90 payment plan; 2 years service charges free", offerAr: "خطة سداد 10/90؛ إعفاء رسوم الخدمات لسنتين", activeAds: [14, 18, 22, 25, 31], channels: "Meta, Snap, portals, brokers", threatTo: "Ash Shati Residences" },
  { name: "Mirsa Developments", nameAr: "مرسى للتطوير", project: "Mirsa Towers", projectAr: "أبراج مرسى", district: "Jeddah Corniche", type: "Apartments, penthouses", pricePerSqmSAR: 9900, launched: "2026-02", offer: "Guaranteed 6% rental yield for 3 years", offerAr: "عائد إيجاري مضمون 6% لثلاث سنوات", activeAds: [0, 6, 12, 16, 15], channels: "Meta, Google, outdoor, Cityscape", threatTo: "Marina Tower" },
  { name: "Qimma Homes", nameAr: "قمة هومز", project: "Qimma Gardens", projectAr: "حدائق قمة", district: "Jeddah South", type: "Townhouses, apartments", pricePerSqmSAR: 4100, launched: "2025-06", offer: "Registration fees covered; 5% discount for cash", offerAr: "تحمّل رسوم التسجيل؛ خصم 5% للدفع نقداً", activeAds: [20, 21, 19, 24, 26], channels: "Meta, TikTok, creators, brokers", threatTo: "Andalus Quarter" },
  { name: "Lumen Residences", nameAr: "لومن ريزيدنسز", project: "Lumen South", projectAr: "لومن الجنوب", district: "Jeddah South", type: "Apartments", pricePerSqmSAR: 3950, launched: "2026-03", offer: "1% down payment, rest on handover", offerAr: "دفعة أولى 1% والباقي عند التسليم", activeAds: [0, 0, 9, 17, 23], channels: "Meta, Snap, portals", threatTo: "Andalus Quarter" },
  { name: "Wadi Crest", nameAr: "وادي كريست", project: "Crest Villas", projectAr: "فلل كريست", district: "Jeddah North", type: "Villas", pricePerSqmSAR: 5800, launched: "2025-04", offer: "Price lock until handover", offerAr: "تثبيت السعر حتى التسليم", activeAds: [8, 7, 9, 8, 10], channels: "Portals, brokers", threatTo: "Ash Shati Residences" },
];
export const AD_MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"];
/** 2025-01 → 2026-05: active Meta ads per competitor, 2025 reconstructed from the launch date (none before it, then a
 * ramp up to the January 2026 level). The 2026 months are the ones above, unchanged. */
export const AD_MONTHS_ALL = Array.from({ length: 17 }, (_, i) => new Date(Date.UTC(2025, i, 1)).toISOString().slice(0, 7));
export function adsHistory(x: { launched: string; activeAds: number[] }): number[] {
  const first = x.activeAds[0] ?? 0, n = AD_MONTHS_ALL.indexOf("2026-01"), from = AD_MONTHS_ALL.findIndex((m) => m >= x.launched);
  const early = AD_MONTHS_ALL.slice(0, n).map((m, i) => (m < x.launched || from < 0 || from >= n ? 0 : Math.round(first * (0.35 + 0.65 * ((i - from + 1) / (n - from))))));
  return [...early, ...x.activeAds];
}

/** The marketing calendar for the next 12 months (celebrations, seasons, events) — see lib/calendar.ts. */
export const CALENDAR = calendarList(365);
