"use client";
import { useCallback, useEffect, useState } from "react";
import type { Doc, Location, Note } from "@/lib/types";

export type ClientDoc = Omit<Doc, "text">;
export interface SiteState {
  project: { name: string; client: string; code: string };
  locations: Location[];
  docs: ClientDoc[];
  notes: Note[];
  agentMode: "ai" | "offline";
  providers: ("anthropic" | "openai")[];
  dataDate: string;
  storage?: "fs" | "blob" | "tmp";
  /** Blob pathname prefix for direct browser uploads (Vercel Blob), else null. */
  directUpload?: string | null;
}

export function useSite() {
  const [state, setState] = useState<SiteState | null>(null);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/state", { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      setState(await r.json());
      setError("");
    } catch (e) {
      setError("Can't reach the server — check your connection.");
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  // Live: every few seconds while the page is visible, ask whether anything changed (WhatsApp, another user, the
  // field app). When it did, reload and tell the rest of the page (the schedule, facilities) through "kinan:changed".
  const [live, setLive] = useState<{ at: string; text: string; via?: string } | null>(null);
  useEffect(() => {
    let last = "", stop = false, timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (stop) return;
      if (document.visibilityState === "visible") {
        try {
          const r = await fetch("/api/state/stamp", { cache: "no-store" });
          if (r.ok) {
            const j = (await r.json()) as { v: string; last: { at: string; text: string; via?: string } | null };
            if (last && j.v && j.v !== last) {
              await refresh();
              window.dispatchEvent(new CustomEvent("kinan:changed", { detail: j.last }));
              if (j.last && Date.now() - Date.parse(j.last.at) < 120_000) setLive(j.last);
            }
            if (j.v) last = j.v;
          }
        } catch { /* offline: try again next tick */ }
      }
      timer = setTimeout(tick, 4000);
    };
    tick();
    const vis = () => { if (document.visibilityState === "visible") { if (timer) clearTimeout(timer); tick(); } };
    document.addEventListener("visibilitychange", vis);
    return () => { stop = true; if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", vis); };
  }, [refresh]);
  useEffect(() => { if (!live) return; const id = setTimeout(() => setLive(null), 6000); return () => clearTimeout(id); }, [live]);
  return { state, error, refresh, live };
}

export function useAuthor() {
  const [author, setAuthorState] = useState("Dev Manager");
  useEffect(() => { try { const a = localStorage.getItem("kinan.author"); if (a) setAuthorState(a); } catch {} }, []);
  const setAuthor = (a: string) => { setAuthorState(a); try { localStorage.setItem("kinan.author", a); } catch {} };
  return [author, setAuthor] as const;
}

export function rootOf(locs: Location[], id: string): Location | undefined {
  let cur = locs.find((l) => l.id === id);
  while (cur?.parentId) { const p = locs.find((l) => l.id === cur!.parentId); if (!p) break; cur = p; }
  return cur;
}
export function pathOf(locs: Location[], id: string): string {
  const out: string[] = [];
  let cur = locs.find((l) => l.id === id);
  while (cur) { out.unshift(cur.name); cur = cur.parentId ? locs.find((l) => l.id === cur!.parentId) : undefined; }
  return out.join(" › ");
}
export function descendants(locs: Location[], id: string): Set<string> {
  const s = new Set([id]);
  let grew = true;
  while (grew) { grew = false; for (const l of locs) if (l.parentId && s.has(l.parentId) && !s.has(l.id)) { s.add(l.id); grew = true; } }
  return s;
}
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
