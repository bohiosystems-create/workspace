// The predictive maintenance engine. For every reading of every running asset it keeps a 90-day daily series (from the
// plant historian when one sends readings — /api/v1/readings — otherwise the demo's history), and asks:
//
//   1. Has it started to degrade, and since when?   One-sided CUSUM against the reading's own baseline (median and
//      MAD of the earlier weeks): the onset is where the cumulative drift towards the limit began.
//   2. How is it degrading?   Two models on the data since the onset — a straight line, and an accelerating curve (the
//      P–F curve: wear feeds on itself) — the one with the lower AICc wins.
//   3. When will it cross its limit, and how sure are we?   Remaining useful life as P10 / P50 / P90 from the
//      uncertainty of the fitted rate, and the probability of crossing within 7 and 30 days.
//   4. Is anything odd even far from the limit?   An EWMA control chart on the last days against the baseline: a step
//      or a spike the limits would only catch later.
//   5. What is failing?   The asset's signals read together against a failure-mode library (a pump's vibration and
//      bearing temperature rising together is bearing wear; vibration with falling flow is the impeller or cavitation).
//   6. How likely is it to fail anyway?   A Weibull age model per class (time since its last planned maintenance), so
//      equipment with no warning signs still carries its baseline risk.
//   7. What does it cost?   Probability × consequence (downtime hours × the cost of an hour for its criticality, plus the
//      repair), against the cost of acting now: the expected saving ranks the work, and "act by" leaves time for the
//      spare to arrive.
//   8. How good is it?   A backtest on the failures in the history (predicted remaining life against what happened,
//      coverage of the P10–P90 band, warning lead time, false alarms), and the technicians' verdicts on its jobs
//      (confirmed / not found), which lower its confidence in failure modes it keeps getting wrong.
//
// Deterministic for a given day, client-safe (no node imports): the UI, the agent, the orchestrator and the API see the
// same numbers.
import type { Asset, FmData, Reading, WorkOrder } from "./types";
import { rng } from "../data/util";

const DAY = 86_400_000;
export const HISTORY_DAYS = 90;

// ------------------------------------------------------------------ the series
export interface Series {
  assetId: string; cls: string; key: string; name: string; unit: string; low?: number; high?: number;
  /** daily values, oldest first; the last is today */
  values: number[];
  /** day indexes where a repair brought the reading back (a closed corrective or predictive job) */
  repairs: number[];
  /** past failures in the history (day the limit was crossed), for the backtest */
  failures: number[];
  source: "historian" | "demo";
}

/** Historian readings pushed to /api/v1/readings: daily means per asset and reading. */
export type HistoryStore = Record<string, { day: string; v: number; n: number }[]>;
export const seriesKey = (assetId: string, key: string) => `${assetId}|${key}`;

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const r2 = (x: number) => Math.round(x * 100) / 100;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };

/** Readings that tell the condition of the equipment — not how it is being operated (a tank's level, a turbine's load,
 *  a separator's pressure, a counter of operations): those move with the process, not with wear. */
const PROCESS_KEYS = new Set(["lvl", "level", "load", "mw", "thru", "run", "hrs", "fuel", "rate", "drum", "att", "spd", "ops", "flow@flare", "press@separator", "h2s@separator", "press@pipeline", "rej@eds", "lamps@ccr"]);
export const isConditionReading = (cls: string, key: string) => !PROCESS_KEYS.has(key) && !PROCESS_KEYS.has(`${key}@${cls}`);

/** The 90 days of one reading: the historian's when it has at least a week, else the demo history — the asset's last
 *  fourteen days as generated, preceded by eleven weeks of its baseline with noise and, on some assets, an earlier
 *  degradation that crossed the limit and was repaired (what the backtest learns from). */
export function seriesFor(a: Asset, r: Reading, date: string, store?: HistoryStore, repairsAt: string[] = []): Series | null {
  if (r.unit === "pass" || r.unit.startsWith("of ") || (r.high === undefined && r.low === undefined) || !isConditionReading(a.class, r.key)) return null;
  if (r.trend.every((v) => v === 0)) return null; // stopped: nothing to read
  const base: Omit<Series, "values" | "repairs" | "failures" | "source"> = { assetId: a.id, cls: a.class, key: r.key, name: r.name, unit: r.unit, low: r.low, high: r.high };
  const dayIdx = (iso: string) => HISTORY_DAYS - 1 - Math.round((Date.parse(date) - Date.parse(iso.slice(0, 10))) / DAY);
  const repairs = repairsAt.map(dayIdx).filter((i) => i >= 0 && i < HISTORY_DAYS);
  const hist = store?.[seriesKey(a.id, r.key)];
  if (hist && hist.length >= 7) {
    const byDay = new Map(hist.map((h) => [h.day, h.v]));
    const values: number[] = [];
    let last = hist[0].v;
    for (let i = 0; i < HISTORY_DAYS; i++) { const day = new Date(Date.parse(date) - (HISTORY_DAYS - 1 - i) * DAY).toISOString().slice(0, 10); last = byDay.get(day) ?? last; values.push(last); }
    values[HISTORY_DAYS - 1] = byDay.get(date) ?? r.value;
    return { ...base, values, repairs, failures: [], source: "historian" };
  }
  // demo: the last fourteen days are the generated ones; a repair today shows as today's value back near the baseline
  const R = rng(hash(`${a.id}|${r.key}`));
  const recent = [...r.trend];
  if (r.value !== recent[recent.length - 1]) recent[recent.length - 1] = r.value;
  const start = recent[0], limit = r.high ?? r.low!;
  // the same noise as the recent days (sum of three uniforms: about normal, sd 0.5 — doubled)
  const noiseSd = Math.max(sdOf(detrend(r.trend)), Math.abs(limit - start) * 0.004, 1e-6);
  const n0 = HISTORY_DAYS - recent.length;
  const older: number[] = [];
  for (let i = 0; i < n0; i++) older.push(start + (R() + R() + R() - 1.5) * 2 * noiseSd);
  // an earlier degradation on about a third of the assets: accelerating towards the limit, crossing it, then repaired
  const failures: number[] = [];
  if (R() < 0.34 && a.status !== "standby") {
    const pf = PF_DAYS[CLASS_GROUP[a.class] ?? "rotating"];
    const len = Math.min(48, Math.round(pf * (0.7 + R() * 0.5))), s0 = 4 + Math.floor(R() * Math.max(1, n0 - len - 12)), over = 1.06 + R() * 0.06, k = (3 + R() * 2) / len;
    const top = start + (limit - start) * over;
    const accel = R() < 0.5; // wear that feeds on itself, or a steady one
    for (let t = 0; t <= len; t++) older[s0 + t] = start + (top - start) * (accel ? (Math.exp(k * t) - 1) / (Math.exp(k * len) - 1) : t / len) + (R() + R() + R() - 1.5) * 2 * noiseSd;
    const cross = older.findIndex((v, i) => i >= s0 && i <= s0 + len && (r.high !== undefined ? v > r.high : v < r.low!));
    if (cross >= 0) failures.push(cross);
    repairs.push(s0 + len + 1);
  }
  return { ...base, values: [...older.map((v) => Math.round(v * 1000) / 1000), ...recent], repairs: [...new Set(repairs)].sort((x, y) => x - y), failures, source: "demo" };
}
function detrend(ys: number[]) { const { a, b } = ols(ys.map((_, i) => i), ys); return ys.map((y, i) => y - (a + b * i)); }
function sdOf(xs: number[]) { const m = xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length); return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, xs.length - 1)); }

