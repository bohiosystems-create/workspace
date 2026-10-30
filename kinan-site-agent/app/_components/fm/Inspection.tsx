"use client";
/**
 * The facility's inspection plan, from the oil and gas robotics reviews (lib/robots/inspection.ts): every surface that
 * needs inspecting — tank roofs, shells and floors, the export line inside and out, vessel internals, the flare — the
 * damage expected there, the test method that finds it, the robots in the fleet that can do it (and what that method
 * can't see), or the gap and the kind of robot that would close it. Then the methods and the robot types themselves.
 */
import { useState } from "react";
import type { facilityStateFor } from "@/lib/fm/api";
import { LOCOMOTION, METHODS, SOURCES, SURFACE_LABEL, locomotionOf, type Locomotion, type Method } from "@/lib/robots/inspection";

type FS = ReturnType<typeof facilityStateFor>;
const dm = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" });

export function InspectionPanel({ s, onRobot, onAsset }: { s: FS; onRobot: (id: string) => void; onAsset: (id: string) => void }) {
  const [show, setShow] = useState<"plan" | "methods" | "robots">("plan");
  const rows = s.inspection;
  const gaps = rows.filter((r) => r.gap).length;
  const used = new Set<Locomotion>(rows.map((r) => r.target.platform));
  return (
    <section className="ops-panel">
      <p className="muted small">What each surface needs, from two reviews of inspection robotics in oil and gas: the damage expected there, the test method that finds it, and the robot that can reach it — or the gap. Sending a robot to an asset is checked against the same rules: a robot that can&apos;t reach the surface, can&apos;t hold on to it or has no method that finds the damage is refused, with the reason.</p>
      <div className="seg3 in-seg" role="group" aria-label="Show">
        {([["plan", `Plan · ${rows.length} surfaces${gaps ? ` · ${gaps} gaps` : ""}`], ["methods", "Test methods"], ["robots", "Robot types"]] as const).map(([k, l]) => <button key={k} className={show === k ? "on" : ""} aria-pressed={show === k} onClick={() => setShow(k)}>{l}</button>)}
      </div>

      {show === "plan" && <ul className="in-rows">{rows.map((r, i) => (
        <li key={i} className={r.gap ? "gap" : ""}>
          <div className="in-what"><button className="linkish" onClick={() => onAsset(r.target.assetId)}><b>{r.target.tag}</b> {r.target.part}</button><em>{r.target.name} · {r.target.zone} · {SURFACE_LABEL[r.target.surface]}</em></div>
          <div className="in-dmg">{r.target.damage}<em>{r.target.methods.map((m) => METHODS[m].name).join(" → ")}</em></div>
          <div className="in-who">
            {r.robots.length ? r.robots.map((x) => <div key={x.id}><button className="mini" onClick={() => onRobot(x.id)}>{x.name}</button> <span>{METHODS[x.method].name} · {x.autonomy}</span>{x.cautions.length > 0 && <em>{x.cautions.join(" · ")}</em>}</div>)
              : <span className="in-gap">{r.gap}</span>}
            {r.last && <em>Last inspected by robot {dm(r.last)}</em>}
          </div>
        </li>))}</ul>}

      {show === "methods" && <div className="in-cards">{(Object.keys(METHODS) as Method[]).map((m) => { const x = METHODS[m]; return (
        <div key={m}><b>{x.name}</b><span>Finds {x.finds} · {x.materials === "any" ? "any material" : x.materials === "ferromagnetic" ? "ferromagnetic steel only" : "metals only"}</span>
          <p><i>Good:</i> {x.good.join("; ")}.</p><p><i>Can&apos;t:</i> {x.limits.join("; ")}.</p><em>[{x.src.join("][")}]</em></div>); })}</div>}

      {show === "robots" && <div className="in-cards">{(Object.keys(LOCOMOTION) as Locomotion[]).map((k) => { const x = LOCOMOTION[k]; const n = s.robots.filter((r) => locomotionOf(r) === k).length; return (
        <div key={k} className={used.has(k) || n ? "" : "dim"}><b>{x.name}</b><span>Reaches: {x.reaches.map((y) => SURFACE_LABEL[y]).join(", ")}{n ? ` · ${n} in this fleet` : ""}</span>
          <p><i>Good:</i> {x.good.join("; ")}.</p><p><i>Can&apos;t:</i> {x.limits.join("; ")}.</p><em>[{x.src.join("][")}]</em></div>); })}</div>}

      <p className="muted small">Sources: {(Object.entries(SOURCES) as [string, string][]).map(([k, v]) => `[${k}] ${v}`).join(" · ")}.</p>
    </section>
  );
}
