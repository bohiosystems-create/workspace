// Request handlers for vendor orchestration (shared by the API route and the offline demo).
import { buildOrchestration, approveWorkOrders, cancelWorkOrder, receiveDeliverable } from "./orchestrator";
import { buildAgent } from "./agent";
import { vendorList, vendorDetail } from "./vendor-hub";
import { outlookMode, outlookDelivery } from "./outlook";
import { type Lang, isLang, tx } from "./i18n";

export async function orchestrationState(lang: Lang) {
  const a = await buildAgent(lang);
  const orch = await buildOrchestration(lang, a);
  return { ...orch, vendors: await vendorList(lang, a, orch), outlook: { mode: outlookMode(), delivery: outlookDelivery() } };
}
/** One vendor: campaigns, invoices, work orders, deliverables and Outlook correspondence. */
export async function vendorState(id: string, lang: Lang) {
  const a = await buildAgent(lang);
  return vendorDetail(id, lang, a, await buildOrchestration(lang, a));
}

export async function orchestrationAction(b: any) {
  const l: Lang = isLang(b.lang) ? b.lang : "en";
  const approver = String(b.approver ?? "");
  switch (b.action) {
    case "APPROVE": await approveWorkOrders((Array.isArray(b.items) ? b.items : []).map((x: any) => ({ id: String(x.id), revision: Number(x.revision) })), approver, b.confirmRead === true, l); break;
    case "CANCEL": await cancelWorkOrder(String(b.id), approver, l); break;
    case "RECEIVE": await receiveDeliverable(String(b.id), approver, l); break;
    case "RUN": break; // building the state runs the cycle (scheduler: POST { action: "RUN" })
    default: throw new Error(tx(l, "Unknown action.", "إجراء غير معروف."));
  }
  return orchestrationState(l);
}
