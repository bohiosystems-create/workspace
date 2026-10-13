// The report as a presentation deck: structured slides (not the e-mail HTML) that the ▶ Play player renders full
// screen in Kinan's style with animated charts. Built next to each report (lib/reports.ts) and embedded in its HTML as
// <script type="application/json" id="kinan-deck"> — mail clients drop it; the player reads it.
// All text is already in the report's language.

export type Tone = "good" | "bad" | "warn" | "neutral";
export type Kpi = { label: string; value: number; prefix?: string; suffix?: string; decimals?: number; sub?: string; tone?: Tone;
  /** Optional mini visual: a trend (oldest first) or a 0–100 progress ring. */ spark?: number[]; ring?: number };

/** A cue in the narration: from character `at` of the spoken text, the presenter talks about item `ref` of the slide
 *  (an index into slideItems; -1 = nothing in particular). Written by the AI with the script (lib/narration.ts). */
export type Cue = { at: number; ref: number };

export type DeckSlide = ({ cues?: Cue[];
  /** What changed on this slide's subject since the last report (for the presenter; not drawn on the slide). */ since?: string[];
  /** Year-to-date levels the manager sees every day: introduced, not read out — only what changed is spoken. */ ytd?: boolean }) & (
  | { kind: "cover"; kicker: string; title: string; sub: string; say: string }
  | { kind: "headline"; kicker: string; headline: string; kpis: Kpi[]; points: string[]; say: string }
  | { kind: "gauges"; kicker: string; title: string; items: { label: string; pct: number; actual: string; target: string; note?: string; outlook?: { label: string; forecast: number; target: number } }[]; foot?: string; say: string }
  | { kind: "columns"; kicker: string; title: string; sub: string; labels: string[]; values: number[]; unit: string; decimals?: number; target?: (number | null)[];
      /** false: the columns are not a time series (no "latest month" highlight or change call-out). Default true. */ latest?: boolean; say: string }
  | { kind: "donut"; kicker: string; title: string; sub: string; labels: string[]; values: number[]; unit: string; /** figures shown (default 1) */ decimals?: number; say: string }
  | { kind: "hbars"; kicker: string; title: string; sub: string; labels: string[]; values: number[]; unit: string; bench?: number | null; benchLabel?: string;
      /** figures shown (default 2) and whether a longer bar is worse (days late): no "best" chip, bars in the alert colour */ decimals?: number; higherIsWorse?: boolean; say: string }
  | { kind: "line"; kicker: string; title: string; sub: string; labels: string[]; values: number[]; unit: string; say: string }
  | { kind: "scan"; kicker: string; title: string; sources: { label: string; items: number; found: number }[]; say: string }
  | { kind: "finding"; kicker: string; source: string; title: string; why: string; down: boolean; changePct: number | null; series: number[] | null;
      /** How the change was measured: series index ranges [from, to) of the baseline and recent windows, their averages and the unit. */
      windows?: { base: [number, number]; recent: [number, number] }; recent?: number; baseline?: number; unit?: string; evidence: { source: string; title: string }[]; n: number; of: number; say: string }
  | { kind: "initiative"; kicker: string; type: string; project?: string; title: string; answers: string | null; idea: string; offer: string; channels: { label: string; pct: number }[]; contracts: [number, number]; salesM: [number, number]; cts: number; spendK: number; n: number; of: number; say: string }
  | { kind: "list"; kicker: string; title: string; items: { text: string; sub?: string; tone?: Tone; tag?: string; minutes?: number }[]; totalMinutes?: number; say: string }
  /** A section divider in the style of Kinan's collateral: dark photo-less panel, big title, orange sub line, chevron band. */
  | { kind: "divider"; kicker: string; title: string; sub?: string; n?: number; of?: number; say: string }
  | { kind: "closing"; kicker: string; title: string; sub: string; say: string });

const fmtN = (v: number, d = 0) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
/** The items on a slide the presenter can point at, in the order the player numbers them (app/reports/deck-player.tsx:
 *  every useSpoken list follows this order). Short descriptions for the AI writing the script. */
