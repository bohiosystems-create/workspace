"use client";

// Tiny language store shared by every React root on the page (pages, header, chat).
// The choice is kept in localStorage; <html lang dir> follows it so the whole layout flips to RTL.
import { useSyncExternalStore } from "react";
import { type Lang, isLang, dirOf, nm, K, M, dt, dtm } from "@/lib/i18n";
import { AR_UI } from "@/lib/i18n-ui";

let current: Lang = "en";
let booted = false;
const subs = new Set<() => void>();

function apply(l: Lang) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = l;
  document.documentElement.dir = dirOf(l);
}

function boot() {
  if (booted || typeof window === "undefined") return;
  booted = true;
  try {
    const saved = localStorage.getItem("lang");
    if (isLang(saved)) current = saved;
    else if (navigator.language?.toLowerCase().startsWith("ar")) current = "ar";
  } catch {}
  apply(current);
}

export function setLang(l: Lang) {
  current = l;
  try { localStorage.setItem("lang", l); } catch {}
  apply(l);
  subs.forEach((f) => f());
}

export function getLang(): Lang {
  boot();
  return current;
}

const subscribe = (f: () => void) => {
  subs.add(f);
  boot();
  // pick up the stored language right after hydration
  queueMicrotask(f);
  return () => { subs.delete(f); };
};

/** Language + bound helpers. English strings are the keys; missing Arabic falls back to English. */
export function useI18n() {
  const lang = useSyncExternalStore(subscribe, () => current, () => "en" as Lang);
  const t = (s: string) => (lang === "ar" ? AR_UI[s] ?? s : s);
  return {
    lang,
    t,
    N: (s: string | null | undefined) => nm(lang, s), // proper nouns / campaign names
    k: (x: number | string) => (lang === "ar" ? `${x} ألف` : `${x}K`), // compact SAR thousands
    m: (x: number | string) => (lang === "ar" ? `${x} مليون` : `${x}M`),
    K: (x: number | string) => K(lang, x),
    M: (x: number | string) => M(lang, x),
    d: (x: string | Date, o?: Intl.DateTimeFormatOptions) => dt(lang, x, o),
    dm: (x: string | Date) => dtm(lang, x),
    num: (x: number) => x.toLocaleString("en-GB"),
    setLang,
  };
}
