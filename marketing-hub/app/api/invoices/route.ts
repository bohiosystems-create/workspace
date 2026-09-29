import { NextResponse } from "next/server";
import { ensureOracleSynced, syncOracle, buildInvoiceDashboard, applyInvoiceAction } from "@/lib/invoices";

export const runtime = "nodejs";
export const maxDuration = 120;

const fail = (err: any, label: string) => {
  console.error(label, err);
  return NextResponse.json({ error: err?.message ?? "Invoice request failed." }, { status: 500 });
};

// GET  /api/invoices -> reconciliation dashboard (first call syncs from Oracle)
export async function GET() {
  try {
    await ensureOracleSynced();
    return NextResponse.json({ dashboard: await buildInvoiceDashboard() });
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
    if (b.action === "SYNC") await syncOracle();
    else if (b.action === "APPROVE_CLEAN") await applyInvoiceAction({ type: "APPROVE_CLEAN" });
    else if (b.action === "DISPUTE") await applyInvoiceAction({ type: "DISPUTE", invoiceId: String(b.invoiceId), note: String(b.note ?? "") });
    else if (b.action === "APPROVE" || b.action === "REOPEN") await applyInvoiceAction({ type: b.action, invoiceId: String(b.invoiceId) });
    else return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    return NextResponse.json({ dashboard: await buildInvoiceDashboard() });
  } catch (err) {
    return fail(err, "invoices action error");
  }
}
