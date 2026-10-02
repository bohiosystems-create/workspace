"use client";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { LAYER_DEFS, PLAN, SHAPES, gpsToPlan, type Layer, type Shape } from "@/lib/siteplan";
import type { Location, Note } from "@/lib/types";
import { rootOf, type ClientDoc } from "./site";
import { usePanZoom } from "./usePanZoom";

export interface MapHandle { focusLocation: (id: string) => void; locateMe: () => void }

interface Props {
  locations: Location[];
  docs: ClientDoc[];
  notes: Note[];
  selectedId?: string;
  dropMode: boolean;
  onSelect: (locationId: string) => void;
  onDrop: (x: number, y: number) => void;
  onGps: (p: { x: number; y: number; locationId?: string } | null) => void;
}

const niceMetres = (m: number) => { const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500]; const v = steps.reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a)); return `≈ ${v} m`; };
const dist = (a: { x: number; y: number }, b: { x?: number; y?: number }) => Math.hypot(a.x - (b.x ?? 1e9), a.y - (b.y ?? 1e9));

function renderShape(s: Shape, i: number, k: number, z: number, sel: string | undefined) {
  if (s.t === "text") {
    const d = s.detail ?? 1;
    if ((d === 2 && z < 1.5) || (d === 3 && z < 2.8)) return null;
    const px = Math.min(Math.max((s.size ?? 10) * (d === 1 ? 0.9 : 1.15), 8), 15);
    return <text key={i} x={s.x} y={s.y} className={s.cls} style={{ fontSize: px / k, strokeWidth: 3 / k }} textAnchor="middle">{s.text}</text>;
  }
  const common = { className: s.cls + (s.loc && s.loc === sel ? " sel" : ""), "data-loc": s.loc, style: { strokeWidth: undefined as number | undefined } };
  switch (s.t) {
    case "rect": return <rect key={i} {...common} x={s.x} y={s.y} width={s.w} height={s.h} />;
    case "poly": return <polygon key={i} {...common} points={s.pts!.map((p) => p.join(",")).join(" ")} />;
    case "line": return <polyline key={i} {...common} points={s.pts!.map((p) => p.join(",")).join(" ")} fill="none" />;
    case "circle": return <circle key={i} {...common} cx={s.cx} cy={s.cy} r={s.r} />;
  }
  return null;
}

