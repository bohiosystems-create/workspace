// Request handlers for the Director (shared by the API routes and the offline demo).
import { buildDirector, approvePlan } from "./director";
import { buildAgent } from "./agent";
import { salesAgentSource } from "./kinan";
import { dailyScan, scanView } from "./signals";
import { dailyIdeasReady } from "./ideation";
import { todayRiyadh } from "./clock";
import { type Lang, isLang, tx } from "./i18n";

export async function directorState(lang: Lang) {
  const a = await buildAgent(lang);
  const d = await buildDirector(lang, a);
  // Today's scan of every source, and the initiatives already prepared for it (by the daily report run).
  const scan = scanView(await dailyScan(), lang);
  const ideas = await dailyIdeasReady(todayRiyadh(), lang);
  const findings = scan.signals.filter((s) => !s.linkedTo).map((s) => ({ ...s, answer: ideas.find((i) => i.trigger?.id === s.id) ?? null }));
  return { ...d, today: todayRiyadh(), salesAgent: salesAgentSource(lang, a.crm.integration), scan: { date: scan.date, sources: scan.sources, findings, total: scan.signals.length, ideasReady: ideas.length > 0 } };
}

export async function directorAction(b: any) {
  const l: Lang = isLang(b.lang) ? b.lang : "en";
  switch (b.action) {
    case "APPROVE_PLAN": await approvePlan(l, String(b.approver ?? "")); break;
    default: throw new Error(tx(l, "Unknown action.", "إجراء غير معروف."));
  }
  return directorState(l);
}
