import { NextResponse } from "next/server";
import { getRepo, storageKind } from "@/lib/store";
import { serverLlm } from "@/lib/llmConfig";
import { availableProviders } from "@/lib/core/llm/router";

export const dynamic = "force-dynamic";

export async function GET() {
  const d = (await getRepo()).db;
  const providers = availableProviders(serverLlm());
  return NextResponse.json({
    project: d.project,
    locations: d.locations,
    docs: d.docs.map(({ text: _t, ...rest }) => rest), // searchable text stays server-side
    notes: d.notes,
    dataDate: d.data.meta.dataDate,
    agentMode: providers.length ? "ai" : "offline",
    providers,
    storage: storageKind(),
    directUpload: storageKind() === "blob" ? (process.env.BLOB_PREFIX ?? "kinan/").replace(/^\/+/, "") + "uploads/direct/" : null,
  });
}
