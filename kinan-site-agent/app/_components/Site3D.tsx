"use client";
/**
 * 3D site model: the same plan as the 2D sheet, drawn as an isometric massing model. Buildings rise to the level
 * the schedule says is cast (solid), the rest of the tower is a ghost outline, the level being cast pulses orange,
 * tower cranes slew, hoists travel. Everything is projected SVG (no WebGL), so it runs on any phone and in the
 * single-file build. Tap a building, yard or crane to select it, as on the plan.
 */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { BUILDINGS, PLAN, SHAPES, VILLAS, type Layer } from "@/lib/siteplan";
import { structureProgress } from "@/lib/core/progress";
import { shade } from "@/lib/chart3d";
import type { Activity } from "@/lib/types";
import { usePanZoom } from "./usePanZoom";

export interface Site3DHandle { focus: (x: number, y: number, zoom?: number) => void; fit: () => void; zoomBy: (f: number) => void; rotate: () => void }
export interface Pin { x: number; y: number; loc: string; docs: number; issues: number }
interface Props {
  layers: Record<Layer, boolean>;
  selectedId?: string;
  pins: Pin[];
  gps: { x: number; y: number; acc: number } | null;
  onSelect: (id: string) => void;
}

const COS = Math.cos(Math.PI / 6), SIN = 0.5;
const FLOOR = 7;            // plan units per storey (3.5 m)
const TOP = 350;            // headroom above the ground plane for the tallest tower + crane
const CW = (PLAN.w + PLAN.h) * COS, CH = (PLAN.w + PLAN.h) * SIN + TOP + 40;

// Face colours per theme (the plan's CSS tokens, as hex so faces can be shaded).
const PAL = {
  light: { res: "#c3cedf", ret: "#efd2b8", hot: "#d8c9e8", ame: "#c8e3cf", villa: "#e8dbb6", util: "#d4d7dc", civic: "#c6e1d0", core: "#8d96a2", office: "#eedfae", camp: "#ebcfb4", batch: "#c9c7c2", cabin: "#f4ebda", silo: "#b3b8c0", hoist: "#f59a63", mast: "#f15a22", jib: "#d94a16", tree: "#86c998", trunk: "#7a5a3a", ground: "#e2e1dd", plot: "#f6f5f2", road: "#8b8b8f", roadPub: "#66666a", cl: "#f4f4f4", zone1: "rgba(90,130,200,.09)", zone2: "rgba(70,160,100,.1)", zone3: "rgba(241,90,34,.08)", zl1: "#6b8fc9", zl2: "#4f9e6a", zl3: "#e07a45", yard: "#efe6c9", waste: "#dbe8c4", garden: "#cdeccf", water: "#9fd3f0", basement: "#3b8fc4", gate: "#3f9a5a", hse: "#3f9a5a", ink: "#2e2e2f", ink2: "#55555a", halo: "#ffffff", ghost: "#2e2e2f", fence: "#8d8b84", shadow: "rgba(46,46,47,.16)" },
  dark: { res: "#33405a", ret: "#5a4330", hot: "#453b5c", ame: "#2f4d3a", villa: "#54482a", util: "#3d4147", civic: "#2f4a40", core: "#5c6570", office: "#4d4428", camp: "#523b2e", batch: "#3f3e41", cabin: "#3a342c", silo: "#5a5f68", hoist: "#f59a63", mast: "#ff6a33", jib: "#ff8a52", tree: "#2f6b3f", trunk: "#5a3f28", ground: "#121214", plot: "#1e1f22", road: "#3c3d42", roadPub: "#2a2b2f", cl: "#6b6b70", zone1: "rgba(107,143,201,.12)", zone2: "rgba(79,158,106,.12)", zone3: "rgba(255,106,51,.1)", zl1: "#6b8fc9", zl2: "#4f9e6a", zl3: "#ff6a33", yard: "#3b3621", waste: "#2f3a24", garden: "#22402a", water: "#1f4b63", basement: "#4aa3dc", gate: "#4fb86e", hse: "#4fb86e", ink: "#ececf0", ink2: "#b9b9c1", halo: "#141416", ghost: "#ececf0", fence: "#55555c", shadow: "rgba(0,0,0,.35)" },
};
type Pal = typeof PAL.light;

