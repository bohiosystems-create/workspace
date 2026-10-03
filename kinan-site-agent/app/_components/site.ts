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
  return { state, error, refresh };
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