// ------------------------------------------------------------------ statistics
function ols(xs: number[], ys: number[]) {
  const n = xs.length, xm = xs.reduce((s, x) => s + x, 0) / n, ym = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - xm) * (ys[i] - ym); sxx += (xs[i] - xm) ** 2; syy += (ys[i] - ym) ** 2; }
  const b = sxx ? sxy / sxx : 0, a = ym - b * xm;
  const sse = ys.reduce((s, y, i) => s + (y - (a + b * xs[i])) ** 2, 0);
  return { a, b, sxx, sse, r2: syy ? 1 - sse / syy : 0, n };
}
/** Standard normal CDF (Abramowitz–Stegun 7.1.26). */
export function phi(z: number) { const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2); return z >= 0 ? (1 + y) / 2 : (1 - y) / 2; }
const aicc = (sse: number, n: number, k: number) => n * Math.log(Math.max(sse, 1e-12) / n) + 2 * k + (n - k - 1 > 0 ? (2 * k * (k + 1)) / (n - k - 1) : 1e6);
const Z90 = 1.2816;

// ------------------------------------------------------------------ one series
export type SeriesStatus = "stable" | "anomaly" | "degrading" | "alarm" | "reset";
export interface SeriesResult {
  key: string; name: string; unit: string; value: number;
  side: "high" | "low"; limit: number;
  status: SeriesStatus;
  baseline: { median: number; sigma: number };
  /** days ago the degradation began (CUSUM onset) */
  onsetDaysAgo?: number;
  model?: "linear" | "accelerating"; fit?: number;
  /** current rate per day (towards the limit), and the remaining life in days */
  rate?: number; rul?: { p10: number; p50: number; p90: number };
  /** probability of crossing the limit within 7 and 30 days */
  p7: number; p30: number;
  /** EWMA of the last days, in baseline sigmas */
  z: number;
  /** for the chart: the series, and the model's line from the onset to the crossing */
  values: number[]; projection?: { day: number; v: number; lo: number; hi: number }[];
  source: Series["source"];
  /** before recalibration: the remaining life's log mean and spread (what the backtest calibrates) */
  logMu?: number; logSd?: number;
}

/** Analyses a series as of its last value (or as of day `upto`, for the backtest). */
/** The recalibration learned on the backtest, in log days: the bias of the engine's remaining life (real − estimated,
 *  median) and the spread of its errors (their 10th and 90th percentiles). */
