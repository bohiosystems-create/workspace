"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Doc, Location, Note, UiAction } from "@/lib/types";

export type ClientDoc = Omit<Doc, "text">;
export interface SiteState {
  project: { name: string; client: string; code: string };
  locations: Location[];
  docs: ClientDoc[];
  notes: Note[];
  agentMode: "claude" | "offline";
}
export interface ChatItem { role: "user" | "assistant"; content: string; actions?: UiAction[]; mode?: string }

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

export function useAgent(ctx: () => { focus?: { docId?: string; locationId?: string }; here?: { locationId: string }; author: string }, onDone: (actions: UiAction[]) => void) {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [busy, setBusy] = useState(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const loaded = useRef(false);

  useEffect(() => {
    try { const s = localStorage.getItem("kinan.chat"); if (s) setItems(JSON.parse(s)); } catch {}
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    try { localStorage.setItem("kinan.chat", JSON.stringify(items.slice(-40))); } catch {}
  }, [items]);

  const send = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    const next: ChatItem[] = [...itemsRef.current, { role: "user", content: t }];
    setItems(next);
    setBusy(true);
    try {
      const r = await fetch("/api/agent", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })), ...ctx() }),
      });
      const j = await r.json();
      setItems((cur) => [...cur, { role: "assistant", content: j.reply ?? j.error ?? "No reply", actions: j.actions, mode: j.mode }]);
      onDone(j.actions ?? []);
    } catch {
      setItems((cur) => [...cur, { role: "assistant", content: "I couldn't reach the server. Check your signal and try again." }]);
    } finally { setBusy(false); }
  }, [busy, ctx, onDone]);

  return { items, busy, send, clear: () => setItems([]) };
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
