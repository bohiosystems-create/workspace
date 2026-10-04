/**
 * Touch gestures for a three.js view, handled here rather than by OrbitControls: one finger orbits (turn + tilt);
 * two fingers TWIST to turn, PINCH to zoom and DRAG to move, all at once, like a map app. Taps call onTap.
 * Labels and pins drawn over the canvas (inside `hudSelector`) join gestures; a tap on them is left to their button.
 * Mouse input is left to OrbitControls.
 */
import * as THREE from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface GestureOpts {
  wrapEl: HTMLElement; el: HTMLCanvasElement; camera: THREE.PerspectiveCamera; controls: OrbitControls;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  onTap: (clientX: number, clientY: number) => void; onStart?: () => void; poke?: () => void; hudSelector?: string;
}
export function attachGestures(o: GestureOpts): () => void {
  const { wrapEl, el, camera, controls } = o;
  const hud = o.hudSelector ?? ".gl-hud";
  const poke = o.poke ?? (() => {});
  const pickAt = o.onTap;
  const PLAN_BOUNDS = o.bounds;
    const fingers = new Map<number, { x: number; y: number }>();
    let g0: { cx: number; cy: number; dist: number; ang: number } | null = null;
    let tap: { x: number; y: number; t: number; multi: boolean; hud: boolean } | null = null;
    const sph = new THREE.Spherical(), UP = new THREE.Vector3(0, 1, 0);
    const clampN = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
    const metrics = () => { const [a, b] = [...fingers.values()]; return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, dist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), ang: Math.atan2(b.y - a.y, b.x - a.x) }; };
    const orbitBy = (dTheta: number, dPhi: number) => {
      const off = camera.position.clone().sub(controls.target); sph.setFromVector3(off);
      sph.theta += dTheta; sph.phi = clampN(sph.phi + dPhi, controls.minPolarAngle, controls.maxPolarAngle);
      off.setFromSpherical(sph); camera.position.copy(controls.target).add(off); camera.lookAt(controls.target);
    };
    const dollyBy = (k: number) => {
      const off = camera.position.clone().sub(controls.target);
      off.setLength(clampN(off.length() * k, controls.minDistance, controls.maxDistance)); camera.position.copy(controls.target).add(off);
    };
    const panBy = (dx: number, dy: number) => {
      const dist = camera.position.distanceTo(controls.target), s = (2 * dist * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, el.clientHeight);
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0); right.y = 0; right.normalize();
      const fwd = new THREE.Vector3().crossVectors(UP, right);
      const mv = right.multiplyScalar(-dx * s).add(fwd.multiplyScalar(dy * s));
      const t = controls.target.clone().add(mv);
      t.x = clampN(t.x, PLAN_BOUNDS.minX, PLAN_BOUNDS.maxX); t.z = clampN(t.z, PLAN_BOUNDS.minZ, PLAN_BOUNDS.maxZ);
      mv.subVectors(t, controls.target); controls.target.add(mv); camera.position.add(mv);
    };
    const tDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      // the canvas, plus labels and pins drawn over it: a finger landing on a label must still turn / zoom the model
      const tgt = e.target as Element, onHud = !!tgt.closest?.(hud);
      if (tgt !== el && !onHud) return;
      e.stopPropagation(); if (!onHud) e.preventDefault();
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      o.onStart?.(); poke();
      if (fingers.size === 1) tap = { x: e.clientX, y: e.clientY, t: e.timeStamp, multi: false, hud: onHud };
      else { if (tap) tap.multi = true; }
      g0 = fingers.size === 2 ? metrics() : null;
    };
    const tMove = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || !fingers.has(e.pointerId)) return;
      e.stopPropagation(); e.preventDefault();
      const prev = fingers.get(e.pointerId)!;
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      poke();
      if (fingers.size === 1) {
        const k = (2 * Math.PI) / Math.max(1, el.clientHeight) * 0.75;
        orbitBy(-dx * k, -dy * k);
      } else if (fingers.size === 2 && g0) {
        const m2 = metrics();
        let dAng = m2.ang - g0.ang; if (dAng > Math.PI) dAng -= 2 * Math.PI; if (dAng < -Math.PI) dAng += 2 * Math.PI;
        orbitBy(dAng, 0);                    // twist: the site turns with your fingers
        dollyBy(g0.dist / m2.dist);          // pinch: zoom
        panBy(m2.cx - g0.cx, m2.cy - g0.cy); // drag: move
        g0 = m2;
      }
    };
    const tUp = (e: PointerEvent) => {
      if (e.pointerType !== "touch" || !fingers.has(e.pointerId)) return;
      e.stopPropagation();
      fingers.delete(e.pointerId);
      g0 = fingers.size === 2 ? metrics() : null;
      // a tap on the 3D picks what is under it; a tap on a label or pin is handled by its own button
      if (fingers.size === 0 && tap && !tap.multi && !tap.hud && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 10 && e.timeStamp - tap.t < 500) pickAt(e.clientX, e.clientY);
      if (fingers.size === 0) tap = null;
    };
    // No synthetic click after a touch on the canvas: the sheet that a tap opens would otherwise receive it
    // (and its close button sits right where the finger was).
    const noClick = (e: TouchEvent) => { if (e.cancelable) e.preventDefault(); };
    el.addEventListener("touchend", noClick, { passive: false });
    wrapEl.addEventListener("pointerdown", tDown, { capture: true, passive: false });
    wrapEl.addEventListener("pointermove", tMove, { capture: true, passive: false });
    wrapEl.addEventListener("pointerup", tUp, { capture: true });
    wrapEl.addEventListener("pointercancel", tUp, { capture: true });
  return () => {
    el.removeEventListener("touchend", noClick);
    wrapEl.removeEventListener("pointerdown", tDown, { capture: true }); wrapEl.removeEventListener("pointermove", tMove, { capture: true });
    wrapEl.removeEventListener("pointerup", tUp, { capture: true }); wrapEl.removeEventListener("pointercancel", tUp, { capture: true });
  };
}
