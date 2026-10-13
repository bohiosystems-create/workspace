// The presenter's script for ▶ Play. Each slide's `say` starts as the slide's own text; here the AI rewrites it into
// what a presenter would actually say — talking about the slide, not reading it — in the report's language. The
// script is never shown in the report; the player speaks it (and can show it as captions). Figures are quoted
// exactly as printed on the slide so the player can light up the figure being spoken about.
// Without an AI key, or if the AI fails, the slides keep their own text. One AI call per report (task "draft").
import { routeAndRun, availableProviders } from "../core/llm/router";
import { serverLlm } from "../llmConfig";
import { slideItems, speakDates, type Cue, type Deck, type DeckSlide } from "./deck";
export { speakDates };

// The marketing agent's runLlm({ task, system, messages, maxTokens }) on this app's router (Anthropic / OpenAI).
const llmStatus = () => ({ enabled: availableProviders(serverLlm()).length > 0 });
async function runLlm(o: { task: string; system: string; messages: { role: "user" | "assistant"; content: string }[]; maxTokens: number }): Promise<{ text: string; refused?: boolean }> {
  const { out } = await routeAndRun(serverLlm(), { system: o.system, history: o.messages, tools: [], exec: async () => "", maxTurns: 1, maxTokens: o.maxTokens },
    { tier: o.task === "answer" ? "main" : "deep", reason: o.task === "answer" ? "presenter answer" : "presenter script" });
  return { text: out.text ?? "" };
}

const fmt = (v: number, d = 0) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

/** What the presenter can see on a slide: its printed labels and figures, plus the slide's own text as notes. */
function slideFacts(s: DeckSlide): Record<string, unknown> {
  const items = slideItems(s).map((what, ref) => ({ ref, what }));
  const base = { kind: s.kind, kicker: s.kicker, notes: s.say, ...(items.length ? { items } : {}), ...(s.since?.length ? { changedSinceLastReport: s.since } : {}), ...(s.ytd ? { yearToDateLevels: "on screen — do not read them out" } : {}) };
  switch (s.kind) {
    case "cover": return { ...base, title: s.title, sub: s.sub };
    case "divider": return { ...base, title: s.title, sub: s.sub };
    case "closing": return { ...base, title: s.title, sub: s.sub };
    case "headline": return { ...base, headline: s.headline, figures: s.kpis.map((k) => ({ label: k.label, shown: `${k.prefix ?? ""}${fmt(k.value, k.decimals ?? 0)}${k.suffix ?? ""}`, sub: k.sub, tone: k.tone })), points: s.points };
    case "gauges": return { ...base, title: s.title, items: s.items.map((x) => ({ label: x.label, shown: `${x.pct}%`, actual: x.actual, target: x.target, note: x.note, outlook: x.outlook ? `${x.outlook.label}: ${fmt(x.outlook.forecast, 1)} / ${fmt(x.outlook.target, 1)}` : undefined })), foot: s.foot };
    case "columns": return { ...base, title: s.title, sub: s.sub, unit: s.unit, bars: s.labels.map((l, i) => ({ label: l, shown: fmt(s.values[i], s.decimals ?? 0), target: s.target?.[i] != null ? fmt(s.target[i] as number, 1) : undefined })) };
    case "donut": { const total = s.values.reduce((a, b) => a + b, 0) || 1; return { ...base, title: s.title, sub: s.sub, unit: s.unit, total: fmt(total, 1), slices: s.labels.map((l, i) => ({ label: l, shown: fmt(s.values[i], 1), share: `${Math.round((s.values[i] / total) * 100)}%` })) }; }
    case "hbars": return { ...base, title: s.title, sub: s.sub, unit: s.unit, benchmark: s.bench != null ? `${s.benchLabel ?? ""} ${fmt(s.bench, 2)}` : undefined, bars: s.labels.map((l, i) => ({ label: l, shown: `${fmt(s.values[i], 2)}${s.unit}` })) };
    case "line": return { ...base, title: s.title, sub: s.sub, unit: s.unit, points: s.labels.map((l, i) => ({ label: l, shown: fmt(s.values[i], 1) })) };
    case "scan": return { ...base, title: s.title, sources: s.sources.map((x) => ({ label: x.label, items: x.items, findings: x.found })) };
    case "finding": return { ...base, source: s.source, title: s.title, why: s.why, change: s.changePct != null ? `${s.changePct > 0 ? "+" : ""}${fmt(s.changePct, 0)}%` : undefined, baseline: s.baseline != null ? `${fmt(s.baseline, s.baseline < 10 ? 2 : 1)} ${s.unit ?? ""}` : undefined, recent: s.recent != null ? `${fmt(s.recent, s.recent < 10 ? 2 : 1)} ${s.unit ?? ""}` : undefined, evidence: s.evidence.map((e) => `${e.source}: ${e.title}`), n: `${s.n} of ${s.of}` };
    case "initiative": return { ...base, type: s.type, project: s.project, title: s.title, answers: s.answers, idea: s.idea, offer: s.offer, channels: s.channels.map((c) => `${c.label} ${c.pct}%`), contracts: `${s.contracts[0]}–${s.contracts[1]}`, salesM: `${fmt(s.salesM[0], 1)}–${fmt(s.salesM[1], 1)}M`, costToSales: `${fmt(s.cts, 1)}%`, spend: `SAR ${fmt(s.spendK)}K`, n: `${s.n} of ${s.of}` };
    case "list": return { ...base, title: s.title, items: s.items.slice(0, 8).map((x) => ({ text: x.text, sub: x.sub, tone: x.tone, minutes: x.minutes })), totalMinutes: s.totalMinutes };
  }
}

