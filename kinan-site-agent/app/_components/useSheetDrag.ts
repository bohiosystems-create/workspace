"use client";
import { useEffect, useRef } from "react";

/**
 * Drag a bottom sheet by its handle: up to expand, down to collapse or close, with a flick (velocity) shortcut.
 * The sheet follows the finger and springs to the nearest state on release. Only the handle area starts a drag,
 * so the sheet's own content still scrolls normally. On wide screens (side panel) dragging is off.
 */
export function useSheetDrag<T extends HTMLElement>(opts: { expanded: boolean; setExpanded: (v: boolean) => void; onClose: () => void }) {
  const sheet = useRef<T>(null);
  const handle = useRef<HTMLDivElement>(null);
  const o = useRef(opts); o.current = opts;
  useEffect(() => {
    const h = handle.current, el = sheet.current;
    if (!h || !el) return;
    let y0 = 0, t0 = 0, dy = 0, active = false, id = -1;
    const wide = () => matchMedia("(min-width: 900px)").matches;
    const down = (e: PointerEvent) => {
      if (wide() || (e.target as HTMLElement).closest("button, input, a, select")) return;
      active = true; id = e.pointerId; y0 = e.clientY; t0 = performance.now(); dy = 0;
      h.setPointerCapture(id); el.style.transition = "none";
    };
    const move = (e: PointerEvent) => {
      if (!active || e.pointerId !== id) return;
      dy = e.clientY - y0;
      // resist upward drags once fully open
      const d = dy < 0 ? (o.current.expanded ? dy * 0.15 : dy * 0.6) : dy;
      el.style.transform = `translateY(${d}px)`;
    };
    const up = (e: PointerEvent) => {
      if (!active || e.pointerId !== id) return;
      active = false;
      const v = dy / Math.max(1, performance.now() - t0); // px/ms
      el.style.transition = ""; el.style.transform = "";
      if (Math.abs(dy) < 6) { o.current.setExpanded(!o.current.expanded); return; }
      if (dy > 140 || v > 0.7) { if (o.current.expanded && dy < 320) o.current.setExpanded(false); else o.current.onClose(); navigator.vibrate?.(6); }
      else if (dy < -60 || v < -0.5) o.current.setExpanded(true);
    };
    h.addEventListener("pointerdown", down); h.addEventListener("pointermove", move);
    h.addEventListener("pointerup", up); h.addEventListener("pointercancel", up);
    return () => { h.removeEventListener("pointerdown", down); h.removeEventListener("pointermove", move); h.removeEventListener("pointerup", up); h.removeEventListener("pointercancel", up); };
  }, []);
  return { sheet, handle };
}
