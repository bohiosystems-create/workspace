// Request handlers for the Director (shared by the API routes and the offline demo).
import { buildDirector, approvePlan, decideTask, sendBriefToKinan, pushSourceQuality } from "./director";
import { kinanOutbox, retryKinanEvents, kinanMode, yardiMode, simulateKinanReplies } from "./kinan";
import { type Lang, isLang, tx, an } from "./i18n";

export async function directorState(lang: Lang) {
  const d = await buildDirector(lang);
  return { ...d, kinan: { mode: kinanMode(), yardi: yardiMode(), outbox: await kinanOutbox(30, lang) } };
}

export async function directorAction(b: any) {
  const l: Lang = isLang(b.lang) ? b.lang : "en";
  switch (b.action) {
    case "APPROVE_PLAN": await approvePlan(l, String(b.approver ?? "")); break;
    case "DECIDE_TASK": await decideTask(String(b.id), b.decision, String(b.approver ?? ""), l); break;
    case "SEND_BRIEF": await sendBriefToKinan(l); break;
    case "PUSH_SOURCES": await pushSourceQuality(l); break;
    case "RETRY": await retryKinanEvents(b.id ? String(b.id) : undefined); break;
    case "SIMULATE_KINAN": {
      const r = await simulateKinanReplies();
      if (!r.tasks) throw new Error(tx(l, "Approve a task for Kinan's agent first.", "اعتمدوا أولاً مهمة لوكيل كنان."));
      return { ...(await directorState(l)), message: tx(l, `Simulated Kinan's agent: ${r.contacted} leads contacted, ${r.progressed} qualified or booked a viewing; ${r.tasks} task(s) closed.`, `محاكاة وكيل كنان: تم التواصل مع ${an(r.contacted, "عميل واحد", "عميلين", "عملاء", "عميلاً")}، وتأهّل أو حجز معاينة ${r.progressed}؛ وأُغلقت ${an(r.tasks, "مهمة واحدة", "مهمتان", "مهام", "مهمة")}.`) };
    }
    default: throw new Error(tx(l, "Unknown action.", "إجراء غير معروف."));
  }
  return directorState(l);
}