export interface Calibration { shift: number; lo: number; hi: number }
export interface AnalyseOpts { cal?: Calibration }
export function analyse(s: Series, upto = s.values.length - 1, o: AnalyseOpts = {}): SeriesResult {
  const ys = s.values.slice(0, upto + 1), n = ys.length, now = n - 1, v = ys[now];
  const lastRepair = Math.max(-1, ...s.repairs.filter((i) => i <= now));
  // the baseline: the weeks before the last three, after any repair (robust: median and MAD)
  const bFrom = Math.max(0, lastRepair + 1, n - 60), bTo = Math.max(bFrom + 7, n - 21);
  const bw = ys.slice(bFrom, Math.min(bTo, n));
  const med = median(bw), mad = median(bw.map((x) => Math.abs(x - med)));
  // which limit: the one the recent days move towards (else the nearer one)
  const recent = ols(ys.slice(-14).map((_, i) => i), ys.slice(-14));
  const side: "high" | "low" = s.high !== undefined && s.low !== undefined ? (recent.b >= 0 ? "high" : "low") : s.high !== undefined ? "high" : "low";
  const limit = side === "high" ? s.high! : s.low!, dir = side === "high" ? 1 : -1;
  const sigma = Math.max(1.4826 * mad, Math.abs(limit - med) * 0.015, 1e-6);
  // EWMA on the last ten days (λ 0.3), in sigmas
  let ew = 0; for (const x of ys.slice(-10)) ew = 0.3 * ((x - med) / sigma) + 0.7 * ew;
  const z = r2(ew), ewLimit = 3 * Math.sqrt(0.3 / 1.7);
  const out: SeriesResult = { key: s.key, name: s.name, unit: s.unit, value: v, side, limit, status: "stable", baseline: { median: r2(med), sigma: Math.round(sigma * 1000) / 1000 }, p7: 0, p30: 0, z, values: ys, source: s.source };
  if (dir * (v - limit) > 0) return { ...out, status: "alarm", p7: 1, p30: 1, rul: { p10: 0, p50: 0, p90: 0 } };
  if (lastRepair >= n - 3) return { ...out, status: "reset" }; // just repaired: watching it settle
  // onset: one-sided CUSUM towards the limit over the last 45 days (k 0.5σ, h 5σ)
  let S = 0, zeroAt = Math.max(lastRepair + 1, n - 45), onset = -1;
  for (let t = Math.max(lastRepair + 1, n - 45); t < n; t++) {
    S = Math.max(0, S + dir * (ys[t] - med) / sigma - 0.5);
    if (S === 0) zeroAt = t + 1;
    if (S > 5 && onset < 0) onset = zeroAt;
  }
  if (onset < 0 || n - onset < 4) return { ...out, status: Math.abs(ew) > ewLimit ? "anomaly" : "stable" };
  // two models on the data since the onset
  const xs = ys.slice(onset).map((_, i) => onset + i - now), yw = ys.slice(onset), m = yw.length;
  const lin = ols(xs, yw);
  let best: { model: "linear" | "accelerating"; rate: number; se: number; fit: number; rulOf: (q: number) => number; yAt: (t: number) => number; seAt: (t: number) => number };
  const gap = dir * (limit - (lin.a)); // a = the fitted value today (x = 0 is today)
  const seB = Math.sqrt(lin.sse / Math.max(1, m - 2) / Math.max(lin.sxx, 1e-9));
  const linCand = { model: "linear" as const, rate: dir * lin.b, se: seB, fit: Math.max(0, lin.r2),
    rulOf: (q: number) => { const sl = dir * lin.b + q * seB; return sl > 0 ? Math.max(0, gap / sl) : Infinity; },
    yAt: (t: number) => lin.a + lin.b * t, seAt: (t: number) => seB * Math.abs(t) };
  best = linCand;
  // accelerating: ln(dir·(y − baseline)) = c + k·t, where the excursion is clear of the noise
  const pts = xs.map((x, i) => ({ x, e: dir * (yw[i] - med) })).filter((p) => p.e > 0.5 * sigma);
  if (pts.length >= 5) {
    const ex = ols(pts.map((p) => p.x), pts.map((p) => Math.log(p.e)));
    if (ex.b > 0) {
      const yAt = (t: number) => med + dir * Math.exp(ex.a + ex.b * t);
      const sse = xs.reduce((s2, x, i) => s2 + (yw[i] - yAt(x)) ** 2, 0);
      if (aicc(sse, m, 3) < aicc(lin.sse, m, 2) - 1) {
        const seK = Math.sqrt(ex.sse / Math.max(1, pts.length - 2) / Math.max(ex.sxx, 1e-9));
        const ratio = Math.log(Math.max(1e-9, dir * (limit - med)) / Math.exp(ex.a)); // ln(limit excursion / today's excursion)
        const syy = yw.reduce((s2, y) => s2 + (y - yw.reduce((q, w) => q + w, 0) / m) ** 2, 0);
        best = { model: "accelerating", rate: ex.b * Math.exp(ex.a), se: seK, fit: Math.max(0, syy ? 1 - sse / syy : 0),
          rulOf: (q: number) => { const k = ex.b + q * seK; return k > 0 ? Math.max(0, ratio / k) : Infinity; },
          yAt, seAt: (t: number) => Math.abs(yAt(t) - med) * seK * Math.abs(t) };
      }
    }
  }
  if (best.rate <= 0) return { ...out, status: Math.abs(ew) > ewLimit ? "anomaly" : "stable", onsetDaysAgo: now - onset };
  // remaining life in log space: the data's estimate combined with the P–F prior (the typical days from first sign to
  // failure, less the days already gone since the onset); then the recalibration learned on the backtest
  const d10 = best.rulOf(Z90), d50 = best.rulOf(0), d90 = best.rulOf(-Z90);
  const muD = Math.log(Math.max(0.3, Number.isFinite(d50) ? d50 : 3650));
  const sdD = Number.isFinite(d90) && d10 > 0 ? Math.max(0.05, (Math.log(d90) - Math.log(Math.max(0.3, d10))) / (2 * Z90)) : 1.5;
  const pf = PF_DAYS[CLASS_GROUP[s.cls] ?? "rotating"], muP = Math.log(Math.max(1, pf - (now - onset))), sdP = 1;
  // a drift many times slower than a failure develops is not one developing: noted (the onset), not predicted — the
  // prior only sharpens a degradation the data already shows heading for the limit
  if (!Number.isFinite(d50) || d50 > 4 * pf + (now - onset)) return { ...out, status: Math.abs(ew) > ewLimit ? "anomaly" : "stable", onsetDaysAgo: now - onset };
  const wD = 1 / sdD ** 2, wP = 1 / sdP ** 2, mu0 = (muD * wD + muP * wP) / (wD + wP), sd0 = 1 / Math.sqrt(wD + wP);
  // calibrated: shifted by the learned bias; the band the wider of the learned error spread and the series' own
  const cal = o.cal ?? { shift: 0, lo: -Z90 * 0.6, hi: Z90 * 0.6 };
  const mu = mu0 + cal.shift, lo = Math.min(cal.lo, cal.shift - Z90 * sd0) - cal.shift, hi = Math.max(cal.hi, cal.shift + Z90 * sd0) - cal.shift;
  const sd = Math.max(0.05, (hi - lo) / (2 * Z90));
  const p10 = Math.exp(mu + lo), p50 = Math.exp(mu), p90 = Math.exp(mu + hi);
  const pBy = (h: number) => phi((Math.log(h) - mu) / sd);
  // a slow drift, far from its limit: noted (the onset), not predicted
  if (p50 > 180 && pBy(30) < 0.05) return { ...out, status: Math.abs(ew) > ewLimit ? "anomaly" : "stable", onsetDaysAgo: now - onset };
  const cap = (x: number) => Math.round(Math.min(999, x) * 10) / 10;
  const end = Math.min(60, Math.ceil(p50) + 3);
  const projection = Array.from({ length: Math.max(2, end + (now - onset) + 1) }, (_, i) => onset - now + i).map((t) => ({ day: t, v: r2(best.yAt(t)), lo: r2(best.yAt(t) - Z90 * best.seAt(t)), hi: r2(best.yAt(t) + Z90 * best.seAt(t)) }));
  return { ...out, status: "degrading", onsetDaysAgo: now - onset, model: best.model, fit: r2(best.fit), rate: Math.round(best.rate * 1000) / 1000,
    rul: { p10: cap(p10), p50: cap(p50), p90: cap(p90) }, p7: r2(pBy(7)), p30: r2(pBy(30)), projection, logMu: mu0, logSd: sd0 };
}

