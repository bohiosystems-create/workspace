// The adapter contract: every connection answers status(), capabilities(), dispatch(job), cancel(job) and results()
// (plus estop()), against stand-ins on localhost for a vendor bridge and an Open-RMF server; the poller records what
// changed; push adapters convert the machines' own messages. Run: NEXT_PUBLIC_EDITION=vanilla npx tsx scripts/adapters.ts
import http from "node:http";
import { seedDb } from "../lib/seed";
import { fmToday } from "../lib/fm/engine";
import { act } from "../lib/fm/api";
import { directory } from "../lib/auth/people";
import { adapterFor, parserFor, rmfAdapter, simAdapter, vendorAdapter, platformAdapter, vdaAdapter, djiAdapter, orbitAdapter, securityAdapter, type FleetAdapter } from "../lib/robots/adapter";
import { pollFleets } from "../lib/robots/poll";
import type { Robot } from "../lib/robots/types";

const got: { method: string; url: string; body: string }[] = [];
let battery = 61, findingsServed = false;
const srv = http.createServer((req, res) => {
  let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
    got.push({ method: req.method!, url: req.url!, body: b });
    const j = (o: unknown, s = 200) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    const u = req.url!;
    if (u.startsWith("/ds/robots/") && u.includes("/results")) {
      if (findingsServed) return j({ reports: [] });
      findingsServed = true;
      return j({ reports: [{ source: "Drone service platform", findings: [{ asset: "FL-01", sensor: "thermal", label: "Flare tip 412 °C at the north burner", value: 412, unit: "°C", limit: 380, severity: "high" }] }] });
    }
    if (u.startsWith("/ds/robots/")) return j({ online: true, status: "on_mission", battery, zone: "kgpp:flr", job: { id: "VEND-77", status: "running", progress: 40 } });
    if (u === "/ds/missions") return j({ id: "VEND-78" });
    if (u.startsWith("/ds/missions/")) return j({ ok: true });
    if (u.startsWith("/sec/robots/") && u.endsWith("/estop")) return j({ ok: true });
    if (u.startsWith("/sec/")) return j({ error: "down" }, 503);
    if (u.startsWith("/rmf/fleets/")) return j({ name: "quadrupeds", robots: { "ex-1": { status: "working", battery: 0.82, location: { map: "L1", x: 12.5, y: 4 }, task_id: "patrol.dispatch-9" } } });
    if (u === "/rmf/tasks/dispatch_task") return j({ success: true, state: { booking: { id: "patrol.dispatch-10" } } });
    j({ error: "not here" }, 404);
  });
});

const results: [string, boolean, string?][] = [];
const check = (what: string, ok: boolean, why?: string) => results.push([what, ok, why]);