/** The rule for every English script: the voice is British, so the words are British too. */
export const BRITISH = `- British English, always — the voice is a British presenter and an American word sounds wrong in that voice. British spelling (analyse, optimise, prioritise, organisation, programme, centre, colour, behaviour, favourite, cheque, licence as a noun), British vocabulary and idiom (holiday not vacation, flat or apartment, mobile not cell phone, autumn not fall, timetable or schedule, "at the weekend", "in hospital", "got" not "gotten", "different from" not "different than", "Monday to Friday" not "Monday through Friday", "fortnight" is fine), British dates (the fifth of October, never October fifth), and British understatement: calm and plain, no hype ("awesome", "super", "huge win", "reach out", "circle back", "touch base", "going forward" are out).`;

/** How the presenter talks — shared by the script, and by the answers to questions asked mid-presentation. */
const TONE = `Voice and attitude
- Talk like a trusted site colleague briefing a busy Development Manager: warm, plain, direct, confident. Short sentences. Contractions are fine. No jargon for its own sake, no filler, no corporate phrases ("leverage", "synergies", "going forward").
- You are a presenter, not a reader. Never read the slide word for word and never list everything on it. Pick the two to four things that matter and say why they matter: what changed on site, what it means for the programme and practical completion, what you'd do about it.
- Think like a construction manager out loud: connect the dots across slides (a late façade delivery explains a slipping zone; a critical slab that finished late pushes the floors above; heat-stress hours limit the pour window), weigh time against cost and safety, and say what the manager should decide. One clear point of view per slide, stated plainly.
- Keep the thread: the brief sets the story, the programme charts prove it, the last 24 hours and the next 48 hours show the work, the risks and decisions close it. A short bridge from one slide to the next is welcome ("That explains the next chart.").

How it should sound (the listener hears it once, so every sentence must land)
- Lead with the point, then give the one number that proves it. Never string figures together: a sentence has one idea and at most one or two figures. No semicolons, no "colon lists", no slide-speak ("71% vs 80%; float -3; +3 d").
- Say what a number means, not just what it is: "float of minus three days" becomes "that slab is now three days behind a date practical completion depends on".
- Bad (reads the slide): "Tower A L14 — columns, core walls & PT slab: 71% complete, +3 d late, float -3, critical."
- Good (talks to the manager): "[[0]]Tower A level fourteen is my main worry today. The slab is at 71%, and it is three days behind a date practical completion depends on. I'd ask Al-Bunyan for a weekend pour, or every floor above it slips with it."`;

