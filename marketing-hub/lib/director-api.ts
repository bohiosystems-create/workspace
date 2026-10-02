// Request handlers for the Director (shared by the API routes and the offline demo).
import { buildDirector, approvePlan, sendBriefToKinan } from "./director";
import { kinanOutbox, retryKinanEvents, kinanMode, yardiMode } from "./kinan";
import { type Lang, isLang, tx } from "./i18n";

export async function directorState(lang: Lang) {
  const d = await buildDirector(lang);
  return { ...d, kinan: { mode: kinanMode(), yardi: yardiMode(), outbox: await kinanOutbox(30, lang) } };
}

export async function directorAction(b: any) {
  const l: Lang = isLang(b.lang) ? b.lang : "en";
  switch (b.action) {
    case "APPROVE_PLAN": await approvePlan(l, String(b.approver ?? "")); break;
    case "SEND_BRIEF": await sendBriefToKinan(l); break;
    case "RETRY": await retryKinanEvents(b.id ? String(b.id) : undefined); break;
    default: throw new Error(tx(l, "Unknown action.", "إجراء غير معروف."));
  }
  return directorState(l);
}
