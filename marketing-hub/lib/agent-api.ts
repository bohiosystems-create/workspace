// Request handlers for the vendor agent (shared by the API routes and the offline demo).
import { buildAgent } from "./agent";
import { buildQbr, buildRfp, qbrText, draftRfpEmails, QUARTERS } from "./reviews";
import { approveTest } from "./incrementality";
import { approveTrial, cancelTrial, decideTrial } from "./bench";
import { syncAds } from "./adaccounts";
import { metaState, syncMeta, assignMetaCampaign, metaMode } from "./meta";
import { importVendorReport } from "./vendor-reports";
import { createCustomDraft } from "./recommendations";
import { planTest, draftSetupEmail, recordTestWeek, demoTest, testsOverview } from "./test-plan";
import { type Lang, isLang, tx, nm } from "./i18n";

export async function agentState(lang: Lang) {
  const a = await buildAgent(lang);
  return {
    scores: a.scores, method: a.method, decisions: a.decisions,
    incrementality: { tests: a.incrementality.tests, mmm: a.incrementality.mmm, perVendor: a.incrementality.perVendor },
    bench: a.bench, proposed: a.proposed,
    sources: a.unified.sources, dataFlags: a.unified.flags,
    vendors: a.unified.vendors,
    campaigns: a.unified.campaigns.map(({ months, ...c }) => c),
    quarters: QUARTERS.map((q) => q.id),
    meta: metaMode() === "off" ? null : await metaState(lang),
    testPlan: await testsOverview(a, lang),
    vendorOptions: a.mkt.vendors.map((v) => ({ id: v.id, name: v.name, category: v.category, campaigns: a.mkt.campaigns.filter((c) => c.vendorId === v.id).map((c) => c.name) })),
  };
}

export async function agentDoc(kind: string, vendorId: string, quarter: string, lang: Lang) {
  const a = await buildAgent(lang);
  if (kind === "qbr") { const q = await buildQbr(a, vendorId, quarter, lang); return { qbr: q, text: qbrText(q, lang) }; }
  return { rfp: await buildRfp(a, vendorId, lang) };
}

export async function agentAction(b: any) {
  const l: Lang = isLang(b.lang) ? b.lang : "en";
  switch (b.action) {
    case "CREATE_TEST": { // designed from the data (dates, regions, volumes); the form's weeks / holdout / campaign are kept
      const p = await planTest({ vendorId: String(b.vendorId), campaign: b.campaign ? String(b.campaign) : undefined, kind: b.kind === "GEO" ? "GEO" : b.kind === "HOLDOUT" ? "HOLDOUT" : undefined, weeks: Number(b.weeks) || undefined, holdoutPct: Number(b.holdoutPct) || undefined }, await buildAgent(l), l);
      return { id: p.id, state: await agentState(l) };
    }
    case "DRAFT_TEST_EMAIL": { const r = await draftSetupEmail(String(b.id), l); return { ...r, state: await agentState(l) }; }
    case "RECORD_TEST_WEEK": { const r = await recordTestWeek(String(b.id), b.week ?? {}, l); return { ...r, state: await agentState(l) }; }
    case "DEMO_TEST": { const r = await demoTest({ step: b.step, id: b.id ? String(b.id) : undefined, vendorId: b.vendorId ? String(b.vendorId) : undefined, approver: b.approver }, await buildAgent(l), l); return { ...r, state: await agentState(l) }; }
    case "APPROVE_TEST": await approveTest(String(b.id), String(b.approver ?? ""), l); break;
    case "APPROVE_TRIAL": await approveTrial(String(b.id), String(b.approver ?? ""), l); break;
    case "CANCEL_TRIAL": await cancelTrial(String(b.id), String(b.approver ?? ""), l); break;
    case "DECIDE_TRIAL": await decideTrial(String(b.id), b.decision, String(b.approver ?? ""), l); break;
    case "SYNC_ADS": await syncAds(); if (metaMode() !== "off") await syncMeta(); break;
    case "META_SYNC": await syncMeta(); break;
    case "META_ASSIGN": await assignMetaCampaign({ id: String(b.id), target: String(b.target ?? ""), code: b.code ? String(b.code) : null, approver: String(b.approver ?? ""), remember: b.remember === true }, l); break;
    case "IMPORT_REPORT": return { imported: await importVendorReport(String(b.csv ?? ""), String(b.fileName ?? "upload.csv"), l), state: await agentState(l) };
    case "SEND_RFP": return { drafted: await draftRfpEmails((x) => buildAgent(x), String(b.vendorId), l), state: await agentState(l) };
    case "QBR_DRAFT": {
      // Cover email with the QBR, to the vendor, as a draft for approval.
      const a = await buildAgent(l);
      const vendors = a.mkt.vendors;
      const v = vendors.find((x) => x.id === b.vendorId);
      const vl: Lang = l;
      const q = await buildQbr(a, String(b.vendorId), String(b.quarter), vl);
      const body = [tx(vl, `Dear ${v?.contact.split(" ")[0] ?? ""},`, `السادة / ${nm(vl, v?.name ?? "")} المحترمون،`), "", tx(vl, "Ahead of our quarterly review meeting, please find our summary below.", "قبل اجتماع المراجعة الربعية، نرفق لكم ملخصنا أدناه."), "", qbrText(q, vl), "", tx(vl, "Kind regards,", "وتفضلوا بقبول فائق الاحترام،"), tx(vl, "Marketing Team", "فريق التسويق")].join("\n");
      const ok = await createCustomDraft({ vendorId: String(b.vendorId), recKey: `QBR:${b.vendorId}:${b.quarter}`, subject: tx(vl, `Quarterly business review — ${q.quarterLabel}`, `مراجعة الأعمال الربعية — ${q.quarterLabel}`), body }, l);
      return { drafted: ok ? 1 : 0, state: await agentState(l) };
    }
    default: throw new Error(tx(l, "Unknown action.", "إجراء غير معروف."));
  }
  return { state: await agentState(l) };
}
