"use client";
/**
 * 3D/4D viewer for a generated project (a ProjectModelSpec read out of uploaded documents). Same feel as the site
 * view: one finger turns and tilts, two fingers twist, pinch and move; tap a building; the timeline plays the
 * programme from the first activity to the last, starting at the documents' data date.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { BuildingState, ProjectModelSpec } from "@/lib/model3d/spec";
import { createSpecScene, MARGIN, type SpecSceneApi } from "./gl/specScene";
import { attachGestures } from "./gl/gestures";

const DAY = 86400000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const nice = (s: string) => new Date(s + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
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

export default function ModelViewer({ spec, selectedId, onSelect }: { spec: ProjectModelSpec; selectedId?: string; onSelect: (id?: string) => void }) {
  const wrap = useRef<HTMLDivElement>(null), canvasRef = useRef<HTMLCanvasElement>(null), overlay = useRef<HTMLDivElement>(null);
  const night = useDark();
  const [failed, setFailed] = useState(false);
  const today = spec.schedule.dataDate;
  const t0 = Date.parse(spec.schedule.start + "T00:00:00Z") - 30 * DAY, t1 = Date.parse(spec.schedule.finish + "T00:00:00Z") + 30 * DAY;
  const [date, setDate] = useState<string | null>(null);
  const cur = date ?? today;
  const [playing, setPlaying] = useState(false);
  const [states, setStates] = useState<Record<string, BuildingState>>({});
  const R = useRef<{ renderer: THREE.WebGLRenderer; camera: THREE.PerspectiveCamera; controls: OrbitControls; api: SpecSceneApi } | null>(null);
  const playRef = useRef({ playing: false, ms: 0 });
  const anchors = useRef<Map<string, number>>(new Map());
  const onSelectRef = useRef(onSelect); onSelectRef.current = onSelect;

  useEffect(() => {
    if (!canvasRef.current || !wrap.current) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true, powerPreference: "high-performance", stencil: false });
      const gl = renderer.getContext();
      if ((gl.getParameter(gl.DEPTH_BITS) as number) < 24) { renderer.dispose(); renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true, stencil: false, logarithmicDepthBuffer: true }); }
    } catch { setFailed(true); return; }
    const small = Math.min(window.innerWidth, window.innerHeight) < 600;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.6 : 1.75));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    const api = createSpecScene(renderer, spec, { textureSize: small ? 2048 : 4096, night });
    const ext = api.extent, c = api.center;
    const camera = new THREE.PerspectiveCamera(42, 1, 4, 6000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.09;
    controls.minPolarAngle = 0.2; controls.maxPolarAngle = 1.42;
    controls.minDistance = 25; controls.maxDistance = ext * 4 + 400;
    controls.screenSpacePanning = false; controls.zoomToCursor = true; controls.rotateSpeed = 0.7;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    R.current = { renderer, camera, controls, api };
    const resize = () => { const w = wrap.current!.clientWidth, h = wrap.current!.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    resize();
    const portrait = camera.aspect < 1, d = ext * (portrait ? 1.6 : 1.15);
    controls.target.set(c.x, 10, c.z);
    camera.position.set(c.x + d * 0.5, d * 0.62, c.z + d * 0.78); controls.update();
    const ro = new ResizeObserver(resize); ro.observe(wrap.current);
    const bounds = { minX: -MARGIN, maxX: c.x * 2 + MARGIN, minZ: -MARGIN, maxZ: c.z * 2 + MARGIN };
    controls.addEventListener("change", () => {
      const t = controls.target, x = Math.min(Math.max(t.x, bounds.minX), bounds.maxX), z = Math.min(Math.max(t.z, bounds.minZ), bounds.maxZ), y = Math.min(Math.max(t.y, 0), 150);
      if (x !== t.x || y !== t.y || z !== t.z) { const dl = new THREE.Vector3(x - t.x, y - t.y, z - t.z); t.add(dl); camera.position.add(dl); }
    });
    let touched = performance.now(); const poke = () => { touched = performance.now(); };
    const el = renderer.domElement;
    const pickAt = (x: number, y: number) => {
      const r = el.getBoundingClientRect(), ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObjects(api.pickables(), false).find((h) => h.object.userData.loc);
      onSelectRef.current(hit?.object.userData.loc);
    };
    let down: { x: number; y: number; t: number } | null = null;
    const pd = (e: PointerEvent) => { if (e.pointerType !== "touch") down = { x: e.clientX, y: e.clientY, t: e.timeStamp }; };
    const pu = (e: PointerEvent) => { if (!down) return; const ok = Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8 && e.timeStamp - down.t < 500; down = null; if (ok) pickAt(e.clientX, e.clientY); };
    el.addEventListener("pointerdown", pd); el.addEventListener("pointerup", pu);
    const detach = attachGestures({ wrapEl: wrap.current, el, camera, controls, bounds, onTap: pickAt, poke, hudSelector: ".gl-hud" });
    controls.addEventListener("change", poke); el.addEventListener("pointermove", poke);
    let raf = 0, last = performance.now(), fc = 0;
    const v = new THREE.Vector3();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      if (document.hidden || !wrap.current || wrap.current.offsetParent === null || wrap.current.closest(".pane.off")) return;
      if (now - touched > 3000 && !playRef.current.playing && now - last < 31) return;
      last = now;
      const P = playRef.current;
      if (P.playing) { P.ms += dt * ((t1 - t0) / 22); if (P.ms >= t1) { P.ms = t1; P.playing = false; setPlaying(false); } const dd = iso(P.ms); setDate((x) => (x === dd ? x : dd)); }
      controls.update();
      const dist = camera.position.distanceTo(controls.target), near = Math.max(1.5, Math.min(20, dist * 0.03)), far = Math.max(3000, dist * 6);
      if (Math.abs(camera.near - near) > 0.2 || Math.abs(camera.far - far) > 50) { camera.near = near; camera.far = far; camera.updateProjectionMatrix(); }
      api.tick(dt, now / 1000, !reducedMotion());
      renderer.render(api.scene, camera);
      if (++fc === 3 || fc % 30 === 0) el.dataset.calls = String(renderer.info.render.calls);
      const ov = overlay.current;
      if (ov) {
        const w = el.clientWidth, h = el.clientHeight;
        for (const node of Array.from(ov.children) as HTMLElement[]) {
          v.set(Number(node.dataset.x), (anchors.current.get(node.dataset.loc ?? "") ?? 0) + 6, Number(node.dataset.z)).project(camera);
          if (v.z > 1 || Math.abs(v.x) > 1.15 || Math.abs(v.y) > 1.15) { node.style.visibility = "hidden"; continue; }
          node.style.visibility = "visible";
          node.style.transform = `translate3d(${Math.round(((v.x + 1) / 2) * w)}px, ${Math.round(((1 - v.y) / 2) * h)}px, 0)`;
          node.dataset.compact = dist > ext * 1.6 ? "1" : "";
        }
      }
    };
    raf = requestAnimationFrame(loop);
    const lost = (e: Event) => { e.preventDefault(); setFailed(true); };
    el.addEventListener("webglcontextlost", lost);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); detach();
      el.removeEventListener("pointerdown", pd); el.removeEventListener("pointerup", pu); el.removeEventListener("pointermove", poke); el.removeEventListener("webglcontextlost", lost);
      controls.dispose(); api.dispose(); renderer.dispose(); R.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec]);

  useEffect(() => {
    const api = R.current?.api; if (!api) return;
    setStates({ ...api.setDate(cur) });
    const m = new Map<string, number>(); for (const b of spec.buildings) m.set(b.id, api.heightOf(b.id) ?? 0); anchors.current = m;
  }, [cur, spec]);
  useEffect(() => { R.current?.api.setNight(night); }, [night]);
  useEffect(() => { R.current?.api.setSelected(selectedId); }, [selectedId, cur]);

  const togglePlay = () => {
    const P = playRef.current;
    if (P.playing) { P.playing = false; setPlaying(false); return; }
    const now = Date.parse(cur + "T00:00:00Z"); P.ms = now >= t1 - DAY ? t0 : now; P.playing = true; setPlaying(true);
  };
  const labelled = useMemo(() => spec.buildings.filter((b) => b.use !== "townhouse" || /01$|1$/.test(b.id)), [spec]);
  const status = (id: string) => {
    const b = spec.buildings.find((x) => x.id === id), s = states[id]; if (!b || !s) return "";
    if (!s.started) return "not started";
    if (s.built === 0) return s.active > 0 ? "first deck" : "substructure";
    if (s.topped && s.glazed >= b.floors - 0.01) return s.handedOver ? "handed over" : s.fitted >= b.floors ? "complete" : `fit-out ${s.fitted}/${b.floors}`;
    return `${s.built}/${b.floors} levels`;
  };
  const curMs = Date.parse(cur + "T00:00:00Z"), tense = cur === today ? "Data date" : cur < today ? "As built" : "Forecast";
  if (failed) return <div className="studio-empty"><p>3D needs WebGL, which this device or browser has turned off.</p></div>;
  return (
    <div ref={wrap} className={"gl" + (night ? " night" : "")}>
      <canvas ref={canvasRef} className="gl-canvas" aria-label={`3D model of ${spec.name}`} />
      <div ref={overlay} className="gl-hud">
        {labelled.map((b) => (
          <button key={b.id} className={"gl-label" + (selectedId === b.id ? " on" : "")} data-label="1" data-loc={b.id} data-x={b.x + b.w / 2} data-z={b.z + b.d / 2} onClick={() => onSelect(b.id)}>
            <b>{b.use === "townhouse" ? "Townhouses" : b.id}</b><em>{status(b.id)}</em>
          </button>
        ))}
      </div>
      <div className={"tl4d" + (cur !== today ? " away" : "")}>
        <button className="tl4d-play" onClick={togglePlay} aria-label={playing ? "Pause the timeline" : "Play the programme"}>
          {playing ? <svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg> : <svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z" /></svg>}
        </button>
        <div className="tl4d-mid">
          <div className="tl4d-date"><b>{nice(cur)}</b><em>{tense}</em></div>
          <div className="tl4d-track">
            <input type="range" min={0} max={Math.round((t1 - t0) / DAY)} value={Math.round((curMs - t0) / DAY)} onChange={(e) => { playRef.current.playing = false; setPlaying(false); setDate(iso(t0 + Number(e.target.value) * DAY)); }} aria-label="Programme date" />
            <i className="tl4d-today" style={{ left: `${((Date.parse(today + "T00:00:00Z") - t0) / (t1 - t0)) * 100}%` }} />
          </div>
        </div>
        {cur !== today && <button className="tl4d-today-btn" onClick={() => { playRef.current.playing = false; setPlaying(false); setDate(null); }}>Data date</button>}
      </div>
    </div>
  );
}
