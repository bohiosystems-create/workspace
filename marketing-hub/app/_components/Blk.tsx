"use client";
// A dashboard block (figure tile, chart, section) that the assistant can hide or show: <Blk page="director" id="kpi-ytd">.
// The hidden blocks come from /api/views (lib/view-blocks.ts) and refresh when the chat changes them.
import { useEffect, useState, type ReactNode } from "react";

let layouts: Record<string, string[]> | null = null;
let loading: Promise<void> | null = null;
const subs = new Set<() => void>();
function load(force = false) {
  if (loading && !force) return loading;
  loading = fetch("/api/views").then((r) => r.json()).then((x) => { if (x?.layouts) { layouts = x.layouts; subs.forEach((f) => f()); } }).catch(() => {});
  return loading;
}
/** Call after the chat changed a dashboard. */
export function refreshViews() { load(true); }
if (typeof window !== "undefined") window.addEventListener("views-changed", () => refreshViews());

export function useHidden(page: string) {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); subs.add(f); load(); return () => { subs.delete(f); }; }, []);
  const h = layouts?.[page] ?? [];
  return (id: string) => h.includes(id);
}

export default function Blk({ page, id, children }: { page: string; id: string; children: ReactNode }) {
  const hidden = useHidden(page);
  return hidden(id) ? null : <>{children}</>;
}
