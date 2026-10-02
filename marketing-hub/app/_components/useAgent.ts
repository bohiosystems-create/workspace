"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "./lang";

/** Agent state for the current language, plus a POST helper. Ignores responses for a stale language. */
export function useAgent() {
  const { lang } = useI18n();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const langRef = useRef(lang);
  langRef.current = lang;

  useEffect(() => {
    let live = true;
    fetch(`/api/agent?lang=${lang}`)
      .then((r) => r.json())
      .then((d) => { if (live) (d.error ? setError(d.error) : setData(d)); })
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [lang]);

  async function act(body: any, key: string): Promise<any> {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, lang: langRef.current }) });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      if (d.state) setData(d.state);
      return d;
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function doc(kind: "qbr" | "rfp", vendor: string, quarter = "2026-Q2") {
    const d = await (await fetch(`/api/agent?doc=${kind}&vendor=${encodeURIComponent(vendor)}&quarter=${quarter}&lang=${langRef.current}`)).json();
    if (d.error) throw new Error(d.error);
    return d;
  }

  return { data, error, setError, busy, act, doc, lang };
}

/** Approver name shared across pages (and the assistant), remembered in this browser. */
export function useApprover() {
  const [approver, set] = useState("");
  useEffect(() => { try { set(localStorage.getItem("approver") ?? ""); } catch {} }, []);
  return [approver, (v: string) => { set(v); try { localStorage.setItem("approver", v); } catch {} }] as const;
}

/** Ask the assistant to open and show drafts waiting for approval. */
export const openDrafts = () => window.dispatchEvent(new Event("open-drafts"));
