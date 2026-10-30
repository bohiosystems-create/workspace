"use client";
/**
 * Inspection routes the schedule designs by itself (lib/robots/routes.ts): what is due (planned maintenance, the
 * predictive engine's assets at risk, the inspection plan, findings to check again) given to the robots that can check
 * it, each robot's round on the plant map, its waypoints with height or depth, heading and camera angle — exported in
 * the machine's own format (DJI wayline, MAVLink .plan, VDA 5050, Open-RMF) or sent straight to it.
 */
import { useState } from "react";
import type { facilityStateFor } from "@/lib/fm/api";
import { CAPABILITY_LABEL } from "@/lib/robots/types";
import { FORMAT_LABEL, exportSortie } from "@/lib/robots/export";

type FS = ReturnType<typeof facilityStateFor>;
type Plan = NonNullable<FS["routes"]>;
type RR = Plan["routes"][number];
type Doit = (k: string, b: Record<string, unknown>) => Promise<void>;
const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" });
const km = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);

function download(r: RR, n: number, fmt: RR["formats"][number], frame: Plan["frame"]) {
  const f = exportSortie(fmt, r, r.sorties[n], frame);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([f.data as BlobPart], { type: f.mime }));
  a.download = f.filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5_000);
}

export function RoutesPanel({ s, doit, busy, onRobot }: { s: FS; doit: Doit; busy: string | null; onRobot: (id: string) => void }) {
  const p = s.routes;
  const [sel, setSel] = useState<string | null>(p?.routes[0]?.robotId ?? null);
  if (!p) return null;
  const r = p.routes.find((x) => x.robotId === sel) ?? p.routes[0];
  const sendable = p.routes.filter((x) => x.sendable);
  const sentAlready = (id: string) => s.missions.some((m) => m.robotId === id && m.route && (m.status === "planned" || m.status === "running"));
  return (
    <section className="ops-panel rt">
      <p className="muted small">Routes designed by the schedule itself: what is due today and tomorrow — planned maintenance, the predictive engine&apos;s assets at risk, the inspection plan, findings to check again — given to the robots that can check it (their sensors, the area&apos;s hazards and their Ex rating, air for what is high, a crawler for wall thickness, an underwater vehicle for the subsea line), ordered into the shortest round from each dock and cut into sorties with a quarter of the battery to spare. Airside work waits for the night closure.</p>
      <div className="ag-kpis">
        <div><b>{p.tasks.length}</b><span>assets to check</span></div>
        <div><b>{p.routes.length}</b><span>robots with a route</span></div>
        <div><b>{p.routes.reduce((n, x) => n + x.sorties.length, 0)}</b><span>sorties</span></div>
        <div><b>{km(p.routes.reduce((n, x) => n + x.sorties.reduce((m, y) => m + y.distanceM, 0), 0))}</b><span>travelled</span></div>
        <div><b>{p.uncovered.length}</b><span>checks no robot can make</span></div>
      </div>
      <div className="sa-row">
        <div className="rt-pick" role="tablist">{p.routes.map((x) => <button key={x.robotId} role="tab" aria-selected={x.robotId === r?.robotId} className={x.robotId === r?.robotId ? "on" : ""} onClick={() => setSel(x.robotId)}>{x.name}<i>{x.tasks}</i></button>)}</div>
        {sendable.length > 0 && <button className="studio-add" disabled={!!busy} onClick={() => doit("routes", { action: "routes_send", facilityId: s.facility.id })}>Send all routes</button>}
      </div>
      {r && <div className="rt-body">
        <div className="rt-map"><RouteMap s={s} r={r} /></div>
        <div className="rt-side">
          <div className="rt-head"><b><button className="linkish" onClick={() => onRobot(r.robotId)}>{r.name}</button></b> · {r.model}<em>{r.sendNote}</em></div>
          {r.sorties.map((so, i) => (
            <div key={so.n} className="rt-sortie">
              <div className="rt-sh"><b>Sortie {so.n}</b> {hm(so.start)} · {so.durationMin} min · {km(so.distanceM)} · {so.batteryPct}% battery{so.airside ? " · airside, in the closure" : ""}</div>
              <ol className="rt-wps">{so.points.filter((x) => x.kind !== "dock").map((x) => (
                <li key={x.seq} className={x.checks.length ? "" : "tr"}>
                  <span className="rt-n">{x.seq}</span>
                  <span className="grow"><b>{x.label}</b>{x.checks.length > 0 && <em>{x.checks.map((c) => CAPABILITY_LABEL[c]).join(", ")} · {Math.round(x.dwellS / 60) || "<1"} min{x.altM !== undefined ? ` · ${x.altM} m up, camera ${x.gimbalPitchDeg}°` : ""}{x.depthM !== undefined ? ` · ${x.depthM} m deep` : ""}</em>}{x.reasons?.length ? <em className="why">{x.reasons.slice(0, 2).join(" · ")}</em> : null}</span>
                  <span className="rt-geo">{x.lat.toFixed(5)}, {x.lon.toFixed(5)}</span>
                </li>))}</ol>
              <div className="od-acts">{r.formats.map((f) => <button key={f} className="mini" onClick={() => download(r, i, f, p.frame)}>{FORMAT_LABEL[f]}</button>)}</div>
            </div>
          ))}
          {r.sendable && (sentAlready(r.robotId) ? <p className="studio-ok">Sent — its missions are on today&apos;s list.</p>
            : <button className="studio-add" disabled={!!busy} onClick={() => doit("routes", { action: "routes_send", facilityId: s.facility.id, robotIds: [r.robotId] })}>Send to {r.name}</button>)}
        </div>
      </div>}
      {p.uncovered.length > 0 && <><div className="rpt-label">No robot can make these checks</div>
        <ul className="ops-list">{p.uncovered.map((u, i) => <li key={i}><span className="grow"><b>{u.tag}</b> {u.checks.map((c) => CAPABILITY_LABEL[c]).join(", ")}<em>{u.why} — a technician does it</em></span></li>)}</ul></>}
      <p className="muted small">Coordinates: {p.frame.demo ? "the demo's site frame — set the surveyed corner of the plan and its scale in SITE_FRAMES before flying" : "the surveyed site frame (SITE_FRAMES)"} ({p.frame.lat.toFixed(4)}, {p.frame.lon.toFixed(4)}; {p.frame.mPerUnit} m per map unit). Load the first file of each kind into the machine&apos;s own software (DJI Pilot 2, QGroundControl, the fleet manager) and check it there before it flies or dives.</p>
    </section>
  );
}

