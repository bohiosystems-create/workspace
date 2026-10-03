// Request handlers for scheduled reports (shared by the API route and the offline demo).
import { reportsState, saveSchedule, runNow, runSchedule, getReport, runSnapshot } from "./reports";
import { type Lang, isLang, tx } from "./i18n";

export { reportsState, getReport };

export async function reportsAction(b: any) {
  const l: Lang = isLang(b.lang) ? b.lang : "en";
  let message: string | null = null, openId: string | null = null;
  switch (b.action) {
    case "SAVE_SCHEDULE": await saveSchedule(b.schedule ?? {}, String(b.approver ?? ""), l); message = tx(l, "Schedule saved.", "حُفظ الجدول."); break;
    case "SNAPSHOT": openId = await runSnapshot(l); message = tx(l, "Live snapshot ready — saved in the history, not e-mailed.", "اللقطة الفورية جاهزة — حُفظت في السجل ولم تُرسل بالبريد."); break;
    case "PREVIEW": openId = (await runNow(false, l))[0]?.id ?? null; break;
    case "SEND_NOW": {
      const ids = await runNow(true, l);
      openId = (ids.find((x) => x.lang === l) ?? ids[0])?.id ?? null;
      message = tx(l, `Report generated and sent (${ids.length}).`, `أُعدّ التقرير وأُرسل (${ids.length}).`);
      break;
    }
    case "RUN": {
      const r = await runSchedule();
      const REASON: Record<string, string> = { paused: tx(l, "the schedule is paused", "الجدول متوقف"), "not a scheduled day": tx(l, "today is not a scheduled day", "اليوم ليس من أيام الجدول"), "already sent today": tx(l, "today's report was already sent", "أُرسل تقرير اليوم بالفعل") };
      message = r.ran ? tx(l, "Due — today's report was generated and sent.", "حان الموعد — أُعدّ تقرير اليوم وأُرسل.")
        : tx(l, `Not due: ${REASON[r.reason] ?? r.reason} (local time ${r.local.hhmm}).`, `لم يحن الموعد: ${REASON[r.reason] ?? r.reason.replace("not before", "ليس قبل")} (التوقيت المحلي ${r.local.hhmm}).`);
      openId = r.ran ? ((r as any).byLang.find((x: any) => x.lang === l) ?? (r as any).byLang[0])?.id ?? null : null;
      break;
    }
    default: throw new Error(tx(l, "Unknown action.", "إجراء غير معروف."));
  }
  return { ...(await reportsState(l)), message, openId };
}