// ------------------------------------------------------------------ failure modes
export interface FailureMode { id: string; classes: string[]; name: string; signals: [key: string, dir: 1 | -1, weight: number][]; action: string; checklist: string[] }
const FM = (id: string, classes: string[], name: string, signals: FailureMode["signals"], action: string, checklist: string[]): FailureMode => ({ id, classes, name, signals, action, checklist });
export const FAILURE_MODES: FailureMode[] = [
  FM("pump-bearing", ["pump", "hpump"], "Bearing wear", [["vib", 1, 0.5], ["brg", 1, 0.5]], "Vibration analysis and bearing replacement", ["Take a vibration spectrum (bearing defect frequencies)", "Check lubrication and grease the bearings", "Replace the bearings if the spectrum confirms", "Record vibration and bearing temperature after"]),
  FM("pump-impeller", ["pump"], "Impeller wear or cavitation", [["vib", 1, 0.4], ["flow", -1, 0.6]], "Check suction conditions and the impeller", ["Check suction pressure and strainer", "Listen for cavitation", "Inspect the impeller and wear rings at the next stop"]),
  FM("pump-motor", ["pump", "hpump"], "Motor overload or winding fault", [["amps", 1, 0.7], ["brg", 1, 0.3]], "Electrical test of the motor", ["Measure phase currents and insulation", "Thermal image of the motor and terminal box", "Check alignment and the driven load"]),
  FM("hpump-wear", ["hpump"], "Internal wear (wear rings, stages)", [["dp", -1, 0.7], ["amps", 1, 0.3]], "Performance test and overhaul planning", ["Run a performance test against the curve", "Plan the overhaul in the next window"]),
  FM("gt-hot", ["gt"], "Hot-section or combustor fault", [["exh", 1, 1]], "Borescope of the combustor and hot section", ["Check the exhaust thermocouples", "Borescope the combustor and transition pieces", "Plan the combustion inspection"]),
  FM("gt-fouling", ["gt"], "Compressor fouling", [["ce", -1, 0.8], ["mw", -1, 0.2]], "Compressor wash", ["Check inlet filter differential", "Offline compressor wash at the next stop", "Compare efficiency after"]),
  FM("rot-vib", ["gt", "st", "expander", "erd"], "Rotor or bearing deterioration", [["vib", 1, 1]], "Vibration diagnostics", ["Full vibration survey (orbit, phase)", "Check bearing oil and temperatures", "Plan balancing or bearing work"]),
  FM("st-vacuum", ["st"], "Condenser fouling or air ingress", [["vac", 1, 1]], "Condenser performance check", ["Air in-leakage test", "Check cooling-water flow and tube cleanliness", "Plan tube cleaning"]),
  FM("hrsg-fouling", ["hrsg"], "Tube fouling", [["stack", 1, 1]], "Gas-side cleaning", ["Check gas-side differential", "Plan soot/fouling cleaning"]),
  FM("xfmr-dga", ["transformer"], "Internal thermal or insulation fault", [["h2", 1, 0.6], ["oil", 1, 0.2], ["wdg", 1, 0.2]], "Full DGA and electrical tests", ["Oil sample for full dissolved-gas analysis", "Thermal image of the tank and bushings", "Plan electrical tests (winding resistance, FRA)"]),
  FM("xfmr-cooling", ["transformer"], "Cooling degradation", [["oil", 1, 0.5], ["wdg", 1, 0.5]], "Check fans, pumps and radiators", ["Check cooling fans and oil pumps", "Clean the radiators"]),
  FM("brk-sf6", ["breaker"], "SF₆ leak", [["sf6", -1, 1]], "Leak detection and top-up", ["Leak survey with an SF₆ camera", "Top up and repair the seal"]),
  FM("ro-fouling", ["ro"], "Membrane fouling", [["dp", 1, 0.6], ["fp", 1, 0.4]], "Clean-in-place (CIP)", ["Check pre-treatment (SDI, cartridge filters)", "Run a CIP", "Compare normalised flow after"]),
  FM("ro-scaling", ["ro"], "Scaling or membrane damage", [["cond", 1, 0.7], ["rec", -1, 0.3]], "Probe the vessels, check antiscalant", ["Check antiscalant dosing", "Probe vessels for the worst conductivity", "Replace damaged elements"]),
  FM("uf-fouling", ["uf"], "UF fouling", [["tmp", 1, 0.7], ["flux", -1, 0.3]], "Chemically enhanced backwash", ["Run a CEB", "Check backwash frequency"]),
  FM("uf-breach", ["uf"], "Fibre breach", [["turb", 1, 1]], "Integrity test", ["Pressure-decay test", "Isolate and pin the broken fibres"]),
  FM("erd-seal", ["erd"], "Seal wear (mixing)", [["mix", 1, 0.7], ["eff", -1, 0.3]], "Plan seal replacement", ["Check lubrication flow", "Plan the seal kit"]),
  FM("ch-condenser", ["chiller"], "Condenser fouling", [["appr", 1, 0.6], ["kwtr", 1, 0.4]], "Clean the condenser tubes", ["Check condenser water flow and temperatures", "Brush the condenser tubes", "Check water treatment"]),
  FM("ch-capacity", ["chiller"], "Low refrigerant or capacity loss", [["chws", 1, 0.7], ["kwtr", 1, 0.3]], "Refrigerant check", ["Check refrigerant charge and leaks", "Check compressor loading"]),
  FM("ahu-filter", ["ahu"], "Filters loading", [["dpf", 1, 1]], "Replace the filters", ["Replace the filters", "Check for bypass"]),
  FM("ahu-coil", ["ahu"], "Cooling coil or valve fault", [["sat", 1, 1]], "Check the chilled-water valve and coil", ["Stroke the chilled-water valve", "Check coil fouling and the belt", "Check the supply-air sensor"]),
  FM("esc-brake", ["escalator"], "Brake wear", [["brk", 1, 0.8], ["trips", 1, 0.2]], "Brake inspection", ["Measure brake lining and air gap", "Replace the lining if worn"]),
  FM("lift-door", ["lift"], "Door operator wear", [["door", 1, 0.8], ["trips", 1, 0.2]], "Door operator service", ["Clean the sill and adjust the door operator", "Check the door sensors"]),
  FM("pbb-drive", ["pbb"], "Drive faults", [["faults", 1, 0.6], ["avail", -1, 0.4]], "Drive inspection", ["Read the drive fault log", "Check wheels and the drive motors"]),
  FM("bhs-motor", ["bhs"], "Motor or gearbox wear", [["mtr", 1, 0.7], ["jams", 1, 0.3]], "Motor and gearbox check", ["Thermal image of motors and gearboxes", "Check belt tracking and rollers"]),
  FM("ups-battery", ["ups"], "Battery degradation", [["batt", -1, 0.8], ["load", 1, 0.2]], "Battery test", ["Discharge test of the strings", "Replace weak blocks"]),
  FM("cmp-valves", ["compressor"], "Valve wear or cooler fouling", [["temp", 1, 0.7], ["press", -1, 0.3]], "Valve and cooler service", ["Check the intercooler", "Inspect the valves"]),
  FM("gc-seal", ["gascomp"], "Dry gas seal degradation", [["sgas", 1, 1]], "Plan the seal cartridge change", ["Trend primary vent flow", "Check seal-gas filters", "Plan the cartridge change"]),
  FM("gc-fouling", ["gascomp"], "Fouling", [["dt", 1, 0.7], ["pr", -1, 0.3]], "Performance check and wash", ["Check the inlet scrubber", "Compare the performance curve"]),
  FM("amine-foam", ["amine"], "Amine foaming or degradation", [["h2s", 1, 0.6], ["load", 1, 0.4]], "Amine analysis", ["Sample the amine (heat-stable salts, foaming test)", "Check the filters and antifoam"]),
  FM("teg-degr", ["teg"], "TEG degradation", [["dew", 1, 0.6], ["teg", -1, 0.4]], "TEG analysis and reboiler check", ["Sample the TEG", "Check the reboiler temperature"]),
  FM("tank-wall", ["tank"], "Wall loss (corrosion)", [["wall", -1, 1]], "UT survey and fitness-for-service", ["UT thickness map of the worst area", "Fitness-for-service assessment", "Plan the repair"]),
  FM("pl-cp", ["pipeline"], "Cathodic protection or coating failure", [["cp", 1, 1]], "CP survey", ["Check the rectifiers", "Close-interval potential survey"]),
  FM("pl-span", ["pipeline"], "Free span growing (scour)", [["span", 1, 1]], "Subsea survey and span rectification", ["ROV survey of the span", "Plan grout bags or supports"]),
  FM("flare-pilot", ["flare"], "Pilot failure", [["pilot", -1, 1]], "Pilot ignition check", ["Check pilot gas and ignition", "Thermal check of each pilot"]),
  FM("fp-press", ["firepump"], "Jockey pump or leak", [["press", -1, 1]], "Fire-water system check", ["Check the jockey pump", "Walk the ring main for leaks"]),
  FM("ccr-insul", ["ccr"], "Circuit insulation breakdown", [["ir", -1, 0.6], ["lamps", 1, 0.4]], "Insulation test of the circuit", ["Megger the circuit", "Find and replace failed transformers"]),
  FM("screen-blind", ["screen"], "Screen blinding", [["dpw", 1, 1]], "Clean the screen", ["Check the cleaning rake", "Clean the screen"]),
];