export function slideItems(s: DeckSlide): string[] {
  switch (s.kind) {
    case "headline": return [...s.kpis.map((k) => `figure tile "${k.label}": ${k.prefix ?? ""}${fmtN(k.value, k.decimals ?? 0)}${k.suffix ?? ""}${k.sub ? ` (${k.sub})` : ""}`), ...s.points.map((p) => `bullet point: ${p}`)];
    case "gauges": return s.items.map((x) => `gauge "${x.label}": ${x.pct}% (${x.actual} of ${x.target})`);
    case "columns": return s.labels.map((l, i) => `column "${l}": ${fmtN(s.values[i], s.decimals ?? 0)} ${s.unit}`);
    case "donut": return s.labels.map((l, i) => `slice "${l}": ${fmtN(s.values[i], 1)} ${s.unit}`);
    case "hbars": return s.labels.map((l, i) => `bar "${l}": ${fmtN(s.values[i], 2)}${s.unit}`);
    case "line": return s.labels.map((l, i) => `point "${l}": ${fmtN(s.values[i], 1)} ${s.unit}`);
    case "scan": return s.sources.map((x) => `source "${x.label}": ${x.items} checked, ${x.found} findings`);
    case "finding": return [`the change figure${s.changePct != null ? ` (${s.changePct > 0 ? "+" : ""}${fmtN(s.changePct, 0)}%)` : ""} and its chart`, ...s.evidence.map((e) => `evidence line: ${e.source} — ${e.title}`)];
    case "initiative": return ["the channel mix", `contracts range ${s.contracts[0]}–${s.contracts[1]}`, `sales range ${fmtN(s.salesM[0], 1)}–${fmtN(s.salesM[1], 1)}M`, `cost to sales ${fmtN(s.cts, 1)}% and spend`];
    case "list": return s.items.slice(0, 8).map((x) => `list item: ${x.text}${x.sub ? ` — ${x.sub}` : ""}`);
    default: return [];
  }
}

export type Deck = { lang: "en" | "ar"; title: string; slides: DeckSlide[] };

// ------------------------------------------------------------------ what the voice is talking about
// The player lights up the item being spoken about. Two sources, combined by refineCues:
//   1. the AI's own [[ref]] marks in the script (slide.cues) — the presenter saying which item a phrase is about;
//   2. the figures and labels of each item found in the spoken text (mentionAt) — a mark the text itself gives.
// Each corrects the other: a mark put at the start of a sentence that talks about two items is moved to where each
// item is actually named, and an item the AI forgot to mark still lights up when its figure is spoken.
export type Key = string | number | null | undefined;
/** The keys of each item (label, figure, sub-label) in slideItems order — what to look for in the spoken text. */
export function slideKeys(s: DeckSlide): Key[][] {
  switch (s.kind) {
    case "headline": return [...s.kpis.map((k) => [k.label, k.value, k.sub]), ...s.points.map((p) => [p])];
    case "gauges": return s.items.map((x) => [x.label, x.actual, x.pct, x.outlook?.label]);
    case "columns": case "hbars": case "line": return s.values.map((v, i) => [s.labels[i], v]);
    case "donut": { const total = s.values.reduce((a, b) => a + b, 0) || 1; return s.values.map((v, i) => [s.labels[i], v, Math.round((v / total) * 100) + "%"]); }
    case "scan": return s.sources.map((x) => [x.label, x.items]);
    case "finding": return [[s.changePct != null ? Math.abs(s.changePct) : null], ...s.evidence.map((e) => [e.title, e.source])];
    case "initiative": return [s.channels.map((ch) => ch.label), [s.contracts[0], s.contracts[1]], [s.salesM[0], s.salesM[1]], [s.cts, s.spendK]];
    case "list": return s.items.slice(0, 8).map((x) => [x.text, x.sub, x.minutes]);
    default: return [];
  }
}
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const STOP = new Set(["the", "and", "for", "that", "this", "with", "from", "are", "was", "were", "has", "have", "its", "our", "your", "into", "than", "then", "them", "they", "will", "been", "more", "most", "each", "per", "not", "but", "all", "any", "one", "two", "sar", "you", "about", "what", "which", "their", "there", "where", "when", "also", "only", "over", "under", "past", "last", "next", "week", "month", "today", "days", "campaign", "campaigns", "now", "new", "old", "can", "may", "via", "off", "out", "day", "end", "set", "get", "yet", "too", "way", "who", "how", "why", "let", "see", "use", "run", "add", "big", "low", "top", "ago", "due", "far", "few", "lot", "own", "say", "had", "did", "still", "since", "until", "after", "before"]);
/** The distinctive words of a label: names and figures, not the small words every bullet has. */
export const words = (s: string) => Array.from(new Set(s.toLowerCase().replace(/[^\p{L}\p{N}.%]+/gu, " ").split(" ").filter((w) => w.length >= 3 && !STOP.has(w))));
/** Where a longer label is talked about even if reworded: a stretch of the spoken text holding at least
 *  a third of its distinctive words (two at least) — the stretch with the most of them — counting only words that
 *  belong to this label alone (`shared` = words other items on the slide also use: "Andalus" places a bullet, "plan"
 *  does not). -1 if it is not there. */
