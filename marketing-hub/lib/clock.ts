// The sample data's "today" and the month being planned. Replace with new Date() once real feeds are connected.
export const TODAY = new Date("2026-06-08");
export const PLAN_MONTH = "2026-06";
/** "Now" for reports and snapshots: the sample data's day with the real time of day, so dates match the figures.
 *  With DEMO_CLOCK=off (live feeds) it is the real clock. */
export const now = () => {
  if (typeof process !== "undefined" && process.env?.DEMO_CLOCK === "off") return new Date();
  const real = new Date();
  return new Date(Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth(), TODAY.getUTCDate(), real.getUTCHours(), real.getUTCMinutes(), real.getUTCSeconds()));
};
