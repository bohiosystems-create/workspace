"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export interface View { k: number; x: number; y: number }
export interface TapInfo { cx: number; cy: number; target: Element | null }

/**
 * Touch-first pan / pinch / wheel zoom for a fixed-size content (cw × ch).
 * screen = content * k + (x, y). Taps (no movement) are reported via onTap so
 * callers can hit-test SVG children without pointer-capture interfering.
 */
export function usePanZoom(cw: number, ch: number, onTap?: (t: TapInfo) => void, maxZoom = 14) {
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const fitK = useRef(1);
  const viewRef = useRef(view);
  viewRef.current = view;
  const tapRef = useRef(onTap);
  tapRef.current = onTap;
  const fitted = useRef(false);
  const anim = useRef<number>(0);

  const clamp = useCallback((v: View, w = size.w, h = size.h): View => {
    const k = Math.min(Math.max(v.k, fitK.current * 0.85), fitK.current * maxZoom);
    const pad = 80; // allow a little overscroll
    const x = cw * k <= w ? (w - cw * k) / 2 : Math.min(pad, Math.max(w - cw * k - pad, v.x));
    const y = ch * k <= h ? (h - ch * k) / 2 : Math.min(pad, Math.max(h - ch * k - pad, v.y));
    return { k, x, y };
  }, [cw, ch, size.w, size.h, maxZoom]);

  const fit = useCallback(() => {
    if (!size.w || !size.h) return;
    const k = Math.min(size.w / cw, size.h / ch);
    fitK.current = k;
    setView({ k, x: (size.w - cw * k) / 2, y: (size.h - ch * k) / 2 });
  }, [cw, ch, size.w, size.h]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => { fitted.current = false; }, [cw, ch]);
  useEffect(() => {
    if (size.w && size.h && !fitted.current) { fit(); fitted.current = true; }
  }, [size.w, size.h, fit]);

  const flyTo = useCallback((px: number, py: number, zoomFactor: number, yFrac = 0.5) => {
    cancelAnimationFrame(anim.current);
    const from = viewRef.current;
    const k = Math.min(fitK.current * zoomFactor, fitK.current * maxZoom);
    const to = clamp({ k, x: size.w / 2 - px * k, y: size.h * yFrac - py * k });
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 380), e = 1 - Math.pow(1 - p, 3);
      setView({ k: from.k + (to.k - from.k) * e, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e });
      if (p < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  }, [clamp, size.w, size.h, maxZoom]);

  const zoomAt = useCallback((sx: number, sy: number, factor: number) => {
    const v = viewRef.current;
    const k = Math.min(Math.max(v.k * factor, fitK.current * 0.85), fitK.current * maxZoom);
    const r = k / v.k;
    setView(clamp({ k, x: sx - (sx - v.x) * r, y: sy - (sy - v.y) * r }));
  }, [clamp, maxZoom]);

  // Pointer handling --------------------------------------------------------
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: 0, startT: 0, pinchD: 0, downTarget: null as Element | null, multi: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = () => el.getBoundingClientRect();

    const down = (e: PointerEvent) => {
      cancelAnimationFrame(anim.current);
      ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const g = gesture.current;
      if (ptrs.current.size === 1) { g.moved = 0; g.startT = performance.now(); g.multi = false; g.downTarget = e.target as Element; }
      else { g.multi = true; const [a, b] = [...ptrs.current.values()]; g.pinchD = Math.hypot(a.x - b.x, a.y - b.y); }
    };
    const move = (e: PointerEvent) => {
      const p = ptrs.current.get(e.pointerId);
      if (!p) return;
      const g = gesture.current;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (ptrs.current.size === 1) {
        g.moved += Math.abs(dx) + Math.abs(dy);
        if (g.moved > 8) setView((v) => clamp({ ...v, x: v.x + dx, y: v.y + dy }));
      } else if (ptrs.current.size === 2) {
        const [a, b] = [...ptrs.current.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (g.pinchD > 0) {
          const r = rect();
          zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, d / g.pinchD);
        }
        g.pinchD = d;
        g.moved = 99;
      }
    };
    const up = (e: PointerEvent) => {
      const g = gesture.current;
      const wasSingle = ptrs.current.size === 1;
      ptrs.current.delete(e.pointerId);
      if (ptrs.current.size === 1) { // continue pan with remaining finger
        g.pinchD = 0;
      }
      if (wasSingle && !g.multi && g.moved <= 8 && performance.now() - g.startT < 700) {
        const r = rect();
        const v = viewRef.current;
        tapRef.current?.({ cx: (e.clientX - r.left - v.x) / v.k, cy: (e.clientY - r.top - v.y) / v.k, target: e.target as Element });
      }
    };
    const cancel = (e: PointerEvent) => { ptrs.current.delete(e.pointerId); };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = rect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)));
    };
    const dbl = (e: MouseEvent) => { const r = rect(); zoomAt(e.clientX - r.left, e.clientY - r.top, 2); };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("pointerleave", cancel);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("dblclick", dbl);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("pointerleave", cancel);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("dblclick", dbl);
    };
  }, [clamp, zoomAt]);

  return {
    ref, view, size, fit, flyTo, zoomAt,
    zoom: fitK.current ? view.k / fitK.current : 1,
    zoomBy: (f: number) => zoomAt(size.w / 2, size.h / 2, f),
  };
}