// ------------------------------------------------------------------ reliability, consequence
/** Weibull shape and scale (days) by class — demo assumptions in the range of published data for the equipment type. */
const WEIBULL: Record<string, [number, number]> = { rotating: [1.8, 1100], turbine: [2.2, 1600], electrical: [1.2, 3600], static: [3, 7300], building: [1, 2000] };
const CLASS_GROUP: Record<string, keyof typeof WEIBULL> = { pump: "rotating", hpump: "rotating", compressor: "rotating", gascomp: "rotating", expander: "rotating", erd: "rotating", escalator: "rotating", lift: "rotating", bhs: "rotating", pbb: "rotating", chiller: "rotating", ahu: "rotating", firepump: "rotating",
  gt: "turbine", st: "turbine", hrsg: "turbine", transformer: "electrical", breaker: "electrical", ups: "electrical", ccr: "electrical", genset: "electrical", eds: "electrical",
  tank: "static", pipeline: "static", separator: "static", amine: "static", teg: "static", flare: "static", ro: "static", uf: "static", dosing: "static", screen: "static" };
/** The P–F interval by group: typical days from the first detectable sign of a failure to the failure itself (RCM). The
 *  engine's prior for remaining life when the data is still thin. Demo assumptions. */
export const PF_DAYS: Record<keyof typeof WEIBULL, number> = { rotating: 28, turbine: 40, electrical: 45, static: 50, building: 20 };
/** Hours to repair after a failure, by group; the cost of an hour down by criticality (SAR, demo assumptions). */
const MTTR_H: Record<keyof typeof WEIBULL, number> = { rotating: 18, turbine: 72, electrical: 24, static: 48, building: 6 };
const HOUR_COST = { A: 25_000, B: 6_000, C: 1_000 } as const;
const REPAIR_COST: Record<keyof typeof WEIBULL, number> = { rotating: 45_000, turbine: 400_000, electrical: 80_000, static: 120_000, building: 10_000 };

function weibullP(cls: string, ageDays: number, horizon = 30) {
  const [b, eta] = WEIBULL[CLASS_GROUP[cls] ?? "rotating"];
  return 1 - Math.exp(-(((ageDays + horizon) / eta) ** b) + ((ageDays / eta) ** b));
}