const SYSTEM = (lang: "en" | "ar", n: number) => `You are the AI Onsite Agent for Kinan Heights, the mixed-use development Kinan is building in Riyadh (towers, podium, hotel, villas and infrastructure). You are presenting the daily site brief aloud to the Development Manager while the slides play on screen. Write the spoken script: exactly one entry per slide, ${n} in all, in the slides' order.

${TONE}
What changed (every brief covers the last 24 hours on site)
- Lead with the change, not the level. Where a slide carries "changedSinceLastReport", start from it: what moved, by how much, from what to what, and why it matters — then the level if it helps. "Tower A moved two points today, to 46%" beats "Tower A is at 46%".
- No change is news too: say it plainly ("The façade is still waiting on batch four") and say what that means.
- Levels the manager sees every day (slides marked "yearToDateLevels") are on screen: never read them out. Introduce them in a few words and speak only to what moved.

Slide by slide
- Cover: one welcoming line that frames the day on site in a few words.
- Brief (the headline slide): the headline figure (progress against plan, or the critical path) and what drives it, then the one or two things to act on today.
- Charts (gauges, columns, donut, bars, lines): the shape of the picture, not every number — the leader, the laggard, the trend, the one figure that should change a decision.
- Last 24 hours and next 48 hours: what was finished, poured, delivered or reported from site, and what is coming — pours, deliveries, inspections, milestones. Say which are on the critical path.
- Critical path, late work, procurement risks, safety: these are calls to action. For each item you mention: the situation in a few words, the evidence (one figure), what you recommend, and the risk of waiting. Say which need the manager's decision and which the site team can run. Prioritise: say which comes first and why.
- Contractor emails and site reports: who wrote, what they say, and whether the programme already reflects it.
- Dividers: one line that introduces the section and why it matters now.
- Closing: one line that sums up the one thing to remember.

Rules
- Length: most entries are two to four spoken sentences (about 30–70 words); recommendation slides may run to 90 words; cover, dividers and closing are one line each. Never exceed 100 words.
- Use only the facts given. Do not invent numbers, names, causes or outcomes.
- Whenever you mention a figure, quote it EXACTLY as it is printed on the slide (same digits, units and format, e.g. "SAR 12.4M", "68%", "1,240"); whenever you name an item, use its printed label or title word for word, because the screen highlights what you name. A title that ends in "…" is cut short: use the full wording from the slide's other text instead.
- The screen highlights the item you are talking about. Each slide lists its items with a number (ref). Right before the words about an item, put its marker [[ref]], e.g. "[[2]]The Tower A façade is twelve days behind." Mark every item you talk about, in the order you talk about them, and put each marker exactly where that item's own words begin — a sentence about two items gets two markers, one before each. Use [[-]] when you move on to a general remark. Markers are not spoken; slides without items get none.
- Say dates as a person would: "Monday, the fifth of October", "the thirtieth of May" (never "5 October 2026"); leave out the year when it is this year. Write month names in full ("July and August", never "Jul"/"Aug").
- Do not greet ("good morning") and do not say the time of day: the player adds the right greeting when the brief is played.
- Activity ids (TA-STR-L14) are for the screen: name the activity in words ("the Tower A level fourteen slab"), never spell out the id. Say "L14" as "level fourteen".
- Plain text only: no markdown, no bullets, no emojis, no stage directions, no headings.
${lang === "ar" ? "- Write in clear, natural Modern Standard Arabic as a Saudi presenter would speak it; Western digits (0-9); amounts exactly as printed." : BRITISH}
Output only JSON: {"slides":[{"i":0,"say":"..."},{"i":1,"say":"..."}, ...]} with one object for every slide index 0 to ${n - 1}.`;

