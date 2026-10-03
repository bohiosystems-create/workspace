import { NextResponse } from "next/server";
import { serverLlm } from "@/lib/llmConfig";
import { availableProviders } from "@/lib/core/llm/router";
import { adapterFromEnv } from "@/lib/integrations/procurement";
import { getRepo, storageKind } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Read-only admin status (providers, routes, storage, WhatsApp). Never returns keys. */
export async function GET() {
  const c = serverLlm();
  const db = (await getRepo()).db;
  return NextResponse.json({
    editable: false,
    providers: { anthropic: !!c.anthropic, openai: !!c.openai },
    available: availableProviders(c), mode: c.mode, fallback: c.fallback, routes: c.routes,
    transcription: c.openai ? c.openai.transcribeModel || "whisper-1" : null,
    procurement: { provider: adapterFromEnv()?.name ?? "demo", lastSync: db.data.procurement.lastSync, source: db.data.procurement.source },
    storage: storageKind(),
    whatsapp: !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
  });
}