// ------------------------------------------------------------------ the engine
export interface Diagnosis { modeId: string; name: string; score: number; action: string; checklist: string[]; evidence: string[]; precision?: number }
export interface AssetHealth {
  assetId: string; tag: string; name: string; cls: string; criticality: Asset["criticality"]; zone: string; status: Asset["status"];
  /** 0–100: 100 is no evidence of degradation and a young age */
  health: number;
  /** probability of failure within 30 days: from the readings, from age, combined */
  pCondition: number; pAge: number; p30: number;
  /** the earliest remaining life among its readings (P10/P50/P90 days) */
  rul?: { p10: number; p50: number; p90: number; reading: string };
  diagnosis?: Diagnosis; alternatives: Diagnosis[];
  series: SeriesResult[];
  /** expected cost of a failure in the next 30 days, and what acting now saves (SAR) */
  failureCost: number; expectedLoss: number; saving: number;
  /** the latest day to act, leaving time for the spare and the planning */
  actBy?: string; spareShort?: { part: string; leadDays: number };
  openWo?: string;
}
export interface Backtest {
  failures: number;
  /** checks on the held-out half (21, 14 and 7 days before each failure) */
  checks: number;
  /** the recalibration learned on the other half, and how many checks it learned from */
  calibration: Calibration; calibrationChecks: number;
  /** share of checks where the engine saw the degradation; mean error of P50 (days); share inside P10–P90 */
  detectionRate: number | null; maeDays: number | null; coverage: number | null;
  medianLeadDays: number | null; falseAlarmRate: number | null; quietChecks: number;
  examples: { asset: string; reading: string; checkDaysBefore: number; predicted: number; actual: number; p10: number; p90: number }[];
}
export interface Feedback { modeId: string; name: string; confirmed: number; notFound: number; precision: number | null }
export interface PdmReport { facilityId: string; date: string; assets: AssetHealth[]; backtest: Backtest; feedback: Feedback[]; sources: { historian: number; demo: number }; atRisk: number; expectedLoss: number }

const cache = new WeakMap<FmData, Map<string, PdmReport>>();

/** The engine's view of a facility's equipment, worst first. Cached per day picture. */
export function pdmReport(d: FmData, facilityId: string, store: HistoryStore | undefined = d.history): PdmReport {
  const key = `${facilityId}|${store ? Object.keys(store).length : 0}`;
  const hit = cache.get(d)?.get(key);
  if (hit) return hit;
  const date = d.date;
  const assets = d.assets.filter((a) => a.facilityId === facilityId && (a.status === "running" || a.status === "degraded") && a.class !== "detector" && a.readings.length);
  const fb = feedbackOf(d, facilityId);
  const precision = new Map(fb.filter((f) => f.precision !== null && f.confirmed + f.notFound >= 3).map((f) => [f.modeId, f.precision!]));
  const out: AssetHealth[] = [];
  const allSeries: Series[] = [], bySeries = new Map<string, Series[]>();
  let historian = 0, demo = 0;
  for (const a of assets) {
    const repairs = d.workOrders.filter((w) => w.assetId === a.id && w.status === "done" && w.done && (w.type === "CM" || w.type === "Emergency" || w.type === "PdM")).map((w) => w.done!);
    const ss = a.readings.map((r) => seriesFor(a, r, date, store, repairs)).filter((x): x is Series => !!x);
    allSeries.push(...ss);
    for (const s of ss) s.source === "historian" ? historian++ : demo++;
    bySeries.set(a.id, ss);
  }
  const bt = backtest(allSeries, assets);
  for (const a of assets) {
    const res = (bySeries.get(a.id) ?? []).map((s) => analyse(s, undefined, { cal: bt.calibration }));
    const by = new Map(res.map((r) => [r.key, r]));
    // failure modes: each signal's strength in its direction
    const strength = (k: string, dir: 1 | -1) => {
      const r = by.get(k); if (!r) return 0;
      const same = (r.side === "high" ? 1 : -1) === dir;
      if (!same) return r.status === "anomaly" && Math.sign(r.z) === dir ? 0.6 : 0;
      return r.status === "alarm" ? 1 : r.status === "degrading" ? Math.max(0.5, r.p30) : r.status === "anomaly" && Math.sign(r.z) === dir ? 0.6 : 0;
    };
    const modes = FAILURE_MODES.filter((m) => m.classes.includes(a.class)).map((m) => {
      const tot = m.signals.reduce((s, x) => s + x[2], 0), got = m.signals.reduce((s, [k, dir, w]) => s + w * strength(k, dir), 0);
      const prec = precision.get(m.id);
      const score = (got / tot) * (prec !== undefined ? 0.5 + 0.5 * prec : 1);
      const evidence = m.signals.filter(([k, dir]) => strength(k, dir) > 0).map(([k]) => { const r = by.get(k)!; return r.status === "alarm" ? `${r.name} past its limit` : r.status === "degrading" ? `${r.name} ${r.side === "high" ? "rising" : "falling"} since ${r.onsetDaysAgo} days ago (${r.model})` : `${r.name} abnormal (${r.z > 0 ? "+" : ""}${r.z}σ)`; });
      return { modeId: m.id, name: m.name, score: r2(score), action: m.action, checklist: m.checklist, evidence, ...(prec !== undefined ? { precision: prec } : {}) };
    }).filter((x) => x.score >= 0.3).sort((x, y) => y.score - x.score);
    // no failure mode in the library fits: the reading itself, degrading — find the cause
    if (!modes.length) for (const r of res.filter((x) => x.status === "degrading" || x.status === "alarm").sort((x, y) => y.p30 - x.p30).slice(0, 1))
      modes.push({ modeId: `generic:${r.key}`, name: `${r.name} ${r.side === "high" ? "rising" : "falling"} — cause not in the library`, score: r2(Math.max(0.5, r.p30)), action: "Find the cause on site",
        checklist: [`Confirm the ${r.name.toLowerCase()} on site`, "Find the cause", "Correct it", "Record the reading after the work"], evidence: [r.status === "alarm" ? `${r.name} past its limit` : `${r.name} ${r.side === "high" ? "rising" : "falling"} since ${r.onsetDaysAgo} days ago (${r.model})`] });
    const degrading = res.filter((r) => r.status === "degrading");
    const pCond = Math.max(0, ...res.map((r) => r.p30));
    const age = Math.max(0, Math.round((Date.parse(date) - Date.parse(CLASS_GROUP[a.class] === "static" ? a.installed : a.lastPm)) / DAY));
    const pAge = weibullP(a.class, age);
    const p30 = 1 - (1 - pCond) * (1 - pAge);
    const worst = degrading.filter((r) => r.rul).sort((x, y) => x.rul!.p50 - y.rul!.p50)[0];
    const usage = Math.max(0, ...res.map((r) => { const span = Math.abs(r.limit - r.baseline.median) || 1; return Math.min(1, Math.max(0, (r.side === "high" ? r.value - r.baseline.median : r.baseline.median - r.value) / span)); }));
    const anomalies = res.filter((r) => r.status === "anomaly").length;
    const health = Math.round(100 * (1 - p30) * (1 - 0.35 * usage) * (anomalies ? 0.92 : 1));
    const grp = CLASS_GROUP[a.class] ?? "rotating";
    const failureCost = MTTR_H[grp] * HOUR_COST[a.criticality] + REPAIR_COST[grp];
    const plannedCost = REPAIR_COST[grp] * 0.35;
    const short = d.spares.filter((s) => s.facilityId === a.facilityId && a.spares.includes(s.part) && s.stock + (s.onOrder ?? 0) < 1).sort((x, y) => y.leadDays - x.leadDays)[0];
    const lead = (short?.leadDays ?? 0) + 1;
    const actBy = worst?.rul ? new Date(Date.parse(date) + Math.max(0, Math.floor(worst.rul.p10 - lead)) * DAY).toISOString().slice(0, 10) : undefined;
    const open = d.workOrders.find((w) => w.assetId === a.id && w.status !== "done" && w.type !== "PM");
    out.push({ assetId: a.id, tag: a.tag, name: a.name, cls: a.class, criticality: a.criticality, zone: a.zone, status: a.status, health: Math.max(0, Math.min(100, health)),
      pCondition: r2(pCond), pAge: Math.round(pAge * 1000) / 1000, p30: r2(p30),
      ...(worst?.rul ? { rul: { ...worst.rul, reading: worst.name } } : {}),
      ...(modes[0] ? { diagnosis: modes[0] } : {}), alternatives: modes.slice(1, 3), series: res,
      failureCost: Math.round(failureCost), expectedLoss: Math.round(p30 * failureCost), saving: Math.round(Math.max(0, p30 * failureCost - (p30 >= 0.5 ? plannedCost : 0))),
      ...(actBy ? { actBy } : {}), ...(short ? { spareShort: { part: short.part, leadDays: short.leadDays } } : {}), ...(open ? { openWo: open.id } : {}) });
  }
  out.sort((x, y) => y.expectedLoss - x.expectedLoss || x.health - y.health);
  const report: PdmReport = { facilityId, date, assets: out, backtest: bt, feedback: fb, sources: { historian, demo },
    atRisk: out.filter((a) => a.p30 >= 0.5).length, expectedLoss: out.reduce((s, a) => s + a.expectedLoss, 0) };
  if (!cache.has(d)) cache.set(d, new Map());
  cache.get(d)!.set(key, report);
  return report;
}