/** The script with its [[ref]] markers taken out: the spoken text (dates said properly) and where each item starts. */
export function withCues(raw: string, lang: "en" | "ar", nItems: number): { say: string; cues: Cue[] } {
  // Markers become sentinels so the clean-up (spaces, dates) can run on the whole text without moving them.
  let t = raw.replace(/\s*\[\[\s*(\d+|-)\s*\]\]\s*/g, (_, r) => ` \u0000${r}\u0001`).replace(/\s+/g, " ").trim();
  t = speakDates(t, lang).replace(/^\u0000/, "\u0000");
  const cues: Cue[] = [];
  let say = "";
  let rest = t;
  for (;;) {
    const m = rest.match(/\u0000(\d+|-)\u0001/);
    if (!m || m.index === undefined) { say += rest; break; }
    say += rest.slice(0, m.index);
    const ref = m[1] === "-" ? -1 : Number(m[1]);
    if (ref < nItems) cues.push({ at: say.length, ref });
    rest = rest.slice(m.index + m[0].length);
  }
  // Tidy the spaces the markers left (" ," / leading space); cue positions move with them.
  const out: string[] = []; const shift: number[] = []; let removed = 0;
  for (let i = 0; i < say.length; i++) {
    const c = say[i], prev = out[out.length - 1];
    const drop = (c === " " && (out.length === 0 || prev === " ")) || (c === " " && /[,.;:!?]/.test(say[i + 1] ?? ""));
    shift[i] = removed;
    if (drop) removed++; else out.push(c);
  }
  shift[say.length] = removed;
  const clean = out.join("").trim();
  return { say: clean, cues: cues.map((c) => ({ at: Math.min(clean.length, c.at - (shift[c.at] ?? removed)), ref: c.ref })) };
}

/** Parse the AI's answer and apply it to the deck; slides without a usable line keep their own text. */
export function applyScript(deck: Deck, text: string): { deck: Deck; applied: number } {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { deck, applied: 0 };
  let j: any;
  try { j = JSON.parse(m[0]); } catch { return { deck, applied: 0 }; }
  const rows: any[] = Array.isArray(j?.slides) ? j.slides : [];
  let applied = 0;
  const slides = deck.slides.map((s, i) => {
    const r = rows.find((x) => Number(x?.i) === i) ?? rows[i];
    const raw = typeof r?.say === "string" ? r.say : "";
    const { say, cues } = withCues(raw, deck.lang, slideItems(s).length);
    if (say.length < 8 || say.length > 800) return s;
    applied++;
    return { ...s, say, cues } as DeckSlide;
  });
  return { deck: { ...deck, slides }, applied };
}

/** The deck with a presenter's script in `say` (or unchanged when no AI is configured or it fails). */
export async function narrateDeck(deck: Deck, opts: { timeoutMs?: number; ai?: boolean } = {}): Promise<Deck> {
  // Without the AI script the slides' own text is spoken: at least the dates are said properly.
  // (each slide opens with what changed since the last report, when there is something to say)
  const spoken = (d: Deck): Deck => ({ ...d, slides: d.slides.map((s) => ({ ...s, say: speakDates(s.since?.length && !s.ytd ? `${s.since[0]} ${s.say}` : s.say, d.lang) }) as DeckSlide) });
  if (!llmStatus().enabled || process.env.DECK_NARRATION === "off" || opts.ai === false || (opts.timeoutMs !== undefined && opts.timeoutMs < 15000)) return spoken(deck);
  try {
    const facts = deck.slides.map((s, i) => ({ i, ...slideFacts(s) }));
    const call = runLlm({ task: "draft", system: SYSTEM(deck.lang, deck.slides.length), messages: [{ role: "user", content: `Slides:\n${JSON.stringify(facts)}` }], maxTokens: 8000 });
    // With a time limit (the scheduled report must finish inside the function's time), a slow AI means the slides' own text.
    const res = opts.timeoutMs === undefined ? await call
      : await Promise.race([call, new Promise<never>((_, no) => setTimeout(() => no(new Error(`no script within ${Math.round(opts.timeoutMs! / 1000)} s`)), opts.timeoutMs))]);
    if (res.refused || !res.text) { console.error("deck narration: the AI returned no script"); return spoken(deck); }
    const { deck: out, applied } = applyScript(deck, res.text);
    if (applied < Math.ceil(deck.slides.length / 2)) { console.error(`deck narration: only ${applied} of ${deck.slides.length} slides scripted — using the slides' own text`); return spoken(deck); }
    return out;
  } catch (e) {
    console.error("deck narration failed", e instanceof Error ? e.message : e);
    return spoken(deck);
  }
}

