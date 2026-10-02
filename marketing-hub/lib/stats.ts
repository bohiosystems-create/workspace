// Pure statistics helpers (safe to import in the browser).
const Z90 = 1.645, Z80POWER = 0.842;
const r1 = (x: number) => Math.round(x * 10) / 10;

export const pFromZ = (z: number) => { // two-sided p-value, normal approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return Math.min(1, 2 * p);
};

/** Minimum detectable lift (relative, 90% two-sided, 80% power) for a planned test. */
export function powerHoldout(weeklyConversions: number, holdoutPct: number, weeks: number) {
  const h = holdoutPct / 100;
  const ne = weeklyConversions * weeks * (1 - h), nh = weeklyConversions * weeks * h;
  if (ne <= 0 || nh <= 0) return null;
  return r1((Z90 + Z80POWER) * Math.sqrt(1 / ne + 1 / nh) * 100);
}
export function powerGeo(weeklyTestVolume: number, cv: number, weeks: number, preWeeks = 6) {
  if (weeklyTestVolume <= 0) return null;
  const sd = Math.sqrt((weeklyTestVolume * cv) ** 2 + weeklyTestVolume); // extra-Poisson week-to-week variation + count noise
  return r1(((Z90 + Z80POWER) * sd * Math.sqrt(weeks) * Math.sqrt(1 + weeks / preWeeks)) / (weeklyTestVolume * weeks) * 100);
}


/** Challenger vs incumbent on results per SAR (Poisson rate ratio). */
export function rateRatio(a: { n: number; spendK: number }, b: { n: number; spendK: number }) {
  if (a.n <= 0 || b.n <= 0 || a.spendK <= 0 || b.spendK <= 0) return null;
  const ratio = a.n / a.spendK / (b.n / b.spendK);
  const se = Math.sqrt(1 / a.n + 1 / b.n);
  const z = Math.log(ratio) / se;
  return { ratio: Math.round(ratio * 100) / 100, low: Math.round(Math.exp(Math.log(ratio) - Z90 * se) * 100) / 100, high: Math.round(Math.exp(Math.log(ratio) + Z90 * se) * 100) / 100, pOneSided: Math.round((pFromZ(z) / 2) * 1000) / 1000, z };
}
void r1;
