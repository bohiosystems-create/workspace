// Predictive maintenance: which equipment is heading for its limit, and when — from the predictive engine (pdm.ts: onset
// detection, linear and accelerating models, remaining life with its band, failure-mode diagnosis, backtested). fitLine
// and crossing stay as the simple straight-line view (used where only the fourteen days are at hand). The orchestrator acts before the crossing: a predictive job (PdM) on
// the asset, due the day before, with the spare ordered if it can't arrive in time — or the planned maintenance brought
// forward when it is already scheduled. Deterministic, so the same picture gives the same predictions.
import type { Asset, FmData, Reading } from "./types";
import { isOpen } from "./engine";
import { pdmReport } from "./pdm";

export interface Prediction {
  assetId: string; tag: string; name: string; facilityId: string; zone: string; criticality: Asset["criticality"];
  reading: { key: string; name: string; unit: string };
  value: number; limit: number; side: "high" | "low";
  /** change per day, and how well the straight line fits the fourteen days (0–1) */
  slopePerDay: number; fit: number;
  /** days until it crosses the limit, and the date */
  days: number; crosses: string;
  risk: "high" | "medium" | "low";
  /** the next planned maintenance, and whether it comes before the crossing */
  nextPm: string; pmFirst: boolean;
  /** the work already open on the asset, if any */
  openWo?: string;
  /** the parts it uses that are short for the time left */
  spareShort?: { id: string; part: string; stock: number; leadDays: number };
  /** the last fourteen days, for the sparkline */
  trend: number[];
  /** from the engine: remaining life P10/P50/P90 (days), probability of crossing within 7 and 30 days, the model, when the
   *  degradation began, the asset's health index and the failure mode diagnosed */
  rul: { p10: number; p50: number; p90: number }; p7: number; p30: number; model: "linear" | "accelerating"; onsetDaysAgo: number; health: number;
  mode?: { id: string; name: string; score: number; checklist: string[]; evidence: string[] };
}

const DAY = 86_400_000;
const CRIT_W = { A: 3, B: 2, C: 1 } as const;

/** Least squares through the points: slope per step and R². */
export function fitLine(ys: number[]): { slope: number; r2: number } {
  const n = ys.length, xm = (n - 1) / 2, ym = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  ys.forEach((y, x) => { sxy += (x - xm) * (y - ym); sxx += (x - xm) ** 2; syy += (y - ym) ** 2; });
  const slope = sxx ? sxy / sxx : 0;
  return { slope, r2: syy ? (sxy * sxy) / (sxx * syy) : 0 };
}

/** One reading's crossing, or null when it is steady, noisy, already past its limit or far off. */
export function crossing(r: Reading, horizonDays = 30): { side: "high" | "low"; limit: number; slope: number; fit: number; days: number } | null {
  if (r.trend.length < 7 || r.unit === "pass") return null;
  const { slope, r2 } = fitLine(r.trend);
  if (r2 < 0.6) return null; // noise, not a trend
  const side = slope > 0 && r.high !== undefined ? "high" : slope < 0 && r.low !== undefined ? "low" : null;
  if (!side) return null;
  const limit = side === "high" ? r.high! : r.low!;
  const gap = side === "high" ? limit - r.value : r.value - limit;
  if (gap <= 0) return null; // already past: an alarm, not a prediction
  const days = gap / Math.abs(slope);
  return days <= horizonDays ? { side, limit, slope, fit: r2, days } : null;
}

/** The readings heading for their limit within the month, from the predictive engine (lib/fm/pdm.ts): its remaining
 *  life (P50, with P10–P90), its probability, its model and diagnosis — in the shape the orchestrator, the team plan and
 *  the complaints analysis use. A reading already past its limit is an alarm, not a prediction. */
export function predictions(d: FmData, facilityId?: string, now = Date.now()): Prediction[] {
  const out: Prediction[] = [];
  for (const fid of facilityId ? [facilityId] : d.facilities.map((f) => f.id)) {
    for (const h of pdmReport(d, fid).assets) {
      const a = d.assets.find((x) => x.id === h.assetId)!;
      for (const sr of h.series.filter((x) => x.status === "degrading" && x.rul && x.p30 >= 0.5)) {
        const r = a.readings.find((x) => x.key === sr.key)!;
        const days = Math.max(0.5, Math.round(sr.rul!.p50 * 10) / 10);
        const crosses = new Date(now + days * DAY).toISOString().slice(0, 10);
        const score = CRIT_W[a.criticality] * (sr.p7 >= 0.5 ? 3 : sr.p30 >= 0.8 ? 2 : 1);
        const open = d.workOrders.find((w) => w.assetId === a.id && isOpen(w) && w.type !== "PM");
        const short = d.spares.filter((s) => s.facilityId === a.facilityId && a.spares.includes(s.part) && s.stock + (s.onOrder ?? 0) < 1 && s.leadDays > days).sort((x, y) => y.leadDays - x.leadDays)[0];
        out.push({ assetId: a.id, tag: a.tag, name: a.name, facilityId: a.facilityId, zone: a.zone, criticality: a.criticality,
          reading: { key: r.key, name: r.name, unit: r.unit }, value: r.value, limit: sr.limit, side: sr.side,
          slopePerDay: (sr.side === "high" ? 1 : -1) * (sr.rate ?? 0), fit: sr.fit ?? 0, days, crosses,
          risk: score >= 6 ? "high" : score >= 4 ? "medium" : "low", nextPm: a.nextPm, pmFirst: a.nextPm < crosses,
          ...(open ? { openWo: open.id } : {}), ...(short ? { spareShort: { id: short.id, part: short.part, stock: short.stock, leadDays: short.leadDays } } : {}), trend: r.trend,
          rul: sr.rul!, p7: sr.p7, p30: sr.p30, model: sr.model!, onsetDaysAgo: sr.onsetDaysAgo ?? 0, health: h.health,
          ...(h.diagnosis ? { mode: { id: h.diagnosis.modeId, name: h.diagnosis.name, score: h.diagnosis.score, checklist: h.diagnosis.checklist, evidence: h.diagnosis.evidence } } : {}) });
      }
    }
  }
  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((x, y) => rank[x.risk] - rank[y.risk] || x.days - y.days);
}

/** The prediction in a sentence: "Supply-air temperature 16.2 °C, rising 0.12 °C a day since 12 days ago: crosses 17 °C in
 *  about 6 days (4–9 days, 96 % within 30 days)". */
export function predictionText(p: Prediction) {
  const u = p.reading.unit ? ` ${p.reading.unit}` : "";
  const rate = `${p.side === "high" ? "rising" : "falling"} ${Math.abs(p.slopePerDay)}${u} a day${p.model === "accelerating" ? " and accelerating" : ""}`;
  const band = `${Math.round(p.rul.p10)}–${p.rul.p90 >= 999 ? "60+" : Math.round(p.rul.p90)} days, ${Math.round(p.p30 * 100)} % within 30 days`;
  return `${p.reading.name} ${p.value}${u}, ${rate}: crosses its ${p.side === "high" ? "alarm" : "low limit"} of ${p.limit}${u} in about ${p.days < 1 ? "a day" : `${Math.round(p.days)} days`} (${p.crosses}; ${band})`;
}