srv.listen(18991, async () => {
  const B = "http://127.0.0.1:18991";
  const env = { ROBOT_FLEETS: JSON.stringify({ "drone-service": { url: `${B}/ds` }, security: { url: `${B}/sec`, estop: true } }), ROBOT_RMF_URL: `${B}/rmf`, FLEET_BRIDGE_TOKEN: "x".repeat(20),
    DJI_WAYLINES: JSON.stringify({ "kgia:per": { url: "https://example/per.kmz", fingerprint: "abc" } }), VDA5050_NODES: JSON.stringify({ "kgia:rwy": "N-RWY" }), ROBOT_INGEST_TOKEN: "y".repeat(20) };
  Object.assign(process.env, env);
  const db = seedDb(), d = fmToday(db), robot = (n: string) => d.robots.find((r) => r.name === n)! as Robot;

  // 1. every connection has the five functions (and the stop)
  const all: FleetAdapter[] = [simAdapter, rmfAdapter(env), vendorAdapter({ url: `${B}/ds` }), platformAdapter, vdaAdapter(env), djiAdapter(env), orbitAdapter({ url: B }), securityAdapter(null)];
  for (const a of all) check(`${a.name}: status, capabilities, dispatch, cancel, results, estop`, ["status", "capabilities", "dispatch", "cancel", "results", "estop"].every((k) => typeof (a as unknown as Record<string, unknown>)[k] === "function"));

  // 2. a vendor bridge, asked: live status, results converted, a job sent in the common shape and cancelled
  const vtol = robot("VTOL-1"), va = adapterFor(vtol);
  const st = await va.status(vtol);
  check("vendor status() is live: on a job, battery, zone", st.source === "live" && st.status === "on_mission" && st.battery === 61 && st.job?.id === "VEND-77", JSON.stringify(st));
  const cap = va.capabilities(vtol);
  check("capabilities() in words: flies, thermal photos, gas readings", ["flies", "thermal photos", "gas readings"].every((w) => cap.can.includes(w)), cap.can.join(", "));
  const job = { ...d.missions[0], id: "MS-T1", robotId: vtol.id, kind: "flare_inspection" as const, waypoints: [{ zone: "kgpp:flr", label: "Flare", checks: ["thermal" as const] }] };
  const sent = await va.dispatch(job, vtol);
  const posted = got.find((x) => x.url === "/ds/missions");
  check("dispatch(job) sends the common shape and keeps the vendor's id", sent.sent && sent.externalId === "VEND-78" && !!posted && JSON.parse(posted.body).kind === "flare_inspection", JSON.stringify(sent));
  const cancelled = await va.cancel({ ...job, externalId: "VEND-78" }, vtol);
  check("cancel(job) reaches the vendor", cancelled.sent && got.some((x) => x.url === "/ds/missions/VEND-78/cancel"));
  const res = await va.results(vtol);
  check("results() pulls findings in our format", res.mode === "pull" && res.reports[0]?.findings?.[0]?.sensor === "thermal", res.note);
  findingsServed = false;

  // 3. Open-RMF: its fleet state read into ours (working → on a job, battery 0–1 → %)
  const ex1 = { ...robot("Ex-1"), adapter: "rmf" as const, externalId: "ex-1", fleet: "quadrupeds" };
  const rs = await rmfAdapter(env).status(ex1);
  check("RMF status(): working → on_mission, 0.82 → 82 %, its map position", rs.status === "on_mission" && rs.battery === 82 && rs.position?.map === "L1", JSON.stringify(rs));
  check("RMF dispatch(job) books a patrol", (await rmfAdapter(env).dispatch({ ...job, robotId: ex1.id }, ex1)).externalId === "patrol.dispatch-10");

  // 4. limits a connection puts on capabilities(): DJI flies only its waylines; a platform robot can't be sent
  const dc = adapterFor(robot("Drone-A1")).capabilities(robot("Drone-A1"));
  check("DJI capabilities(): only the mapped wayline routes", dc.places?.join() === "kgia:per" && dc.limits.some((l) => /wayline/i.test(l)), JSON.stringify(dc.places));
  check("a data-platform robot takes no jobs from here", adapterFor(robot("Crawler-1")).capabilities(robot("Crawler-1")).jobs.length === 0);
  const majid = directory(db).find((p) => /Majid Al-Rashid/.test(p.name))!;
  let refused = ""; try { act(db, { action: "mission", robotId: "Crawler-1", zone: "Tank farm", missionKind: "thickness_survey" }, majid.name, "web", majid); } catch (e) { refused = (e as Error).message; }
  check("sending it is refused with the reason", /maker's own software/.test(refused), refused);
  const majed = directory(db).find((p) => /Majed Al-Anazi/.test(p.name))!;
  let off = ""; try { act(db, { action: "mission", robotId: "Drone-A1", zone: "Landside & car parks", missionKind: "security_patrol" }, majed.name, "web", majed); } catch (e) { off = (e as Error).message; }
  check("a drone isn't sent where it has no wayline route", /only where its connection has a route: .*Perimeter/i.test(off), off);

  // 5. the poller: changes and results recorded once; a connection that doesn't answer is logged
  const p1 = await pollFleets(db, env);
  const d1 = fmToday(db), v1 = d1.robots.find((r) => r.name === "VTOL-1")!;
  check("poll records the vendor's state (battery 61 %)", v1.battery === 61 && (p1.find((x) => x.robot === "VTOL-1")?.recorded ?? 0) >= 1, JSON.stringify(p1.find((x) => x.robot === "VTOL-1")));
  check("poll turns the pulled finding into a robot finding", d1.missions.some((m) => m.findings.some((f) => f.label.startsWith("Flare tip 412"))));
  const p2 = await pollFleets(db, env);
  check("an unchanged state is not recorded again", (p2.find((x) => x.robot === "VTOL-1")?.recorded ?? 1) === 0, JSON.stringify(p2.find((x) => x.robot === "VTOL-1")));
  battery = 48;
  const p3 = await pollFleets(db, env);
  check("a battery change is recorded", (p3.find((x) => x.robot === "VTOL-1")?.recorded ?? 0) === 1 && fmToday(db).robots.find((r) => r.name === "VTOL-1")!.battery === 48);
  check("a security bridge that doesn't answer is logged for the exceptions queue", (db.integrationLog ?? []).some((x) => !x.ok && /Patrol-1/.test(x.what)), JSON.stringify(p1.find((x) => x.robot === "Patrol-1")));
  check("…once per quarter hour, not every minute", (db.integrationLog ?? []).filter((x) => /Patrol-1/.test(x.what)).length === 1);

  // 6. push adapters convert the machines' own messages
  const vda = parserFor("vda5050", env)?.({ robot: "FOD-1", state: { orderId: "MS-X", lastNodeId: "N-RWY", driving: true, batteryState: { batteryCharge: 77 }, errors: [], nodeStates: [{}], safetyState: { eStop: "NONE" } } });
  check("VDA 5050 state → our report", vda?.battery === 77, JSON.stringify(vda));
  const sec = parserFor("security")?.({ robot: "Patrol-A1", type: "Person detected", message: "Person at the airside fence", zone: "Landside", videoUrl: "https://video.example/patrol-a1" });
  check("a security alarm → an alert and the video address", sec?.alerts?.[0]?.kind === "person" && sec?.video === "https://video.example/patrol-a1", JSON.stringify(sec));

  for (const [what, ok, why] of results) console.log(`${ok ? "PASS" : "FAIL"} ${what}${ok || !why ? "" : ` — ${why}`}`);
  srv.close();
  process.exit(results.every(([, ok]) => ok) ? 0 : 1);
});
