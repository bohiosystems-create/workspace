import { getRepo } from "@/lib/store";
import { fmToday } from "@/lib/fm/engine";
import { djiKmz } from "@/lib/robots/export";
import { routeOf } from "@/lib/robots/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The wayline file of a designed route (lib/robots/routes.ts), where a DJI Dock downloads it when its flight task
// arrives: GET /api/fm/robots/route/{missionId}/{key}.kmz. Outside the sign-in (the dock has no session); the route's
// random key, sent only to the dock in the flight task, guards it. The dock checks the file against its MD5 fingerprint.
export async function GET(_req: Request, { params }: { params: Promise<{ p: string[] }> }) {
  const [missionId, file] = (await params).p ?? [];
  const key = String(file ?? "").replace(/\.kmz$/, "");
  const d = fmToday((await getRepo()).db);
  const m = d.missions.find((x) => x.id === missionId);
  const r = m && d.robots.find((x) => x.id === m.robotId);
  if (!m?.route || !r || key.length < 16 || key !== m.route.key) return new Response("Not found", { status: 404 });
  const f = djiKmz(routeOf(r, m.route.sortie), m.route.sortie, m.route.frame);
  return new Response(new Blob([f.data as BlobPart]), { headers: { "Content-Type": f.mime, "Content-Disposition": `attachment; filename="${f.filename}"`, "Cache-Control": "no-store" } });
}