export function fuzzyAt(low: string, label: string, shared: Set<string> = new Set()) {
  const ws = words(label).filter((w) => !shared.has(w));
  if (ws.length < 2) return -1;
  const need = Math.max(2, Math.ceil(ws.length / 3));
  const hits = ws.flatMap((w) => { const out: number[] = []; let i = low.indexOf(w); while (i >= 0 && out.length < 8) { out.push(i); i = low.indexOf(w, i + 1); } return out.map((p) => [p, w] as const); }).sort((a, b) => a[0] - b[0]);
  // The stretch (120 characters from one of its words) holding the most of its words; the earliest on a tie.
  let best = -1, bestN = 0;
  for (let i = 0; i < hits.length; i++) {
    const seen = new Set<string>();
    for (let j = i; j < hits.length && hits[j][0] - hits[i][0] <= 120; j++) seen.add(hits[j][1]);
    if (seen.size >= need && seen.size > bestN) { bestN = seen.size; best = hits[i][0]; }
  }
  return best;
}
/** Where an item is first mentioned in the spoken text (its figure first — a figure is more specific than a label two
 *  tiles may share — then its label, exact or paraphrased), or -1. Figures must stand alone (2 is not found in 25). */
export function mentionAt(text: string, keys: Key[], shared: Set<string> = new Set()) {
  let best = -1, bestNum = -1;
  const low = text.toLowerCase();
  for (const k of keys) {
    if (k == null || k === "") continue;
    let at = -1;
    if (typeof k === "number") {
      if (!Number.isFinite(k)) continue;
      for (const f of Array.from(new Set([fmtN(k, 0), fmtN(k, 1), fmtN(k, 2), String(k)]))) {
        if (f.replace(/[^0-9]/g, "").length < 2) continue; // a lone digit is too easy to find by accident
        const m = new RegExp(`(?<![\\d.,])${esc(f)}(?![\\d])`).exec(text);
        if (m && (at < 0 || m.index < at)) at = m.index;
      }
    } else {
      const t = k.replace(/\s+/g, " ").trim().toLowerCase();
      if (t.length < 3) continue;
      at = low.indexOf(t);
      if (at < 0 && t.length > 24) at = fuzzyAt(low, t, shared); // a bullet point the presenter paraphrased
    }
    if (at < 0) continue;
    if (typeof k === "number") { if (bestNum < 0 || at < bestNum) bestNum = at; }
    else if (best < 0 || at < best) best = at;
  }
  return bestNum >= 0 ? bestNum : best;
}
/** Words that more than one item on the slide uses: they cannot tell items apart. */
export function sharedWords(keys: Key[][]) {
  const count = new Map<string, number>();
  for (const ks of keys) for (const w of new Set(ks.flatMap((k) => (typeof k === "string" ? words(k) : [])))) count.set(w, (count.get(w) ?? 0) + 1);
  return new Set(Array.from(count.entries()).filter(([, n]) => n > 1).map(([w]) => w));
}
/** The cues the player follows: the AI's marks corrected by where the text itself names each item.
 *  - an item named in the text gets a cue there if the mark in force at that point is for another item;
 *  - a mark whose item is only named after the mark's own stretch is dropped (it was put at the start of a sentence
 *    about several items, and the item's own cue takes over where it is named);
 *  - without marks, the mentions alone make the cues. Sorted; -1 clears the highlight. */
export function refineCues(say: string, cues: Cue[] | undefined, keys: Key[][]): Cue[] {
  const shared = sharedWords(keys);
  const at = keys.map((k) => mentionAt(say, k, shared));
  let out = (cues ?? []).filter((c) => c.ref < keys.length).map((c) => ({ ...c, mark: true })).sort((a, b) => a.at - b.at);
  const refAt = (p: number) => { let r = -1; for (const c of out) if (c.at <= p) r = c.ref; return r; };
  at.forEach((p, ref) => { if (p >= 0 && refAt(p) !== ref) { out.push({ at: p, ref, mark: false }); out.sort((a, b) => a.at - b.at); } });
  out = out.filter((c, i) => {
    if (!c.mark || c.ref < 0 || at[c.ref] < 0) return true;
    const end = i + 1 < out.length ? out[i + 1].at : say.length;
    return at[c.ref] < Math.max(end, c.at + 1); // named within its stretch (or earlier): keep
  });
  // Two cues at the same place: the text's own wins.
  const seen = new Map<number, Cue>();
  for (const c of out) { const prev = seen.get(c.at); if (!prev || !c.mark) seen.set(c.at, { at: c.at, ref: c.ref }); }
  return Array.from(seen.values()).sort((a, b) => a.at - b.at);
}


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