/** Replays the engine on the history. For each past failure, as of 21, 14 and 7 days before it: did the engine see the
 *  degradation, how far was its remaining life from the real one, and did the real one fall in its P10–P90 band. Split
 *  calibration: the bias and spread of its estimates are learned on half the failures and the accuracy is reported on
 *  the other half, which the calibration never saw. Lead time: how early it first warned (P(30 d) ≥ 50 %).
 *  False alarms: warnings on quiet stretches with no crossing in the following 30 days. */
export function backtest(series: Series[], assets: { id: string; tag: string }[]): Backtest {
  const tag = new Map(assets.map((a) => [a.id, a.tag]));
  const checks: { s: Series; at: number; before: number; cal: boolean }[] = [];
  let k = 0;
  for (const s of series) for (const f of s.failures) { const cal = k++ % 2 === 0; for (const before of [21, 14, 7]) if (f - before >= 10) checks.push({ s, at: f - before, before, cal }); }
  // calibration half: the error of the uncalibrated estimate, in log days (ln real − ln estimated)
  const es = checks.filter((c) => c.cal).map((c) => ({ c, r: analyse(c.s, c.at) })).filter((x) => x.r.status === "degrading" && x.r.logMu !== undefined).map((x) => Math.log(x.c.before) - x.r.logMu!).sort((a, b) => a - b);
  const q = (p: number) => es[Math.min(es.length - 1, Math.max(0, Math.round(p * (es.length - 1))))];
  // shrunk towards no correction while there are few failures to learn from; never more than a factor of about 4
  const w = es.length / (es.length + 10), clamp = (x: number) => Math.max(-1.4, Math.min(1.4, x));
  const calib: Calibration = es.length >= 5 ? { shift: r2(clamp(w * median(es))), lo: r2(clamp(w * q(0.1)) - 0.15), hi: r2(clamp(w * q(0.9)) + 0.15) } : { shift: 0, lo: -0.8, hi: 0.8 };
  // the held-out half, recalibrated
  const ev = checks.filter((c) => !c.cal);
  const rs = ev.map((c) => ({ c, r: analyse(c.s, c.at, { cal: calib }) })).filter((x) => x.r.status === "degrading" && x.r.rul);
  const errs = rs.map((x) => Math.abs(x.r.rul!.p50 - x.c.before));
  const inBand = rs.filter((x) => x.c.before >= x.r.rul!.p10 && x.c.before <= x.r.rul!.p90).length;
  const ex = rs.filter((x) => x.c.before === 14).slice(0, 6).map((x) => ({ asset: tag.get(x.c.s.assetId) ?? x.c.s.assetId, reading: x.c.s.name, checkDaysBefore: 14, predicted: x.r.rul!.p50, actual: 14, p10: x.r.rul!.p10, p90: x.r.rul!.p90 }));
  const leads: number[] = [];
  let quiet = 0, alarms = 0;
  for (const s of series) {
    for (const f of s.failures) for (let at = Math.max(10, f - 30); at < f; at++) if (analyse(s, at, { cal: calib }).p30 >= 0.5) { leads.push(f - at); break; }
    for (const at of [30, 45]) {
      if (at >= s.values.length - 31) continue;
      if (s.failures.some((f) => f > at && f <= at + 30) || s.repairs.some((x) => x > at - 25 && x <= at + 30)) continue;
      quiet++; if (analyse(s, at, { cal: calib }).p30 >= 0.5) alarms++;
    }
  }
  const failures = series.reduce((n, s) => n + s.failures.length, 0);
  return { failures, checks: ev.length, calibration: calib, calibrationChecks: es.length, detectionRate: ev.length ? r2(rs.length / ev.length) : null, maeDays: errs.length ? r2(errs.reduce((a, b) => a + b, 0) / errs.length) : null,
    coverage: rs.length ? r2(inBand / rs.length) : null, medianLeadDays: leads.length ? median(leads) : null, falseAlarmRate: quiet ? r2(alarms / quiet) : null, quietChecks: quiet, examples: ex };
}