function useDark() {
  const read = () => { const t = document.documentElement.dataset.theme; return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; };
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(read());
    const mo = new MutationObserver(() => setDark(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = matchMedia("(prefers-color-scheme: dark)"); const f = () => setDark(read()); mq.addEventListener("change", f);
    return () => { mo.disconnect(); mq.removeEventListener("change", f); };
  }, []);
  return dark;
}

let schedP: Promise<Activity[] | null> | null = null;
const loadSchedule = () => (schedP ??= fetch("/api/project", { cache: "no-store" }).then((r) => r.json()).then((d) => (d?.schedule as Activity[]) ?? null).catch(() => null));

type Rect = { x: number; y: number; w: number; h: number };
interface Block { id?: string; r: Rect; z0: number; z: number; full?: number; active?: boolean; color: keyof Pal; label?: string; sub?: string; depth: number; kind: "box" | "hoist" }

const CRANE_TOWER: Record<string, string> = { tc1: "tower-a", tc2: "tower-b", tc3: "hotel-c" };
const SVC_H: Record<string, number> = { substation: 14, stp: 10, "water-tank": 22, mosque: 24 };

const Site3D = forwardRef<Site3DHandle, Props>(function Site3D({ layers, selectedId, pins, gps, onSelect }, handle) {
  const dark = useDark();
  const pal = dark ? PAL.dark : PAL.light;
  const [rot, setRot] = useState(0);
  const [schedule, setSchedule] = useState<Activity[] | null | undefined>(undefined);
  useEffect(() => { loadSchedule().then(setSchedule); }, []);

  const pz = usePanZoom(CW, CH, (t) => {
    const hit = t.target?.closest?.("[data-pin]")?.getAttribute("data-pin") ?? t.target?.closest?.("[data-loc]")?.getAttribute("data-loc");
    if (hit) onSelect(hit);
  }, 10);
  const { view } = pz;
  const k = view.k;
  // Open on Phase 1 at a readable zoom rather than the whole diamond, and re-centre the same spot after a rotation.
  const centred = useRef(-1);
  useEffect(() => {
    if (!pz.size.w || !pz.size.h || centred.current === rot) return;
    centred.current = rot;
    const [cx, cy] = R(PLAN.w * 0.42, PLAN.h * 0.42);
    const [X, Y] = P(cx, cy, 60);
    pz.flyTo(X, Y, 2.05, 0.5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pz.size.w, pz.size.h, rot]);

  // --- rotation (quarter turns) and the isometric projection ---
  const Wr = rot % 2 ? PLAN.h : PLAN.w, Hr = rot % 2 ? PLAN.w : PLAN.h;
  const ox = Hr * COS, oy = TOP;
  const R = (x: number, y: number): [number, number] => rot === 0 ? [x, y] : rot === 1 ? [PLAN.h - y, x] : rot === 2 ? [PLAN.w - x, PLAN.h - y] : [y, PLAN.w - x];
  const RR = (r: Rect): Rect => {
    const [ax, ay] = R(r.x, r.y), [bx, by] = R(r.x + r.w, r.y + r.h);
    return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
  };
  const P = (x: number, y: number, z = 0): [number, number] => [(x - y) * COS + ox, (x + y) * SIN - z + oy];
  const pts = (...ps: [number, number][]) => ps.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const faces = (r: Rect, z0: number, z1: number) => {
    const A = P(r.x, r.y, z1), B = P(r.x + r.w, r.y, z1), C = P(r.x + r.w, r.y + r.h, z1), D = P(r.x, r.y + r.h, z1);
    const B0 = P(r.x + r.w, r.y, z0), C0 = P(r.x + r.w, r.y + r.h, z0), D0 = P(r.x, r.y + r.h, z0);
    return { top: pts(A, B, C, D), left: pts(D0, C0, C, D), right: pts(B0, C0, C, B) };
  };

  // --- what stands on the site, from the plan + the schedule ---
  const progress = useMemo(() => (schedule ? structureProgress(schedule, [...BUILDINGS, ...VILLAS.map((v) => ({ id: v.id, floors: 2 }))]) : null), [schedule]);
  const blocks = useMemo(() => {
    const out: Block[] = [];
    const push = (b: Omit<Block, "depth" | "r"> & { r: Rect }) => { const r = RR(b.r); out.push({ ...b, r, depth: r.x + r.w + r.y + r.h }); };
    if (layers.buildings) {
      for (const b of BUILDINGS) {
        const st = progress?.[b.id];
        const built = st ? st.built : b.floors, full = b.floors * FLOOR, z = Math.max(built * FLOOR, st ? 2 : 0);
        const color = (b.cls.includes("res") ? "res" : b.cls.includes("ret") ? "ret" : b.cls.includes("hot") ? "hot" : "ame") as keyof Pal;
        push({ id: b.id, r: { x: b.x, y: b.y, w: b.w, h: b.h }, z0: 0, z, full, active: st?.active, color, label: b.name, sub: st ? `${built} / ${b.floors} levels cast` : `${b.floors} levels`, kind: "box" });
        if (b.cls.includes("res")) push({ id: b.id, r: { x: b.x + b.w / 2 - 25, y: b.y + b.h / 2 - 28, w: 50, h: 56 }, z0: z, z: Math.min(full, z + (st?.active ? 2 : 1) * FLOOR), color: "core", kind: "box" });
      }
      for (const v of VILLAS) {
        const st = progress?.[v.id];
        push({ id: v.id, r: v, z0: 0, z: st ? Math.max(st.built * FLOOR, st.active ? 3 : 1) : 2 * FLOOR, full: 2 * FLOOR, active: st?.active, color: "villa", kind: "box" });
      }
      for (const s of SHAPES) {
        if (s.t !== "rect" || !s.cls.startsWith("bld ") || s.cls.includes("villa") || s.cls.includes("res") || s.cls.includes("ret") || s.cls.includes("hot") || s.cls.includes("ame")) continue;
        push({ id: s.loc, r: { x: s.x!, y: s.y!, w: s.w!, h: s.h! }, z0: 0, z: SVC_H[s.loc ?? ""] ?? 12, color: s.cls.includes("civic") ? "civic" : "util", kind: "box" });
        if (s.loc === "mosque") push({ id: s.loc, r: { x: s.x! + s.w! - 14, y: s.y! + 4, w: 9, h: 9 }, z0: 0, z: 74, color: "civic", kind: "box" });
      }
    }
    if (layers.temp) {
      for (const s of SHAPES) {
        if (s.layer !== "temp") continue;
        if (s.t === "rect" && /tmp (office|batch|waste)|cabin|guard/.test(s.cls)) {
          const z = s.cls.includes("batch") ? 11 : s.cls.includes("waste") ? 3 : s.cls.includes("cabin") ? 7 : s.cls.includes("guard") ? 7 : 8;
          const color = (s.cls.includes("batch") ? "batch" : s.cls.includes("waste") ? "waste" : s.cls.includes("cabin") ? "cabin" : s.cls.includes("guard") ? "util" : "office") as keyof Pal;
          push({ id: s.loc, r: { x: s.x!, y: s.y!, w: s.w!, h: s.h! }, z0: 0, z, color, kind: "box" });
        }
        if (s.t === "circle" && s.cls === "silo") push({ r: { x: s.cx! - s.r!, y: s.cy! - s.r!, w: s.r! * 2, h: s.r! * 2 }, z0: 0, z: 28, color: "silo", kind: "box" });
      }
    }
    if (layers.cranes) {
      for (const s of SHAPES) {
        if (s.layer !== "cranes" || s.t !== "rect" || !s.cls.includes("hoist")) continue;
        const tower = s.loc === "hoist-a" ? "tower-a" : "tower-b", st = progress?.[tower];
        push({ id: s.loc, r: { x: s.x!, y: s.y!, w: s.w!, h: s.h! }, z0: 0, z: (st ? st.built : 10) * FLOOR + 6, color: "hoist", kind: "hoist" });
      }
    }
    return out.sort((a, b) => a.depth - b.depth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, layers.buildings, layers.temp, layers.cranes, rot]);
  const topOf = useMemo(() => { const m: Record<string, number> = {}; for (const b of blocks) if (b.id) m[b.id] = Math.max(m[b.id] ?? 0, b.z); return m; }, [blocks]);

  useImperativeHandle(handle, () => ({
    focus: (x, y, zoom = 3) => { const [rx, ry] = R(x, y); const [X, Y] = P(rx, ry, (topOf[""] ?? 0)); pz.flyTo(X, Y - 40, zoom, 0.42); },
    fit: pz.fit, zoomBy: pz.zoomBy, rotate: () => setRot((r) => (r + 1) % 4),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [pz, rot, topOf]);

  const sw = (px: number) => Math.max(px / k, 0.4);
  const fs = (px: number) => Math.min(Math.max(px / k, 2), 60);
  const sel = selectedId;
  const flats = SHAPES.filter((s) => s.layer === "base" || layers[s.layer]);

  // Ground drawing helpers
  const poly = (ps: [number, number][]) => pts(...ps.map(([x, y]) => P(...R(x, y))));
  const rectPoly = (s: { x?: number; y?: number; w?: number; h?: number }) => poly([[s.x!, s.y!], [s.x! + s.w!, s.y!], [s.x! + s.w!, s.y! + s.h!], [s.x!, s.y! + s.h!]]);
  const ell = (cx: number, cy: number, r: number) => { const [X, Y] = P(...R(cx, cy)); return { cx: X, cy: Y, rx: r * Math.SQRT2 * COS, ry: r * Math.SQRT2 * SIN }; };

  return (
    <div ref={pz.ref} className="viewport" aria-label="3D site model">
      <svg width={pz.size.w} height={pz.size.h} className="plan iso" role="img">
        <g transform={`translate(${view.x} ${view.y}) scale(${k})`}>
          <rect x={-3000} y={-3000} width={CW + 6000} height={CH + 6000} fill={pal.ground} />
          <g key={`g${rot}`} className="iso-ground">
            {flats.map((s, i) => {
              const key = `${s.layer}${i}`;
              if (s.t === "poly" && s.cls === "plot") return <polygon key={key} points={poly(s.pts!)} fill={pal.plot} stroke={pal.fence} strokeWidth={sw(1.5)} />;
              if (s.t === "poly" && s.cls === "fence") return <polygon key={key} points={poly(s.pts!)} fill="none" stroke={pal.ink2} strokeWidth={sw(1)} strokeDasharray={`${6 / k} ${4 / k}`} />;
              if (s.t === "rect" && s.cls.startsWith("zone")) return <polygon key={key} points={rectPoly(s)} data-loc={s.loc} fill={s.cls.includes("z1") ? pal.zone1 : s.cls.includes("z2") ? pal.zone2 : pal.zone3} stroke={s.cls.includes("z1") ? pal.zl1 : s.cls.includes("z2") ? pal.zl2 : pal.zl3} strokeWidth={sw(1)} strokeDasharray={`${10 / k} ${5 / k}`} />;
              if (s.t === "rect" && s.cls === "public-road") return <polygon key={key} points={rectPoly(s)} fill={pal.roadPub} />;
              if (s.t === "rect" && s.cls === "road") return <polygon key={key} points={rectPoly(s)} data-loc={s.loc} fill={pal.road} />;
              if (s.t === "line" && s.cls === "cl") return <polyline key={key} points={poly(s.pts!)} fill="none" stroke={pal.cl} strokeWidth={sw(1.2)} strokeDasharray={`${8 / k} ${6 / k}`} />;
              if (s.t === "rect" && s.cls === "basement") return <polygon key={key} points={rectPoly(s)} data-loc={s.loc} fill="none" stroke={pal.basement} strokeWidth={sw(1.6)} strokeDasharray={`${12 / k} ${6 / k}`} />;
              if (s.t === "poly" && s.cls === "ramp") return <polygon key={key} points={poly(s.pts!)} data-loc={s.loc} fill={pal.water} stroke={pal.basement} strokeWidth={sw(1)} />;
              if (s.t === "rect" && (s.cls === "pool" || s.cls === "wash")) return <polygon key={key} points={rectPoly(s)} data-loc={s.loc} fill={pal.water} stroke={pal.basement} strokeWidth={sw(0.6)} />;
              if (s.t === "rect" && s.cls === "garden") return <polygon key={key} points={rectPoly(s)} fill={pal.garden} />;
              if (s.t === "rect" && (s.cls.includes("tmp yard") || s.cls.includes("tmp camp"))) return <polygon key={key} points={rectPoly(s)} data-loc={s.loc} fill={s.cls.includes("camp") ? pal.camp : pal.yard} stroke={pal.ink2} strokeWidth={sw(1)} strokeDasharray={s.cls.includes("yard") ? `${5 / k} ${3 / k}` : undefined} />;
              if (s.t === "rect" && s.cls === "bay") return <polygon key={key} points={rectPoly(s)} fill={pal.util} stroke={pal.fence} strokeWidth={sw(0.4)} />;
              if (s.t === "rect" && s.cls === "gate") return <polygon key={key} points={rectPoly(s)} data-loc={s.loc} fill={pal.gate} />;
              if (s.t === "circle" && s.cls === "crane-r") { const e = ell(s.cx!, s.cy!, s.r!); return <ellipse key={key} {...e} fill="rgba(241,90,34,.05)" stroke={pal.mast} strokeWidth={sw(1)} strokeDasharray={`${8 / k} ${5 / k}`} />; }
              if (s.t === "circle" && s.cls === "hse-pt") { const e = ell(s.cx!, s.cy!, s.r!); return <ellipse key={key} {...e} data-loc={s.loc} fill={pal.hse} stroke={pal.halo} strokeWidth={sw(1.5)} />; }
              if (s.t === "line" && s.layer === "utilities") return <polyline key={key} points={poly(s.pts!)} fill="none" className={s.cls} strokeWidth={sw(2)} />;
              if (s.t === "line" && s.layer === "grid") return <polyline key={key} points={poly(s.pts!)} fill="none" className="gridline" strokeWidth={sw(0.6)} />;
              if (s.t === "text" && s.cls === "lbl-zone" && k > 0.3) { const [X, Y] = P(...R(s.x!, s.y!)); return <text key={key} x={X} y={Y} className={s.cls} textAnchor="middle" style={{ fontSize: fs(11), strokeWidth: sw(3) }}>{s.text}</text>; }
              return null;
            })}
          </g>

          {/* trees */}
          {layers.landscape && SHAPES.filter((s) => s.t === "circle" && s.cls === "tree").map((s, i) => { const [X, Y] = P(...R(s.cx!, s.cy!)); return <g key={`t${i}`}><line x1={X} y1={Y} x2={X} y2={Y - 9} stroke={pal.trunk} strokeWidth={sw(1.2)} /><circle cx={X} cy={Y - 11} r={5.5} fill={pal.tree} stroke={shade(pal.tree, 0.7)} strokeWidth={sw(0.6)} /></g>; })}

          {/* blocks: far to near */}
          <g key={`b${rot}`}>
            {blocks.map((b, i) => {
              const c = pal[b.color] as string;
              const f = faces(b.r, b.z0, b.z);
              const isSel = !!b.id && b.id === sel;
              const delay = `${Math.min(1100, 80 + (i / blocks.length) * 900)}ms`;
              return (
                <g key={i} data-loc={b.id} className={"blk" + (isSel ? " sel3d" : "")}>
                  {b.z > 40 && <polygon points={pts(P(b.r.x, b.r.y + b.r.h), P(b.r.x + b.r.w, b.r.y + b.r.h), P(b.r.x + b.r.w + b.z * 0.35, b.r.y + b.r.h + b.z * 0.12), P(b.r.x + b.z * 0.35, b.r.y + b.r.h + b.z * 0.12))} fill={pal.shadow} />}
                  <g className="rise" style={{ animationDelay: delay }}>
                    <polygon points={f.left} fill={shade(c, 0.86)} />
                    <polygon points={f.right} fill={shade(c, 0.68)} />
                    <polygon points={f.top} fill={shade(c, 1.12)} stroke={isSel ? "#f15a22" : shade(c, 0.6)} strokeWidth={sw(isSel ? 2.5 : 0.5)} />
                    {b.kind === "hoist" && (
                      <g><animateTransform attributeName="transform" type="translate" values={`0 0; 0 ${-(b.z - 8)}; 0 0`} dur="14s" repeatCount="indefinite" />
                        <polygon points={faces({ x: b.r.x - 2, y: b.r.y - 2, w: b.r.w + 4, h: b.r.h + 4 }, 0, 7).right} fill={shade(c, 0.5)} />
                        <polygon points={faces({ x: b.r.x - 2, y: b.r.y - 2, w: b.r.w + 4, h: b.r.h + 4 }, 0, 7).left} fill={shade(c, 0.7)} />
                        <polygon points={faces({ x: b.r.x - 2, y: b.r.y - 2, w: b.r.w + 4, h: b.r.h + 4 }, 0, 7).top} fill={shade(c, 1.2)} /></g>
                    )}
                  </g>
                  {b.full != null && b.full > b.z + 1 && (() => { const g = faces(b.r, b.z, b.full); return (
                    <g className="ghost" style={{ animationDelay: delay }}>
                      <polygon points={g.left} fill={pal.ghost} fillOpacity={0.05} stroke={pal.ghost} strokeOpacity={0.45} strokeWidth={sw(0.8)} strokeDasharray={`${5 / k} ${4 / k}`} />
                      <polygon points={g.right} fill={pal.ghost} fillOpacity={0.08} stroke={pal.ghost} strokeOpacity={0.45} strokeWidth={sw(0.8)} strokeDasharray={`${5 / k} ${4 / k}`} />
                      <polygon points={g.top} fill="none" stroke={pal.ghost} strokeOpacity={0.5} strokeWidth={sw(0.8)} strokeDasharray={`${5 / k} ${4 / k}`} />
                    </g>); })()}
                  {b.active && <polygon className="live" points={f.top} fill="rgba(241,90,34,.35)" stroke="#f15a22" strokeWidth={sw(2)} />}
                  {b.label && k > 0.33 && <g className="lbl3" style={{ animationDelay: delay }}>
                    <text x={P(b.r.x + b.r.w / 2, b.r.y + b.r.h / 2, b.z)[0]} y={P(b.r.x + b.r.w / 2, b.r.y + b.r.h / 2, b.z)[1] - 22 / k} textAnchor="middle" className="lbl-b" style={{ fontSize: fs(13), strokeWidth: sw(3) }}>{b.label.toUpperCase()}</text>
                    {b.sub && k > 0.28 && <text x={P(b.r.x + b.r.w / 2, b.r.y + b.r.h / 2, b.z)[0]} y={P(b.r.x + b.r.w / 2, b.r.y + b.r.h / 2, b.z)[1] - 9 / k} textAnchor="middle" className="lbl-s" style={{ fontSize: fs(9), strokeWidth: sw(3) }}>{b.sub}</text>}
                  </g>}
                </g>
              );
            })}
          </g>

          {/* tower cranes: mast + slewing jib (the jib is drawn in plan space inside the projection matrix, so it slews in perspective) */}
          {layers.cranes && SHAPES.filter((s) => s.layer === "cranes" && s.t === "circle" && s.cls === "crane" && s.loc).map((s) => {
            const radius = SHAPES.find((q) => q.cls === "crane-r" && q.cx === s.cx && q.cy === s.cy)?.r ?? 100;
            const tower = progress?.[CRANE_TOWER[s.loc!]];
            const top = (tower ? tower.built : 12) * FLOOR + 56;
            const [cx, cy] = R(s.cx!, s.cy!);
            const mast = faces({ x: cx - 5, y: cy - 5, w: 10, h: 10 }, 0, top);
            const isSel = s.loc === sel;
            return (
              <g key={s.loc} data-loc={s.loc} className={"crane3" + (isSel ? " sel3d" : "")}>
                <polygon points={mast.left} fill={shade(pal.mast, 0.85)} /><polygon points={mast.right} fill={shade(pal.mast, 0.65)} /><polygon points={mast.top} fill={shade(pal.mast, 1.1)} stroke={isSel ? "#fff" : "none"} strokeWidth={sw(2)} />
                <g transform={`matrix(${COS} ${SIN} ${-COS} ${SIN} ${ox} ${oy - top})`}>
                  <g>
                    <animateTransform attributeName="transform" type="rotate" from={`${(s.loc!.charCodeAt(2) * 37) % 360} ${cx} ${cy}`} to={`${(s.loc!.charCodeAt(2) * 37) % 360 + 360} ${cx} ${cy}`} dur="52s" repeatCount="indefinite" />
                    <line x1={cx - radius * 0.28} y1={cy} x2={cx + radius} y2={cy} stroke={pal.jib} strokeWidth={sw(3)} strokeLinecap="round" />
                    <rect x={cx - radius * 0.28 - 6} y={cy - 4} width={12} height={8} fill={shade(pal.jib, 0.7)} />
                    <circle cx={cx + radius * 0.62} cy={cy} r={3.5} fill={pal.halo} stroke={pal.jib} strokeWidth={sw(1.2)} />
                  </g>
                </g>
                <text x={P(cx, cy, top)[0]} y={P(cx, cy, top)[1] - 12 / k} textAnchor="middle" className="lbl-c" style={{ fontSize: fs(11), strokeWidth: sw(3) }}>{s.loc!.toUpperCase()}</text>
              </g>
            );
          })}

          {/* document / issue pins float above what they belong to */}
          {pins.map((p) => {
            const [rx, ry] = R(p.x, p.y);
            const [X, Y] = P(rx, ry, (topOf[p.loc] ?? 0) + 6);
            const r = Math.min(0.62 / k, 2.2);
            return (
              <g key={`${p.x},${p.y}`} transform={`translate(${X} ${Y}) scale(${r})`} data-pin={p.loc} className="pin">
                <g className={"pindrop" + (p.loc === sel ? " pinsel" : "")}>
                  <path d="M0,0 C-4,-8 -13,-13 -13,-22 A13,13 0 1 1 13,-22 C13,-13 4,-8 0,0Z" className={p.issues ? "pinbody warn" : "pinbody"} data-pin={p.loc} />
                  <text y={-18} textAnchor="middle" className="pintxt" data-pin={p.loc}>{p.docs || "!"}</text>
                  {p.issues > 0 && <g data-pin={p.loc}><circle cx={12} cy={-34} r={8} className="pinflag" /><text x={12} y={-31} textAnchor="middle" className="pinflagtxt">{p.issues}</text></g>}
                </g>
              </g>
            );
          })}

          {gps && (() => { const [X, Y] = P(...R(gps.x, gps.y)); const e = ell(gps.x, gps.y, Math.max(gps.acc, 6)); return (
            <g><ellipse {...e} className="gpsacc" /><g transform={`translate(${X} ${Y}) scale(${1 / k})`}><circle r={9} className="gps" /></g></g>); })()}
        </g>
      </svg>
    </div>
  );
});
export default Site3D;