/** The plant map with the robot's sorties: zones, assets on the route, numbered waypoints, the dock. */
function RouteMap({ s, r }: { s: FS; r: RR }) {
  const COL = ["var(--accent-strong)", "var(--blue)", "var(--green)", "var(--amber)"];
  const pts = r.sorties.flatMap((so) => so.points);
  const maxX = Math.max(100, ...pts.map((p) => p.x)), off = maxX > 100;
  return (
    <svg viewBox={`0 0 ${off ? Math.min(160, maxX + 4) : 100} 60`} role="img" aria-label={`${r.name}'s route on the plant map`}>
      {s.zones.map((z) => <g key={z.id}><rect x={z.x} y={z.y} width={z.w} height={z.h} rx="1" className={`rt-z${z.atex ? " ex" : ""}${z.closed ? " air" : ""}`} /><text x={z.x + 1} y={z.y + 2.6} className="rt-zl">{z.name}</text></g>)}
      {off && <text x={101} y={50} className="rt-zl">→ sea</text>}
      {r.sorties.map((so, k) => <g key={so.n}>
        <polyline points={so.points.map((p) => `${p.x},${p.y}`).join(" ")} className="rt-line" style={{ stroke: COL[k % COL.length] }} />
        {so.points.filter((p) => p.kind !== "dock").map((p) => <g key={p.seq}><circle cx={p.x} cy={p.y} r={p.checks.length ? 1.6 : 0.8} style={{ fill: COL[k % COL.length] }} />{p.checks.length > 0 && <text x={p.x} y={p.y + 0.6} className="rt-num">{p.seq}</text>}</g>)}
      </g>)}
      {r.sorties[0] && <g><rect x={r.sorties[0].points[0].x - 1.5} y={r.sorties[0].points[0].y - 1.5} width="3" height="3" className="rt-dock" /><text x={r.sorties[0].points[0].x + 2.2} y={r.sorties[0].points[0].y + 0.8} className="rt-zl">dock</text></g>}
    </svg>
  );
}
