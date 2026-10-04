"use client";
import { forwardRef, lazy, Suspense, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { LAYER_DEFS, PLAN, SHAPES, gpsToPlan, type Layer, type Shape } from "@/lib/siteplan";
import type { Location, Note } from "@/lib/types";
import { rootOf, type ClientDoc } from "./site";
import { usePanZoom } from "./usePanZoom";
import type { Site3DHandle } from "./Site3D";
import { Icon } from "./icons";

// three.js only downloads when someone opens the 3D view.
const SiteGL = lazy(() => import("./SiteGL"));

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

// ------------------------------------------------------------ label layout
// Labels are drawn at a fixed screen size, so on a zoomed-out plan they would run into each other, out of their
// buildings and under the document pins. Each frame they are laid out in priority order (site and building names
// first): a label too wide for its footprint is shortened ("Laydown Area 1 — Formwork" → "Laydown Area 1"), one
// that collides is nudged up or down, and failing that it is hidden until there is room.
const fontPx = (s: Shape) => { const d = s.detail ?? 1; return Math.min(Math.max((s.size ?? 10) * (d === 1 ? 0.9 : 1.15), 8), 15); };
const BOLD = /lbl-(b|c|big|zone|gate|h)\b/;
const SPACING: Record<string, number> = { "lbl-big": 0.08, "lbl-zone": 0.12, "lbl-b": 0.04 };
let measureCtx: CanvasRenderingContext2D | null = null;
const widthCache = new Map<string, number>();
function textWidth(text: string, cls: string, px: number) {
  const key = `${cls}|${text}`;
  let w100 = widthCache.get(key);
  if (w100 === undefined) {
    measureCtx ??= typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
    const ls = SPACING[cls.split(" ")[0]] ?? 0;
    if (measureCtx) { measureCtx.font = `${BOLD.test(cls) ? 700 : cls.includes("lbl-road") ? 600 : 400} 100px Montserrat, "Segoe UI", system-ui, sans-serif`; w100 = measureCtx.measureText(text).width + text.length * ls * 100; }
    else w100 = text.length * 62;
    widthCache.set(key, w100);
  }
  return (w100 * px) / 100;
}
const shorter = (t: string) => {
  const out: string[] = [];
  if (t.includes(" — ")) out.push(t.split(" — ")[0]);
  const np = t.replace(/\s*\([^)]*\)/g, "").trim(); if (np !== t) out.push(np);
  if (t.includes(" · ")) out.push(t.split(" · ")[0]);
  return [...new Set(out)];
};
type Box = [number, number, number, number]; // x0, y0, x1, y1 (plan units)
const hit = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
export interface Placed { text: string; dy: number }
function layoutLabels(texts: { s: Shape; i: number }[], k: number, z: number, pins: { x: number; y: number }[]): Map<number, Placed> {
  const out = new Map<number, Placed>();
  const pinBoxes: Box[] = pins.map((p) => [p.x - 11 / k, p.y - 27 / k, p.x + 11 / k, p.y + 1 / k]);
  const placed: Box[] = [];
  const rank = (s: Shape) => ((s.detail ?? 1) * 10) + (/lbl-(big|zone)/.test(s.cls) ? -5 : /lbl-(b|c|road|gate|h)\b/.test(s.cls) ? 0 : 5);
  const order = texts.filter(({ s }) => { const d = s.detail ?? 1; return !((d === 2 && z < 1.5) || (d === 3 && z < 2.8)); }).sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i);
  for (const { s, i } of order) {
    const px = fontPx(s), h = (px * 1.15) / k, start = s.cls.includes("lbl-zone");
    // fit the footprint: full text, then shorter forms
    let text = s.text ?? "";
    if (s.fit) {
      const cands = [text, ...shorter(text)];
      const ok = cands.find((t) => textWidth(t, s.cls, px) / k <= s.fit! * 1.02);
      if (!ok) continue;
      text = ok;
    }
    const w = textWidth(text, s.cls, px) / k + 4 / k;
    const x0 = start ? s.x! - 2 / k : s.x! - w / 2;
    const fixed = /lbl-(big|zone|gate|h)\b/.test(s.cls);
    const tries = fixed ? [0] : [0, h * 1.05, -h * 1.05];
    let done = false;
    for (const dy of tries) {
      const b: Box = [x0, s.y! + dy - h * 0.82, x0 + w, s.y! + dy + h * 0.25];
      if (!fixed && (placed.some((q) => hit(q, b)) || pinBoxes.some((q) => hit(q, b)))) continue;
      placed.push(b); out.set(i, { text, dy }); done = true; break;
    }
    // a building's own name stays even under a pin, as long as it does not collide with another label
    if (!done && (s.detail ?? 1) === 1 && !s.cls.includes("lbl-s")) {
      const b: Box = [x0, s.y! - h * 0.82, x0 + w, s.y! + h * 0.25];
      if (!placed.some((q) => hit(q, b))) { placed.push(b); out.set(i, { text, dy: 0 }); }
    }
  }
  return out;
}

