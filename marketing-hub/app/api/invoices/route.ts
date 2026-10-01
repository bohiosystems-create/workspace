import { NextResponse } from "next/server";
import { ensureOracleSynced, syncOracle, buildInvoiceDashboard, applyInvoiceAction } from "@/lib/invoices";
import { isLang } from "@/lib/i18n";

export const runtime = "nodejs";
export const maxDuration = 120;

const fail = (err: any, label: string) => {
  console.error(label, err);
  return NextResponse.json({ error: err?.message ?? "Invoice request failed." }, { status: 500 });
};

// GET  /api/invoices -> reconciliation dashboard (first call syncs from Oracle)
export async function GET(req: Request) {
  try {
    await ensureOracleSynced();
    const q = new URL(req.url).searchParams.get("lang");
    return NextResponse.json({ dashboard: await buildInvoiceDashboard(isLang(q) ? q : "en") });
  } catch (err) {
    return fail(err, "invoices error");
  }
}

// POST { action: "SYNC" }                          -> pull from Oracle now
// POST { action: "APPROVE" | "REOPEN", invoiceId }  -> record a decision
// POST { action: "DISPUTE", invoiceId, note }
// POST { action: "APPROVE_CLEAN" }
export async function POST(req: Request) {
  try {
    await ensureOracleSynced();
    const b = await req.json();
    const lang = isLang(b.lang) ? b.lang : "en";
    if (b.action === "SYNC") await syncOracle();
    else if (b.action === "APPROVE_CLEAN") await applyInvoiceAction({ type: "APPROVE_CLEAN" }, lang);
    else if (b.action === "DISPUTE") await applyInvoiceAction({ type: "DISPUTE", invoiceId: String(b.invoiceId), note: String(b.note ?? "") }, lang);
    else if (b.action === "APPROVE" || b.action === "REOPEN") await applyInvoiceAction({ type: b.action, invoiceId: String(b.invoiceId) }, lang);
    else return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    return NextResponse.json({ dashboard: await buildInvoiceDashboard(lang) });
  } catch (err) {
    return fail(err, "invoices action error");
  }
}