// ------------------------------------------------------------------ British English (the rule for every spoken line)
// The voice is British: whatever writes a line (the AI, a template, a vendor's own wording), the spoken text is passed
// through this list so no American word or spelling reaches it.
const BRIT: [RegExp, string][] = [
  [/\b(anal|optim|priorit|real|util|organ|minim|maxim|recogn|summar|special|categor|emphas|standard|capital|final|author|monet|incentiv|normal|visual|central|stabil|custom|personal|mobil|apolog|critic)iz(e|es|ed|ing|ation|ations)\b/gi, "$1is$2"],
  [/\banalyz(e|es|ed|ing)\b/gi, "analys$1"],
  [/\b(behavi|col|fav|hon|harb|lab|neighb|flav|hum|rum|vig|savi|endeav)or(s|ed|ing|ite|ites|al|able)?\b/gi, "$1our$2"],
  [/\b(cent|met|lit|theat|fib)er(s)?\b/gi, "$1re$2"],
  [/\bprogram(s)?\b(?! (?:code|file|files))/gi, "programme$1"],
  [/\bcatalog(s)?\b/gi, "catalogue$1"], [/\bdialog(s)?\b/gi, "dialogue$1"],
  [/\b(travel|cancel|model|label|fuel|signal|channel|total)ed\b/gi, "$1led"], [/\b(travel|cancel|model|label|fuel|signal|channel)ing\b/gi, "$1ling"],
  [/\bcheck(s)? \(payment\)/gi, "cheque$1"], [/\bdefense\b/gi, "defence"], [/\boffense\b/gi, "offence"], [/\bfulfill(s|ment)?\b/gi, "fulfil$1"], [/\benroll(s|ment)?\b/gi, "enrol$1"],
  [/\bgotten\b/gi, "got"], [/\bvacation(s)?\b/gi, "holiday$1"], [/\bcell ?phone(s)?\b/gi, "mobile$1"], [/\bin the fall\b/gi, "in the autumn"],
  [/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) through (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/g, "$1 to $2"],
  [/\bon the weekend\b/gi, "at the weekend"], [/\bdifferent than\b/gi, "different from"], [/\bwrite (him|her|them|us|me) (?=[a-z])/gi, "write to $1 "],
  [/\breach(?:ing)? out to\b/gi, "contact"], [/\bcircle back\b/gi, "come back"], [/\btouch base\b/gi, "check in"], [/\bgoing forward\b/gi, "from now on"],
  [/\bawesome\b/gi, "excellent"], [/\bsuper (important|useful|clear)\b/gi, "very $1"], [/\bhuge win\b/gi, "real gain"], [/\bASAP\b/g, "as soon as possible"],
];
/** British spelling and wording for an English line (captions and voice alike). */
export function british(text: string) {
  let t = text;
  for (const [rx, to] of BRIT) t = t.replace(rx, (m, ...g) => { const out = to.replace(/\$(\d)/g, (_, k) => g[Number(k) - 1] ?? ""); return m[0] === m[0].toUpperCase() && out[0] ? out[0].toUpperCase() + out.slice(1) : out; });
  return t;
}

// ------------------------------------------------------------------ spoken dates
const MONTHS_EN = "January|February|March|April|May|June|July|August|September|October|November|December";
// Days as words ("fifth", "twenty-first"): voices sometimes read "5th" as "five" — words leave no room for that.
const ORD = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth", "twentieth"];
const ord = (n: number) => (n >= 1 && n <= 20 ? ORD[n] : n >= 21 && n <= 29 ? `twenty-${ORD[n - 20]}` : n === 30 ? "thirtieth" : n === 31 ? "thirty-first" : String(n));
const ABBR: Record<string, string> = { Jan: "January", Feb: "February", Mar: "March", Apr: "April", Jun: "June", Jul: "July", Aug: "August", Sep: "September", Sept: "September", Oct: "October", Nov: "November", Dec: "December" };
/** Dates the way a presenter says them, so the voice reads them naturally:
 *  - short month names in full: "Jul" → "July", "Jun–Oct 2026" → "June to October 2026"
 *  - day and month with an ordinal: "Monday, 5 October 2026" → "Monday, the 5th of October" (voices otherwise say
 *    "five October"); "October 3, 2026" → "October the 3rd"
 *  - the year is dropped when it is the current one.
 *  A month followed by an amount ("Jan 16.5 million") stays an amount. Amounts are said in words: "SAR 133.9M" →
 *  "133.9 million SAR", "4.5×" → "4.5 times", "vs" → "versus". English only — Arabic is read correctly. */