// ------------------------------------------------------------------ questions asked mid-presentation
export type AskCtx = { title: string; slide: number; slides: { kind: string; title?: string; say: string }[]; history: { q: string; a: string }[] };
const ANSWER_SYSTEM = (lang: "en" | "ar") => `You are the AI Onsite Agent for Kinan Heights, Kinan's mixed-use development in Riyadh, presenting the daily site brief aloud to the Development Manager. The manager has just interrupted with a question. Answer it aloud, in the same voice as the presentation, then hand back to the slides.

${TONE}
Answering
- Open with one short line that names what the question is about, in your own words: "Let me answer your question about why the façade is behind." (never repeat the question verbatim, never "Let me take that").
- Then three to five spoken sentences, 110 words at most. Answer first, in plain words; then the reasoning; then what it means or what you would do.
- Reason, don't just quote. You know construction: use the brief's figures as evidence and explain the why behind them — what drives a figure (a late delivery, a predecessor still open, a pour window, heat-stress hours, labour on site, an inspection or permit, a contractor's resources), why a recommendation makes sense and what the trade-off is, what would change your mind. Connect facts from different slides when they explain each other. Where you are inferring, say so in a word ("my reading is", "most likely"), and say what you would check to be sure.
- Figures: quote only the figures that appear in the report below, exactly as written; never invent a number. Judgement, causes and advice are yours to give. If the report truly has nothing on the subject, say so briefly, give your best professional view, and name where in the app the detail lives (the Site map, Project schedule, Documents or Briefs page).
- End by checking it landed, in one short, natural question: whether that answers it and whether there is anything else. Vary the wording every time — never the same sentence twice in a row, never just "Back to the slides". Examples of the range: "Does that answer your question, or is there anything else you'd like to know?", "Is that clear? Anything else before we move on?", "Does that make sense? Happy to go deeper on any of it.", "Has that covered it, or shall I unpack any part?"
- Plain text only: no markdown, no bullets, no stage directions, no greeting. Say dates as a person would ("the fifth of October"); month names in full.
${lang === "ar" ? "- Write in clear, natural Modern Standard Arabic as a Saudi presenter would speak it; Western digits (0-9)." : BRITISH}`;

/** The spoken answer to a question asked during ▶ Play (no AI configured → a short, honest line). */
export async function answerQuestion(lang: "en" | "ar", question: string, ctx: AskCtx): Promise<string> {
  const none = lang === "ar" ? "لا أستطيع الإجابة عن ذلك الآن من دون مفتاح الذكاء الاصطناعي؛ تجدون التفاصيل في صفحات التطبيق. لنتابع العرض." : "I can't take questions without an AI key set up; the detail is in the app's pages. Let's carry on.";
  if (!llmStatus().enabled) return speakDates(none, lang);
  const facts = ctx.slides.map((x, i) => `${i === ctx.slide ? ">> " : ""}Slide ${i + 1} (${x.kind}${x.title ? `: ${x.title}` : ""}): ${x.say}`).join("\n");
  const messages: { role: "user" | "assistant"; content: string }[] = [];
  for (const h of ctx.history.slice(-3)) { messages.push({ role: "user", content: h.q }); messages.push({ role: "assistant", content: h.a }); }
  messages.push({ role: "user", content: `(Variation seed for your wording: ${Math.floor(Math.random() * 1000)}.)\nReport: ${ctx.title}\nThe presentation so far (">>" marks the slide on screen):\n${facts}\n\nQuestion: ${question}` });
  try {
    const res = await runLlm({ task: "answer", system: ANSWER_SYSTEM(lang), messages, maxTokens: 4000 }); // a strong, fast model: ready by the end of the slide (thinking needs room; the words are limited by the brief)
    const text = (res.text ?? "").replace(/\s+/g, " ").trim();
    if (res.refused || text.length < 4) throw new Error("no answer");
    return speakDates(text.slice(0, 950), lang);
  } catch (e) {
    console.error("deck question", e instanceof Error ? e.message : e);
    return speakDates(lang === "ar" ? "لم أستطع الإجابة عن ذلك الآن. لنتابع، ويمكنكم سؤالي مجدداً بعد العرض." : "I couldn't get an answer to that just now. Let's carry on, and you can ask me again after the presentation.", lang);
  }
}