function renderShape(s: Shape, i: number, k: number, sel: string | undefined, lay: Map<number, Placed>, si: number) {
  if (s.t === "text") {
    const p = lay.get(si); if (!p) return null;
    return <text key={i} x={s.x} y={s.y! + p.dy} className={s.cls} style={{ fontSize: fontPx(s) / k, strokeWidth: 3 / k }} textAnchor="middle">{p.text}</text>;
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
const SHAPE_INDEX = new Map(SHAPES.map((s, i) => [s, i]));

const SiteMap = forwardRef<MapHandle, Props>(function SiteMap({ locations, docs, notes, selectedId, dropMode, onSelect, onDrop, onGps }, handle) {
  const [layers, setLayers] = useState<Record<Layer, boolean>>(() => Object.fromEntries(LAYER_DEFS.map((l) => [l.id, l.on])) as Record<Layer, boolean>);
  const [layerOpen, setLayerOpen] = useState(false);
  const [gps, setGps] = useState<{ x: number; y: number; acc: number } | null>(null);
  const [drop, setDrop] = useState<{ x: number; y: number } | null>(null);
  // 2D plan sheet or the 3D massing model (remembered per device). Pinning a document needs the flat sheet.
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const s3 = useRef<Site3DHandle>(null);
  useEffect(() => { try { if (localStorage.getItem("kinan.mapmode") === "3d") setMode("3d"); } catch { /* blocked */ } }, []);
  const setView = (m: "2d" | "3d") => { setMode(m); try { localStorage.setItem("kinan.mapmode", m); } catch { /* blocked */ } };
  useEffect(() => { if (dropMode && mode === "3d") setMode("2d"); }, [dropMode, mode]);

  const pz = usePanZoom(PLAN.w, PLAN.h, (t) => {
    if (dropMode) { setDrop({ x: t.cx, y: t.cy }); onDrop(t.cx, t.cy); return; }
    const hit = t.target?.closest?.("[data-pin]")?.getAttribute("data-pin") ?? t.target?.closest?.("[data-loc]")?.getAttribute("data-loc");
    if (hit) onSelect(hit);
  });
  const { view, zoom } = pz;
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !pz.size.w) return;
    opened.current = true;
    if (pz.size.w < 600) requestAnimationFrame(() => pz.flyTo(600, 340, 2.1));
  }, [pz.size.w, pz]);

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
      if (a?.x === undefined) return;
      if (mode === "3d") s3.current?.focus(a.x, a.y!, a.type === "building" || a.type === "zone" ? 3 : 4.5);
      else pz.flyTo(a.x, a.y!, a.type === "building" || a.type === "zone" ? 3.2 : 5.5, 0.27);
    },
    locateMe: () => { if (!gps) return; if (mode === "3d") s3.current?.focus(gps.x, gps.y, 4.5); else pz.flyTo(gps.x, gps.y, 4.5); },
  }), [locations, pz, gps, mode]);

  useEffect(() => { if (!dropMode) setDrop(null); }, [dropMode]);

  const k = view.k;
  const visible = SHAPES.filter((s) => layers[s.layer]);
  const order: Layer[] = ["base", "landscape", "grid", "utilities", "roads", "buildings", "temp", "cranes", "hse"];
  const selLoc = selectedId ? rootOf(locations, selectedId)?.id : undefined;
  const lay = useMemo(() => layoutLabels(
    SHAPES.map((s, i) => ({ s, i })).filter(({ s }) => s.t === "text" && layers[s.layer]), k, zoom, pins),
  [k, zoom, layers, pins]);

  return (
    <div className={"mapwrap" + (dropMode ? " dropping" : "")}>
      {mode === "3d" && <Suspense fallback={<div className="gl-loading"><span className="spin" />Loading 3D model…</div>}><SiteGL ref={s3} layers={layers} selectedId={selLoc} pins={pins} gps={gps} onSelect={onSelect} /></Suspense>}
      <div ref={pz.ref} className="viewport" aria-label="Site plan" hidden={mode === "3d"}>
        <svg width={pz.size.w} height={pz.size.h} className="plan" role="img">
          <g transform={`translate(${view.x} ${view.y}) scale(${k})`}>
            <rect x={-2000} y={-2000} width={PLAN.w + 4000} height={PLAN.h + 4000} className="ground" />
            {order.flatMap((ly) => layers[ly] || ly === "base"
              ? visible.filter((s) => s.layer === ly).map((s, i) => renderShape(s, ly.length * 1000 + i, k, selLoc, lay, SHAPE_INDEX.get(s)!))
              : [])}
            {/* document / issue pins */}
            <g>
              {pins.map((p) => {
                const r = 0.72 / k;
                return (
                  <g key={`${p.x},${p.y}`} transform={`translate(${p.x} ${p.y}) scale(${r})`} data-pin={p.loc} className="pin">
                    <g className={"pindrop" + (p.loc === selLoc ? " pinsel" : "")}>
                      <path d="M0,0 C-4,-8 -13,-13 -13,-22 A13,13 0 1 1 13,-22 C13,-13 4,-8 0,0Z" className={p.issues ? "pinbody warn" : "pinbody"} data-pin={p.loc} />
                      <text y={-18} textAnchor="middle" className="pintxt" data-pin={p.loc}>{p.docs || "!"}</text>
                      {p.issues > 0 && <g data-pin={p.loc}><circle cx={12} cy={-34} r={8} className="pinflag" /><text x={12} y={-31} textAnchor="middle" className="pinflagtxt">{p.issues}</text></g>}
                    </g>
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

      {/* Thumb zone: the view switch and camera controls sit bottom-right; zoom buttons only for mouse users. */}
      <div className={"mapctl" + (mode === "3d" ? " is3d" : "")}>
        <div className="seg2" role="group" aria-label="Map view">
          <button className={mode === "2d" ? "on" : ""} aria-pressed={mode === "2d"} onClick={() => setView("2d")}>2D</button>
          <button className={mode === "3d" ? "on" : ""} aria-pressed={mode === "3d"} onClick={() => setView("3d")} disabled={dropMode}>3D</button>
        </div>
        <button className="fine" aria-label="Zoom in" onClick={() => (mode === "3d" ? s3.current?.zoomBy(1.6) : pz.zoomBy(1.6))}>＋</button>
        <button className="fine" aria-label="Zoom out" onClick={() => (mode === "3d" ? s3.current?.zoomBy(1 / 1.6) : pz.zoomBy(1 / 1.6))}>－</button>
        {mode === "3d" && <button aria-label="Turn the model a quarter" onClick={() => s3.current?.rotate()}>↻</button>}
        <button aria-label="Show the whole site" onClick={() => (mode === "3d" ? s3.current?.fit() : pz.fit())}>⤢</button>
        <button aria-label="My location" onClick={() => { if (!gps) return; if (mode === "3d") s3.current?.focus(gps.x, gps.y, 4.5); else pz.flyTo(gps.x, gps.y, 4.5); }} disabled={!gps} className={gps ? "" : "dim"}>◎</button>
      </div>
      <button className={"layerbtn" + (layerOpen ? " on" : "")} aria-label="Map layers" aria-expanded={layerOpen} onClick={() => setLayerOpen((o) => !o)}><Icon name="layers" /></button>
      {layerOpen && (
        <div className="layers" role="dialog" aria-label="Map layers">
          <div className="layers-h"><b>Layers</b><button className="x" onClick={() => setLayerOpen(false)} aria-label="Close">✕</button></div>
          <div className="layers-grid">
            {LAYER_DEFS.map((l) => (
              <button key={l.id} className={"layer" + (layers[l.id] ? " on" : "")} aria-pressed={layers[l.id]} onClick={() => setLayers({ ...layers, [l.id]: !layers[l.id] })}>{l.label}</button>
            ))}
          </div>
        </div>
      )}
      {mode === "2d" && <div className="scaletxt"><i style={{ width: 80 }} />{niceMetres(80 / k * PLAN.metresPerUnit)}</div>}
    </div>
  );
});
export default SiteMap;