const SiteMap = forwardRef<MapHandle, Props>(function SiteMap({ locations, docs, notes, selectedId, dropMode, onSelect, onDrop, onGps }, handle) {
  const [layers, setLayers] = useState<Record<Layer, boolean>>(() => Object.fromEntries(LAYER_DEFS.map((l) => [l.id, l.on])) as Record<Layer, boolean>);
  const [layerOpen, setLayerOpen] = useState(false);
  const [gps, setGps] = useState<{ x: number; y: number; acc: number } | null>(null);
  const [drop, setDrop] = useState<{ x: number; y: number } | null>(null);

  const pz = usePanZoom(PLAN.w, PLAN.h, (t) => {
    if (dropMode) { setDrop({ x: t.cx, y: t.cy }); onDrop(t.cx, t.cy); return; }
    const hit = t.target?.closest?.("[data-pin]")?.getAttribute("data-pin") ?? t.target?.closest?.("[data-loc]")?.getAttribute("data-loc");
    if (hit) onSelect(hit);
  });
  const { view, zoom } = pz;

  // --- document / issue pins: one badge per anchor point ---
  const pins = useMemo(() => {
    const byKey = new Map<string, { x: number; y: number; loc: string; docs: number; issues: number }>();
    const anchorOf = (locId: string, pin?: { x: number; y: number }) => {
      if (pin) return { x: pin.x, y: pin.y, loc: locId };
      const root = rootOf(locations, locId);
      const l = locations.find((q) => q.id === locId);
      const a = l?.type === "level" ? root : l;
      // Site-wide documents (specs, plans) would all pile up mid-map — they live in the Documents tab.
      return a?.x !== undefined && a.type !== "site" ? { x: a.x!, y: a.y!, loc: a.id } : null;
    };
    const slot = (a: { x: number; y: number; loc: string }) => {
      const key = `${Math.round(a.x)},${Math.round(a.y)}`;
      if (!byKey.has(key)) byKey.set(key, { ...a, docs: 0, issues: 0 });
      return byKey.get(key)!;
    };
    for (const d of docs) { const a = anchorOf(d.locationId, d.pin); if (a) slot(a).docs++; }
    for (const n of notes) {
      if (n.status !== "open") continue;
      const d = n.docId ? docs.find((x) => x.id === n.docId) : undefined;
      const a = anchorOf(n.locationId ?? d?.locationId ?? "", d?.pin);
      if (a && (n.kind === "issue" || n.kind === "instruction")) slot(a).issues++;
    }
    return [...byKey.values()];
  }, [docs, notes, locations]);

  // --- GPS ---
  useEffect(() => {
    const sim = new URLSearchParams(location.search).get("at");
    const push = (x: number, y: number, acc: number) => {
      const inside = x > -80 && y > -80 && x < PLAN.w + 80 && y < PLAN.h + 80;
      if (!inside) { setGps(null); onGps(null); return; }
      setGps({ x, y, acc });
      const near = locations
        .filter((l) => l.type !== "level" && l.type !== "site" && l.type !== "zone" && l.x !== undefined)
        .sort((a, b) => dist({ x, y }, a) - dist({ x, y }, b))[0];
      onGps({ x, y, locationId: near && dist({ x, y }, near) < 140 ? near.id : undefined });
    };
    if (sim) { const [sx, sy] = sim.split(",").map(Number); if (Number.isFinite(sx) && Number.isFinite(sy)) push(sx, sy, 6); return; }
    if (!("geolocation" in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (p) => { const q = gpsToPlan(p.coords.latitude, p.coords.longitude); push(q.x, q.y, p.coords.accuracy / PLAN.metresPerUnit); },
      () => {}, { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations]);

  useImperativeHandle(handle, () => ({
    focusLocation: (id) => {
      const l = locations.find((q) => q.id === id);
      const a = l?.type === "level" ? rootOf(locations, id) : l;
      if (a?.x !== undefined) pz.flyTo(a.x, a.y!, a.type === "building" || a.type === "zone" ? 3.2 : 5.5, 0.27);
    },
    locateMe: () => { if (gps) pz.flyTo(gps.x, gps.y, 4.5); },
  }), [locations, pz, gps]);

  useEffect(() => { if (!dropMode) setDrop(null); }, [dropMode]);

  const k = view.k;
  const visible = SHAPES.filter((s) => layers[s.layer]);
  const order: Layer[] = ["base", "landscape", "grid", "utilities", "roads", "buildings", "temp", "cranes", "hse"];
  const selLoc = selectedId ? rootOf(locations, selectedId)?.id : undefined;

  return (
    <div className={"mapwrap" + (dropMode ? " dropping" : "")}>
      <div ref={pz.ref} className="viewport" aria-label="Site plan">
        <svg width={pz.size.w} height={pz.size.h} className="plan" role="img">
          <g transform={`translate(${view.x} ${view.y}) scale(${k})`}>
            <rect x={-2000} y={-2000} width={PLAN.w + 4000} height={PLAN.h + 4000} className="ground" />
            {order.flatMap((ly) => layers[ly] || ly === "base"
              ? visible.filter((s) => s.layer === ly).map((s, i) => renderShape(s, ly.length * 1000 + i, k, zoom, selLoc))
              : [])}
            {/* document / issue pins */}
            <g>
              {pins.map((p) => {
                const r = 0.72 / k;
                return (
                  <g key={`${p.x},${p.y}`} transform={`translate(${p.x} ${p.y}) scale(${r})`} data-pin={p.loc} className="pin">
                    <path d="M0,0 C-4,-8 -13,-13 -13,-22 A13,13 0 1 1 13,-22 C13,-13 4,-8 0,0Z" className={p.issues ? "pinbody warn" : "pinbody"} data-pin={p.loc} />
                    <text y={-18} textAnchor="middle" className="pintxt" data-pin={p.loc}>{p.docs || "!"}</text>
                    {p.issues > 0 && <g data-pin={p.loc}><circle cx={12} cy={-34} r={8} className="pinflag" /><text x={12} y={-31} textAnchor="middle" className="pinflagtxt">{p.issues}</text></g>}
                  </g>
                );
              })}
            </g>
            {drop && <g transform={`translate(${drop.x} ${drop.y}) scale(${1 / k})`}><circle r={10} className="droppoint" /><path d="M-16,0H16M0,-16V16" className="dropcross" /></g>}
            {gps && (
              <g transform={`translate(${gps.x} ${gps.y})`}>
                <circle r={Math.max(gps.acc, 6)} className="gpsacc" />
                <g transform={`scale(${1 / k})`}><circle r={9} className="gps" /></g>
              </g>
            )}
          </g>
        </svg>
      </div>

      {dropMode && <div className="banner">Tap the exact spot on the plan to attach a document</div>}

      <div className="mapctl">
        <button aria-label="Zoom in" onClick={() => pz.zoomBy(1.6)}>＋</button>
        <button aria-label="Zoom out" onClick={() => pz.zoomBy(1 / 1.6)}>－</button>
        <button aria-label="Fit site" onClick={pz.fit}>⤢</button>
        <button aria-label="My location" onClick={() => gps && pz.flyTo(gps.x, gps.y, 4.5)} disabled={!gps} className={gps ? "" : "dim"}>◎</button>
        <button aria-label="Layers" onClick={() => setLayerOpen((o) => !o)} className={layerOpen ? "on" : ""}>▤</button>
      </div>
      {layerOpen && (
        <div className="layers">
          {LAYER_DEFS.map((l) => (
            <label key={l.id}><input type="checkbox" checked={layers[l.id]} onChange={() => setLayers({ ...layers, [l.id]: !layers[l.id] })} /> {l.label}</label>
          ))}
        </div>
      )}
      <div className="scaletxt"><i style={{ width: 80 }} />{niceMetres(80 / k * PLAN.metresPerUnit)}</div>
    </div>
  );
});
export default SiteMap;
