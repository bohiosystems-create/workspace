/** Deterministic helpers so the demo dataset is identical on every run. */
/** The date the demo dataset was written for (its base). The data itself follows the calendar: see currentDataDate. */
export const DATA_DATE = "2026-10-01";
/** Last day the demo programme runs to (a month after practical completion). */
export const DATA_DATE_MAX = "2028-07-31";

/** Today in Riyadh (YYYY-MM-DD). */
export const todayRiyadh = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
/**
 * The demo's data date. Like the other Kinan agents, the sample data follows the calendar so the app and the daily
 * brief always look current: the data date is today (Riyadh), from the base date up to a month after completion.
 * The programme keeps its own dates, so every day some work finishes, starts and slips as the programme says.
 *   DATA_DATE_FIXED=2026-10-01  freezes it (any date).
 */
export function currentDataDate(): string {
  const fixed = typeof process !== "undefined" ? process.env?.DATA_DATE_FIXED : undefined;
  if (fixed && /^\d{4}-\d{2}-\d{2}$/.test(fixed)) return fixed;
  const t = todayRiyadh();
  return t < DATA_DATE ? DATA_DATE : t > DATA_DATE_MAX ? DATA_DATE_MAX : t;
}

/** The local clock (Riyadh) on the data date, as the permits write it: "YYYY-MM-DD HH:MM". The data date leads (it can be
 *  frozen with DATA_DATE_FIXED); the time of day is the real one, so permits run out at their hour. */
export function localClock(dataDate: string, now = new Date()): string {
  const hm = now.toLocaleTimeString("en-GB", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit", hour12: false });
  return `${dataDate} ${hm}`;
}
/** A permit's state right now: an "Active" permit past its end time has expired (and must not be shown as live). */
export function permitState<P extends { status: string; validTo: string }>(p: P, clock: string): P["status"] | "Expired" {
  return p.status === "Active" && p.validTo.slice(0, 16) < clock ? "Expired" : p.status;
}

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = <T,>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
export const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + Math.round(n));
  return d.toISOString().slice(0, 10);
}
export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
