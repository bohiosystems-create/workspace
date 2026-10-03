// The report as a presentation deck: structured slides (not the e-mail HTML) that the ▶ Play player renders full
// screen in Kinan's style with animated charts. Built next to each report (lib/reports.ts) and embedded in its HTML as
// <script type="application/json" id="kinan-deck"> — mail clients drop it; the player reads it.
// All text is already in the report's language.

export type Tone = "good" | "bad" | "warn" | "neutral";
export type Kpi = { label: string; value: number; prefix?: string; suffix?: string; decimals?: number; sub?: string; tone?: Tone };

export type DeckSlide =
  | { kind: "cover"; kicker: string; title: string; sub: string; say: string }
  | { kind: "headline"; kicker: string; headline: string; kpis: Kpi[]; points: string[]; say: string }
  | { kind: "gauges"; kicker: string; title: string; items: { label: string; pct: number; actual: string; target: string; note?: string }[]; foot?: string; say: string }
  | { kind: "columns"; kicker: string; title: string; sub: string; labels: string[]; values: number[]; unit: string; decimals?: number; target?: (number | null)[]; say: string }
  | { kind: "donut"; kicker: string; title: string; sub: string; labels: string[]; values: number[]; unit: string; say: string }
  | { kind: "hbars"; kicker: string; title: string; sub: string; labels: string[]; values: number[]; unit: string; bench?: number | null; benchLabel?: string; say: string }
  | { kind: "line"; kicker: string; title: string; sub: string; labels: string[]; values: number[]; unit: string; say: string }
  | { kind: "scan"; kicker: string; title: string; sources: { label: string; items: number; found: number }[]; say: string }
  | { kind: "finding"; kicker: string; source: string; title: string; why: string; down: boolean; changePct: number | null; series: number[] | null; evidence: { source: string; title: string }[]; n: number; of: number; say: string }
  | { kind: "initiative"; kicker: string; type: string; project?: string; title: string; answers: string | null; idea: string; offer: string; channels: { label: string; pct: number }[]; contracts: [number, number]; salesM: [number, number]; cts: number; spendK: number; n: number; of: number; say: string }
  | { kind: "list"; kicker: string; title: string; items: { text: string; sub?: string; tone?: Tone; tag?: string; minutes?: number }[]; say: string }
  | { kind: "closing"; kicker: string; title: string; sub: string; say: string };

export type Deck = { lang: "en" | "ar"; title: string; slides: DeckSlide[] };

/** Embed a deck in report HTML (safe inside a <script> element). */
export const deckScript = (deck: Deck) => `<script type="application/json" id="kinan-deck">${JSON.stringify(deck).replace(/</g, "\\u003c")}</script>`;

/** Read the deck back from report HTML (null for older reports). */
export function deckFromHtml(html: string): Deck | null {
  const m = html.match(/<script type="application\/json" id="kinan-deck">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]) as Deck; } catch { return null; }
}

/** First sentence-ish, capped, for slide text that must stay readable. */
export const short = (s: string, max = 220) => { const t = (s ?? "").replace(/\s+/g, " ").trim(); if (t.length <= max) return t; const cut = t.slice(0, max); const dot = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; ")); return (dot > max * 0.5 ? cut.slice(0, dot + 1) : cut.replace(/\s+\S*$/, "") + "…"); };