export function speakDates(text: string, lang: "en" | "ar") {
  if (lang !== "en") return text;
  text = british(text);
  const year = String(new Date().getFullYear());
  const amount = "(?![\\d%]|[.,]\\d|\\s*(?:million|thousand|billion|percent|K\\b|M\\b|k\\b|m\\b))";
  return text
    .replace(/\b(\d{1,2})(?:st|nd|rd|th)\b/g, (m, d) => (Number(d) >= 1 && Number(d) <= 31 ? ord(Number(d)) : m))
    .replace(/\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\b(?:\.(?=\s+[a-z\d]))?/g, (_, m) => ABBR[m])
    .replace(new RegExp(`\\b(${MONTHS_EN})\\s*[–—-]\\s*(${MONTHS_EN})\\b`, "g"), "$1 to $2")
    .replace(new RegExp(`\\b(\\d{1,2}) (${MONTHS_EN})(?: (\\d{4}))?\\b`, "g"), (_, d, m, y) => `the ${ord(Number(d))} of ${m}${y && y !== year ? `, ${y}` : ""}`)
    .replace(new RegExp(`\\b(${MONTHS_EN}) (\\d{1,2})\\b${amount}(?:, (\\d{4}))?`, "g"), (_, m, d, y) => `${m} the ${ord(Number(d))}${y && y !== year ? `, ${y}` : ""}`)
    .replace(new RegExp(`\\b(${MONTHS_EN}) ${year}\\b`, "g"), "$1")
    // Amounts and symbols the way they are said: voices spell "SAR" and read "M" as a letter.
    // A whole number is said whole: "33.0" → "33" (also "1.00").
    .replace(/(?<![\d.])(\d[\d,]*)\.0+(?![\d])/g, "$1")
    .replace(/(?<![\d.])(\d[\d,]*\.\d*[1-9])0+(?![\d])/g, "$1") // "1.50" → "1.5"
    // The currency comes after the amount, as it is said ("100,000 SAR"); voices mispronounce "riyals", so it is "SAR", a word (lib/voice.ts).
    .replace(/\bSAR\s?(\d[\d,]*(?:\.\d+)?)\s?([MKB])\b/g, (_, n, u) => `${n} ${UNIT[u]} ${SAR}`)
    .replace(/\bSAR\s?(\d[\d,]*(?:\.\d+)?)\b/g, `$1 ${SAR}`)
    .replace(/\b(\d[\d,]*(?:\.\d+)?)\s?([MKB])?\s*(million|thousand|billion)?\s+(?:Saudi\s+)?riyals?\b/gi, (_, n, u, w) => `${n}${u ? ` ${UNIT[u.toUpperCase()]}` : w ? ` ${w}` : ""} ${SAR}`)
    .replace(/\b(?:Saudi\s+)?riyals?\b/gi, SAR)
    .replace(/\bSAR\b/g, SAR)
    .replace(/(\d[\d,]*(?:\.\d+)?)\s?([MKB])\b/g, (_, n, u) => `${n} ${UNIT[u]}`)
    .replace(/(\d+(?:\.\d+)?)\s?×/g, "$1 times")
    .replace(/(\d)\s?[–—]\s?(\d)/g, "$1 to $2")
    .replace(/\bvs\.?(?=\s)/g, "versus")
    .replace(/\bYTD\b/g, "year to date")
    // Symbols a voice cannot say.
    .replace(/\s*[—–]\s*/g, ", ").replace(/\s*·\s*/g, ", ").replace(/\s*→\s*/g, " to ").replace(/\s*←\s*/g, " from ")
    .replace(/−/g, "minus ").replace(/~\s?(?=\d)/g, "about ").replace(/\s&\s/g, " and ").replace(/≥\s?/g, "at least ").replace(/≤\s?/g, "at most ")
    .replace(/[“”„]/g, "").replace(/\s*,\s*,/g, ",").replace(/\s+([,.;:!?])/g, "$1").replace(/\s{2,}/g, " ");
}
const UNIT: Record<string, string> = { M: "million", K: "thousand", B: "billion" };
const SAR = "SAR"; // the voice says it as a word (lib/voice.ts speechForm)

