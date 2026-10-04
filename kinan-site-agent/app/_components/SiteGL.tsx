"use client";
/**
 * Real-time 3D site (WebGL, three.js) with a 4D timeline: drag the slider or press play to watch Kinan Heights rise
 * from the schedule, from notice to proceed to practical completion. Touch-first: one finger moves, two fingers turn,
 * tilt and zoom; tap a building, yard or crane to open it. Labels and document pins are HTML laid over the canvas
 * so they stay crisp and tappable. Day or night follows the app theme. Falls back to the SVG model without WebGL.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { BUILDINGS, PLAN, type Layer } from "@/lib/siteplan";
import { indexSchedule, siteAt, type SiteState } from "@/lib/scene/progress4d";
import type { ProjectData } from "@/lib/types";
import { createSiteScene, type SiteSceneApi } from "./gl/scene";
import { M } from "./gl/textures";
import Site3D, { type Pin, type Site3DHandle } from "./Site3D";

interface Props {
  layers: Record<Layer, boolean>;
  selectedId?: string;
  pins: Pin[];
  gps: { x: number; y: number; acc: number } | null;
  onSelect: (id: string) => void;
}

const DAY = 86400000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const nice = (s: string) => new Date(s + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const LABELS: Record<string, string> = { "tower-a": "Tower A", "tower-b": "Tower B", podium: "Podium & Retail", "hotel-c": "Hotel C", "club-e": "Amenity Club" };
const FLOORS: Record<string, number> = Object.fromEntries(BUILDINGS.map((b) => [b.id, b.floors]));

let projectP: Promise<ProjectData | null> | null = null;
const loadProject = () => (projectP ??= fetch("/api/project", { cache: "no-store" }).then((r) => r.json()).catch(() => null));

function useDark() {
  const read = () => { const t = document.documentElement.dataset.theme; return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; };
  const [dark, setDark] = useState(() => (typeof document === "undefined" ? false : read()));
  useEffect(() => {
    const mo = new MutationObserver(() => setDark(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = matchMedia("(prefers-color-scheme: dark)"); const f = () => setDark(read()); mq.addEventListener("change", f);
    return () => { mo.disconnect(); mq.removeEventListener("change", f); };
  }, []);
  return dark;
}
const webglOk = () => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } };
const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const SiteGL = forwardRef<Site3DHandle, Props>(function SiteGL({ layers, selectedId, pins, gps, onSelect }, handle) {
  const [supported] = useState(webglOk);
  const [failed, setFailed] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const night = useDark();
  const [project, setProject] = useState<ProjectData | null>(null);
  useEffect(() => { loadProject().then(setProject); }, []);
  const ix = useMemo(() => (project ? indexSchedule(project.schedule) : null), [project]);
  const today = project?.meta.dataDate ?? "2026-10-01";
  const t0 = Date.parse((project?.meta.startDate ?? "2025-03-01") + "T00:00:00Z") - 30 * DAY;
  const t1 = Date.parse((project?.meta.completionDate ?? "2028-06-30") + "T00:00:00Z") + 31 * DAY;
  const [date, setDate] = useState<string | null>(null);
  const cur = date ?? today;
  const [playing, setPlaying] = useState(false);
  const [hint, setHint] = useState(false);
  const coarse = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  const site = useMemo<SiteState | null>(() => (ix ? siteAt(ix, cur) : null), [ix, cur]);

  // three.js objects live in refs; React only renders the HUD.
  const R = useRef<{ renderer: THREE.WebGLRenderer; camera: THREE.PerspectiveCamera; controls: OrbitControls; api: SiteSceneApi; fly?: { from: [THREE.Vector3, THREE.Vector3]; to: [THREE.Vector3, THREE.Vector3]; t: number; d: number } } | null>(null);
  const anchors = useRef<Map<string, number>>(new Map());
  const playRef = useRef({ playing: false, ms: 0 });
  const onSelectRef = useRef(onSelect); onSelectRef.current = onSelect;

  // ---------------------------------------------------------------- init
  useEffect(() => {
    if (!supported || !canvasRef.current || !wrap.current) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: false, stencil: false });
      // Phones that only give a 16-bit depth buffer z-fight on a 1 km site; a logarithmic depth buffer cures that.
      const gl = renderer.getContext();
      if ((gl.getParameter(gl.DEPTH_BITS) as number) < 24) {
        renderer.dispose();
        renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: false, stencil: false, logarithmicDepthBuffer: true });
      }
    } catch { setFailed(true); return; }
    const small = Math.min(window.innerWidth, window.innerHeight) < 600;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.6 : 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const camera = new THREE.PerspectiveCamera(42, 1, 8, 4000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.09;
    controls.maxPolarAngle = 1.42; controls.minPolarAngle = 0.12;
    controls.minDistance = 36; controls.maxDistance = 1400;
    controls.minPolarAngle = 0.2;
    controls.screenSpacePanning = false;
    controls.zoomToCursor = true;
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    const api = createSiteScene(renderer, { textureSize: small ? 2048 : 4096, night, layers });
    R.current = { renderer, camera, controls, api };
    // opening view: Phase 1 from the south-east, framed for the screen's shape
    const resize = () => {
      const w = wrap.current!.clientWidth, h = wrap.current!.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    resize();
    const portrait = camera.aspect < 1;
    controls.target.set(250, 30, 185);
    camera.position.set(250 + (portrait ? 260 : 200), portrait ? 330 : 250, 185 + (portrait ? 400 : 300));
    controls.update();
    const ro = new ResizeObserver(resize); ro.observe(wrap.current);
    try { if (!localStorage.getItem("kinan.3dhint")) { setHint(true); localStorage.setItem("kinan.3dhint", "1"); } } catch { /* blocked */ }

    // keep the camera over the site
    controls.addEventListener("change", () => {
      const t = controls.target;
      const cx = Math.min(Math.max(t.x, -100), PLAN.w * M + 100), cz = Math.min(Math.max(t.z, -100), PLAN.h * M + 100), cy = Math.min(Math.max(t.y, 0), 120);
      if (cx !== t.x || cz !== t.z || cy !== t.y) { const dlt = new THREE.Vector3(cx - t.x, cy - t.y, cz - t.z); t.add(dlt); camera.position.add(dlt); }
    });

    // tap to select
    let down: { x: number; y: number; t: number } | null = null;
    const el = renderer.domElement;
    const pd = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; setHint(false); };
    const pu = (e: PointerEvent) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
      if (moved > 8 || dt > 450) return;
      const r = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(api.pickables(), false).find((h) => h.object.userData.loc);
      if (hit) onSelectRef.current(hit.object.userData.loc);
    };
    el.addEventListener("pointerdown", pd); el.addEventListener("pointerup", pu);

    // render loop
    let raf = 0, last = performance.now(), frames = 0, slow = 0, degraded = false, touched = performance.now(), odd = false, fc = 0;
    const poke = () => { touched = performance.now(); };
    controls.addEventListener("change", poke); el.addEventListener("pointermove", poke);
    const v = new THREE.Vector3();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      const hidden = document.hidden || !wrap.current || wrap.current.offsetParent === null || !!wrap.current.closest(".pane.off");
      if (hidden) return;
      // battery: halve the frame rate when nothing is being touched, played or flown
      if (now - touched > 3000 && !playRef.current.playing && !R.current?.fly && now - last < 31) return;
      last = now;
      // timeline playback: ~25 s for the whole programme
      const P = playRef.current;
      if (P.playing) {
        P.ms += dt * ((t1 - t0) / 25);
        if (P.ms >= t1) { P.ms = t1; P.playing = false; setPlaying(false); }
        const d = iso(P.ms);
        setDate((x) => (x === d ? x : d));
      }
      // camera fly-to
      const F = R.current?.fly;
      if (F) {
        F.t = Math.min(1, F.t + dt / F.d); const e = 1 - Math.pow(1 - F.t, 3);
        controls.target.lerpVectors(F.from[0], F.to[0], e); camera.position.lerpVectors(F.from[1], F.to[1], e);
        if (F.t >= 1) R.current!.fly = undefined;
      }
      controls.update();
      // Depth precision: keep the near plane as far out as the view allows (the biggest z-fighting fix).
      const camDist0 = camera.position.distanceTo(controls.target);
      const near = Math.max(2, Math.min(24, camDist0 * 0.03)), far = Math.max(2600, camDist0 * 6);
      if (Math.abs(camera.near - near) > 0.2 || Math.abs(camera.far - far) > 50) { camera.near = near; camera.far = far; camera.updateProjectionMatrix(); }
      api.tick(dt, now / 1000, !reducedMotion());
      renderer.render(api.scene, camera);
      if (++fc === 3 || fc % 30 === 0) el.dataset.calls = String(renderer.info.render.calls);
      // HUD: project anchors to the screen
      const ov = overlay.current;
      if (ov) {
        const w = el.clientWidth, h = el.clientHeight, camDist = camera.position.distanceTo(controls.target);
        for (const node of Array.from(ov.children) as HTMLElement[]) {
          const x = Number(node.dataset.x), z = Number(node.dataset.z), loc = node.dataset.loc ?? "";
          const y = node.dataset.ground ? 0.5 : (anchors.current.get(loc) ?? 0) + (node.dataset.pin ? 3 : 10);
          v.set(x, y, z).project(camera);
          const off = v.z > 1 || v.x < -1.2 || v.x > 1.2 || v.y < -1.2 || v.y > 1.2;
          // hysteresis on the distance thresholds so labels never flip while the camera settles
          const wasFar = node.dataset.far === "1", far = !!node.dataset.label && (wasFar ? camDist > 1000 : camDist > 1150);
          node.dataset.far = far ? "1" : "";
          if (off || far) { node.style.visibility = "hidden"; continue; }
          node.style.visibility = "visible";
          node.style.transform = `translate3d(${Math.round(((v.x + 1) / 2) * w)}px, ${Math.round(((1 - v.y) / 2) * h)}px, 0)`;
          const wasCompact = node.dataset.compact === "1";
          node.dataset.compact = (wasCompact ? camDist > 600 : camDist > 700) ? "1" : "";
        }
      }
      // adaptive quality: drop resolution and shadow detail on slow devices
      if (!degraded && frames < 120) {
        frames++; if (dt > 0.045) slow++;
        if (frames === 120 && slow > 50) {
          degraded = true; renderer.setPixelRatio(1);
          api.sun.shadow.mapSize.set(1024, 1024); api.sun.shadow.map?.dispose(); api.sun.shadow.map = null as never;
        }
      }
    };
    raf = requestAnimationFrame(loop);
    const ctxLost = (e: Event) => { e.preventDefault(); setFailed(true); };
    el.addEventListener("webglcontextlost", ctxLost);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      controls.removeEventListener("change", poke); el.removeEventListener("pointermove", poke);
      el.removeEventListener("pointerdown", pd); el.removeEventListener("pointerup", pu); el.removeEventListener("webglcontextlost", ctxLost);
      controls.dispose(); api.dispose(); renderer.dispose();
      R.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  // ---------------------------------------------------------------- state → scene
  const refreshAnchors = useCallback(() => {
    const api = R.current?.api; if (!api) return;
    const m = new Map<string, number>();
    for (const id of new Set([...Object.keys(LABELS), ...pins.map((p) => p.loc)])) m.set(id, api.heightOf(id) ?? 0);
    anchors.current = m;
  }, [pins]);
  useEffect(() => { const api = R.current?.api; if (!api || !site) return; api.setState(site); refreshAnchors(); }, [site, refreshAnchors]);
  useEffect(() => { R.current?.api.setNight(night); refreshAnchors(); }, [night, refreshAnchors]);
  useEffect(() => { R.current?.api.setLayers(layers); refreshAnchors(); }, [layers, refreshAnchors]);
  useEffect(() => { R.current?.api.setSelected(selectedId); }, [selectedId, site]);

  // ---------------------------------------------------------------- camera moves
  const flyTo = useCallback((target: THREE.Vector3, dist: number) => {
    const r = R.current; if (!r) return;
    const dir = r.camera.position.clone().sub(r.controls.target).normalize();
    if (dir.y < 0.35) { dir.y = 0.45; dir.normalize(); }
    r.fly = { from: [r.controls.target.clone(), r.camera.position.clone()], to: [target, target.clone().add(dir.multiplyScalar(dist))], t: 0, d: 0.9 };
  }, []);
  useImperativeHandle(handle, () => ({
    focus: (x, y, zoom = 3) => {
      const api = R.current?.api; if (!api) return;
      const loc = selectedId;
      const h = loc ? api.heightOf(loc) ?? 0 : 0;
      const narrow = window.innerWidth < 900;
      const dist = Math.max(110, Math.min(800, (560 / zoom + h * 0.9) * (narrow ? 1.35 : 1)));
      flyTo(new THREE.Vector3(x * M, Math.min(h * 0.45, 70) - (narrow ? dist * 0.3 : 0), y * M), dist);
    },
    fit: () => { const r = R.current; if (!r) return; const portrait = r.camera.aspect < 1; flyTo(new THREE.Vector3(400, 0, 250), portrait ? 900 : 620); },
    zoomBy: (f) => { const r = R.current; if (!r) return; const off = r.camera.position.clone().sub(r.controls.target).multiplyScalar(1 / f); flyTo(r.controls.target.clone(), Math.max(30, Math.min(1500, off.length()))); },
    rotate: () => {
      const r = R.current; if (!r) return;
      const off = r.camera.position.clone().sub(r.controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      r.fly = { from: [r.controls.target.clone(), r.camera.position.clone()], to: [r.controls.target.clone(), r.controls.target.clone().add(off)], t: 0, d: 0.9 };
    },
  }), [flyTo, selectedId]);

  // ---------------------------------------------------------------- timeline
  const togglePlay = () => {
    const P = playRef.current;
    if (P.playing) { P.playing = false; setPlaying(false); return; }
    const now = Date.parse(cur + "T00:00:00Z");
    P.ms = now >= t1 - DAY ? t0 : now; P.playing = true; setPlaying(true);
  };
  const scrub = (v: number) => { playRef.current.playing = false; setPlaying(false); setDate(iso(t0 + v * DAY)); };
  const backToToday = () => { playRef.current.playing = false; setPlaying(false); setDate(null); };
  const curMs = Date.parse(cur + "T00:00:00Z");
  const tense = cur === today ? "Today" : cur < today ? "As built" : "Forecast";
  const marks = useMemo(() => {
    if (!project) return [];
    const ids: [string, string][] = [["TB-M10", "Tower B tops out"], ["HC-M10", "Hotel C tops out"], ["TA-M10", "Tower A tops out"], ["M-990", "Completion"]];
    return ids.map(([id, label]) => { const a = project.schedule.find((x) => x.id === id); return a ? { label, at: (Date.parse(a.finish + "T00:00:00Z") - t0) / (t1 - t0) } : null; }).filter(Boolean) as { label: string; at: number }[];
  }, [project, t0, t1]);
  const todayAt = (Date.parse(today + "T00:00:00Z") - t0) / (t1 - t0);

  if (!supported || failed) return <Site3D ref={handle} layers={layers} selectedId={selectedId} pins={pins} gps={gps} onSelect={onSelect} />;

  const status = (id: string) => {
    const s = site?.struct[id]; if (!s) return "";
    const f = FLOORS[id] ?? 0;
    if (s.built === 0) return s.active > 0 ? "first deck going in" : cur < today ? "not started" : "foundations";
    if (s.topped && s.glazed >= f - 0.01) return s.fitted >= f ? "complete" : `fit-out ${s.fitted}/${f}`;
    return `${s.built}/${f} levels${s.glazed >= 1 ? ` · ${Math.floor(s.glazed)} clad` : ""}`;
  };

  return (
    <div ref={wrap} className={"gl" + (night ? " night" : "")}>
      <canvas ref={canvasRef} className="gl-canvas" aria-label="3D model of the site" />
      <div ref={overlay} className="gl-hud" aria-hidden={false}>
        {Object.keys(LABELS).filter(() => layers.buildings).map((id) => {
          const b = BUILDINGS.find((x) => x.id === id)!;
          return (
            <button key={id} className={"gl-label" + (selectedId === id ? " on" : "")} data-label="1" data-loc={id} data-x={(b.x + b.w / 2) * M} data-z={(b.y + b.h / 2) * M} onClick={() => onSelect(id)}>
              <b>{LABELS[id]}</b><em>{status(id)}</em>
            </button>
          );
        })}
        {pins.map((p) => (
          <button key={`${p.x},${p.y}`} className={"gl-pin" + (p.issues ? " warn" : "") + (p.loc === selectedId ? " on" : "")} data-pin="1" data-loc={p.loc} data-x={p.x * M} data-z={p.y * M} onClick={() => onSelect(p.loc)} aria-label={`${p.docs} documents${p.issues ? `, ${p.issues} open issues` : ""}`}>
            <svg viewBox="-15 -38 30 40" aria-hidden="true"><path d="M0,0 C-4,-8 -13,-13 -13,-22 A13,13 0 1 1 13,-22 C13,-13 4,-8 0,0Z" /><text y={-18} textAnchor="middle">{p.docs || "!"}</text></svg>
            {p.issues > 0 && <i>{p.issues}</i>}
          </button>
        ))}
        {gps && <span className="gl-gps" data-ground="1" data-loc="gps" data-x={gps.x * M} data-z={gps.y * M} />}
      </div>
      {hint && <div className="gl-hint" onClick={() => setHint(false)}><span>{coarse ? "One finger to move · two fingers to turn, tilt and zoom · tap a building" : "Drag to turn · right-drag to move · scroll to zoom · click a building"}</span></div>}
      <div className={"tl4d" + (cur !== today ? " away" : "")}>
        <button className="tl4d-play" onClick={togglePlay} aria-label={playing ? "Pause the timeline" : "Play construction from the start"}>
          {playing ? <svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg> : <svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z" /></svg>}
        </button>
        <div className="tl4d-mid">
          <div className="tl4d-date"><b>{nice(cur)}</b><em>{tense}</em></div>
          <div className="tl4d-track">
            <input type="range" min={0} max={Math.round((t1 - t0) / DAY)} value={Math.round((curMs - t0) / DAY)} onChange={(e) => scrub(Number(e.target.value))} aria-label="Construction date" />
            <i className="tl4d-today" style={{ left: `${todayAt * 100}%` }} title="Data date" />
            {marks.map((mk) => <i key={mk.label} className="tl4d-mark" style={{ left: `${mk.at * 100}%` }} title={mk.label} />)}
          </div>
        </div>
        {cur !== today && <button className="tl4d-today-btn" onClick={backToToday}>Today</button>}
      </div>
    </div>
  );
});
export default SiteGL;
