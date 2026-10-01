import { NextResponse } from "next/server";
import { crmMode, isStage, toStage, upsertLeads, type CanonicalLead } from "@/lib/crm";
import { prisma } from "@/lib/prisma";
import { ensureMarketingSeeded } from "@/lib/seed-marketing";

export const runtime = "nodejs";

// Push endpoint for any CRM / iPaaS (Power Automate, Zapier, MuleSoft, a CRM webhook).
//   POST /api/crm/leads        header: x-api-key: <CRM_INGEST_KEY>
//   body: { "leads": [ { id, createdAt, source, stage, firstResponseAt?, owner?, dealValueM?, closedAt?, lostReason? } ] }
// `stage` may be a canonical stage or a CRM status that maps through STAGE_MAP in lib/crm.ts.
export async function POST(req: Request) {
  const key = process.env.CRM_INGEST_KEY;
  if (!key) return NextResponse.json({ error: "CRM ingest is disabled (CRM_INGEST_KEY is not set)." }, { status: 503 });
  if (req.headers.get("x-api-key") !== key) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    await ensureMarketingSeeded();
    const body = await req.json();
    const input: any[] = Array.isArray(body?.leads) ? body.leads : [];
    if (input.length === 0 || input.length > 5000) return NextResponse.json({ error: "Send between 1 and 5000 leads." }, { status: 400 });
    const leads: CanonicalLead[] = [];
    const rejected: { index: number; reason: string }[] = [];
    input.forEach((l, i) => {
      const stage = typeof l?.stage === "string" ? (isStage(l.stage) ? l.stage : toStage(l.stage)) : null;
      if (!l?.id || !l?.createdAt || Number.isNaN(Date.parse(l.createdAt)) || !stage || !isStage(stage)) rejected.push({ index: i, reason: "id, createdAt and a known stage are required" });
      else leads.push({ id: String(l.id), createdAt: l.createdAt, source: String(l.source ?? ""), stage, firstResponseAt: l.firstResponseAt ?? null, owner: l.owner ?? null, dealValueM: typeof l.dealValueM === "number" ? l.dealValueM : null, closedAt: l.closedAt ?? null, lostReason: l.lostReason ?? null });
    });
    const res = leads.length ? await upsertLeads(leads) : { received: 0, matched: 0, unmatched: 0 };
    await prisma.crmSync.create({ data: { mode: crmMode() === "ingest" ? "ingest" : "push", leads: res.received, matched: res.matched, unmatched: res.unmatched } });
    return NextResponse.json({ ...res, rejected });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Ingest failed." }, { status: 400 });
  }
}