/** The technicians' verdicts on the engine's jobs: confirmed or not found, per failure mode. */
export function feedbackOf(d: FmData, facilityId: string): Feedback[] {
  const m = new Map<string, { c: number; n: number }>();
  for (const w of d.workOrders.filter((x): x is WorkOrder & { pdm: NonNullable<WorkOrder["pdm"]> } => x.facilityId === facilityId && !!x.pdm?.outcome)) {
    const e = m.get(w.pdm.modeId) ?? { c: 0, n: 0 };
    if (w.pdm.outcome === "confirmed") e.c++; else e.n++;
    m.set(w.pdm.modeId, e);
  }
  return [...m].map(([modeId, e]) => ({ modeId, name: FAILURE_MODES.find((f) => f.id === modeId)?.name ?? modeId, confirmed: e.c, notFound: e.n, precision: e.c + e.n ? r2(e.c / (e.c + e.n)) : null })).sort((x, y) => (y.confirmed + y.notFound) - (x.confirmed + x.notFound));
}

/** One line on an asset: "Bearing wear (82 %) — vibration rising since 9 days ago; 64 % chance of failure within 30 days, RUL 11 (6–23) days". */
export function healthText(h: AssetHealth): string {
  const parts = [h.diagnosis ? `${h.diagnosis.name} (${Math.round(h.diagnosis.score * 100)} %): ${h.diagnosis.evidence.join("; ")}` : "no failure mode identified",
    `${Math.round(h.p30 * 100)} % chance of failure within 30 days`];
  if (h.rul) parts.push(`${h.rul.reading} reaches its limit in ${h.rul.p50 >= 999 ? "over 60" : Math.round(h.rul.p50)} days (P10–P90 ${Math.round(h.rul.p10)}–${h.rul.p90 >= 999 ? "60+" : Math.round(h.rul.p90)})`);
  return `${h.tag}: ${parts.join(" · ")}`;
}

/** The report for the screen: the series and the model's projection only for the assets worth a look (the worst
 *  twelve with any sign), the others summarised. */
export function pdmView(r: PdmReport) {
  const keep = new Set(r.assets.filter((a) => a.series.some((s) => s.status !== "stable" && s.status !== "reset")).slice(0, 12).map((a) => a.assetId));
  return { ...r, assets: r.assets.map((a) => ({ ...a, series: a.series.map((s) => (keep.has(a.assetId) ? s : { ...s, values: [], projection: undefined })) })) };
}

// ------------------------------------------------------------------ the historian
export interface ReadingIn { asset: string; key: string; at: string; value: number }
/** Readings from the plant historian (PI, SCADA, IoT gateway): kept as daily means per asset and reading, a year back.
 *  Each row is checked: a known asset and reading, a number, a time not in the future nor over a year old. */
export function ingestReadings(store: HistoryStore, assets: Pick<Asset, "id" | "tag" | "facilityId" | "readings">[], rows: unknown[], site?: string, now = Date.now()) {
  let accepted = 0;
  const rejected: { row: number; why: string }[] = [];
  const touched = new Set<string>();
  rows.slice(0, 5000).forEach((raw, i) => {
    const r = (raw ?? {}) as Partial<ReadingIn>;
    const a = assets.find((x) => (!site || x.facilityId === site) && (x.id === r.asset || x.tag === r.asset));
    const t = Date.parse(String(r.at ?? ""));
    const why = !a ? `unknown asset ${String(r.asset ?? "").slice(0, 40)}` : !a.readings.some((x) => x.key === r.key) ? `${a.tag} has no reading "${String(r.key ?? "").slice(0, 20)}" (it has ${a.readings.map((x) => x.key).join(", ")})`
      : typeof r.value !== "number" || !Number.isFinite(r.value) ? "value must be a number" : !Number.isFinite(t) ? "at must be an ISO time" : t > now + 3600_000 ? "at is in the future" : t < now - 400 * DAY ? "at is over a year old" : null;
    if (why) { if (rejected.length < 20) rejected.push({ row: i, why }); return; }
    const k = seriesKey(a!.id, r.key!), day = new Date(t).toISOString().slice(0, 10);
    const xs = (store[k] ??= []);
    const e = xs.find((x) => x.day === day);
    if (e) { e.v = Math.round(((e.v * e.n + r.value!) / (e.n + 1)) * 10_000) / 10_000; e.n++; } else xs.push({ day, v: r.value!, n: 1 });
    touched.add(k); accepted++;
  });
  for (const k of touched) store[k] = store[k].sort((x, y) => x.day.localeCompare(y.day)).slice(-400);
  return { accepted, rejected: rows.length - accepted, errors: rejected, series: touched.size, ignored: Math.max(0, rows.length - 5000) };
}
