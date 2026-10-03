// The sample data's "today" and the month being planned. Replace with new Date() once real feeds are connected.
export const TODAY = new Date("2026-06-08");
export const PLAN_MONTH = "2026-06";
/** "Now" for reports, snapshots and the brief's date: always the real date and time. The figures inside stay the
 *  sample data's (labelled "Figures as of …" with the data date, TODAY). */
export const now = () => new Date();
/** Today's real date (YYYY-MM-DD) in Riyadh. */
export const todayRiyadh = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
