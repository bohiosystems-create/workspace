"use client";

// Plays a report (daily or live snapshot) as a presentation: one slide per section — one per chart or idea where a
// section has several — with a progress bar, auto-advance and an optional spoken narration (the browser's own
// speech synthesis, English or Arabic). Tap the left/right side or use the arrows to move; Space pauses; Esc closes.
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../_components/lang";

type Slide = { kicker: string; html: string; say: string };

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Split the report HTML into slides, using the data-slide / data-part markers (older reports: the section cards). */
export function slidesFrom(html: string, title: string, lang: string): Slide[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const sub = clean(doc.querySelector("h1 + div")?.textContent ?? "");
  const slides: Slide[] = [{ kicker: lang === "ar" ? "كنان · مساعد مدير التسويق الذكي" : "KINAN · AI Assistant Director of Marketing", html: `<div style="font-size:30px;font-weight:700;line-height:1.25">${title.replace(/</g, "&lt;")}</div><div style="margin-top:14px;font-size:14px;color:#5b6170">${sub.replace(/</g, "&lt;")}</div>`, say: title }];
  let sections = [...doc.querySelectorAll<HTMLElement>("[data-slide]")];
  if (!sections.length) sections = [...doc.querySelectorAll<HTMLElement>("body > div > div")].filter((d) => /background:\s*#fff/.test(d.getAttribute("style") ?? ""));
  for (const sec of sections) {
    const head = sec.getAttribute("data-slide") ?? clean(sec.firstElementChild?.textContent ?? "");
    const body = (sec.children[1] as HTMLElement | undefined) ?? sec;
    const parts = [...body.querySelectorAll<HTMLElement>(":scope [data-part]")];
    if (parts.length > 1) {
      // Text before the first part (e.g. "Focus today: …") rides on the first slide; text after it on the last.
      const kids = [...body.children], first = kids.indexOf(parts[0]), last = kids.indexOf(parts[parts.length - 1]);
      const lead = first > 0 ? kids.slice(0, first).map((c) => c.outerHTML).join("") : "";
      const tail = last >= 0 ? kids.slice(last + 1).filter((c) => !c.hasAttribute("data-part")).map((c) => c.outerHTML).join("") : "";
      parts.forEach((p, i) => slides.push({ kicker: `${head} · ${i + 1}/${parts.length}`, html: (i === 0 ? lead : "") + p.outerHTML + (i === parts.length - 1 ? tail : ""), say: `${i === 0 ? head + ". " : ""}${clean(p.textContent ?? "")}` }));
      continue;
    }
    // Long lists are split so each slide stays readable.
    const items = [...body.querySelectorAll<HTMLElement>(":scope > ul > li, :scope > ol > li")];
    if (items.length > 5) {
      const list = items[0].parentElement!, tag = list.tagName.toLowerCase(), style = list.getAttribute("style") ?? "";
      const kids = [...body.children], at = kids.indexOf(list);
      const before = at > 0 ? kids.slice(0, at).map((c) => c.outerHTML).join("") : "", after = at >= 0 ? kids.slice(at + 1).map((c) => c.outerHTML).join("") : "";
      for (let i = 0; i < items.length; i += 5) {
        const chunk = items.slice(i, i + 5);
        slides.push({ kicker: `${head}${items.length > 5 ? ` · ${i / 5 + 1}/${Math.ceil(items.length / 5)}` : ""}`, html: `${i === 0 ? before : ""}<${tag} start="${i + 1}" style="${style}">${chunk.map((x) => x.outerHTML).join("")}</${tag}>${i + 5 >= items.length ? after : ""}`, say: `${i === 0 ? head + ". " + clean(kids.slice(0, Math.max(0, at)).map((c) => c.textContent ?? "").join(" ")) + " " : ""}${chunk.map((x) => clean(x.textContent ?? "")).join(". ")}` });
      }
      continue;
    }
    slides.push({ kicker: head, html: body.innerHTML, say: `${head}. ${clean(body.textContent ?? "")}` });
  }
  slides.push({ kicker: "", html: `<div style="font-size:24px;font-weight:700">${lang === "ar" ? "انتهى التقرير" : "End of report"}</div><div style="margin-top:12px;font-size:14px;color:#5b6170">${lang === "ar" ? "الاعتمادات تتم داخل التطبيق — لا يتخذ التقرير أي إجراء." : "Approvals happen in the app — the report takes no action."}</div>`, say: lang === "ar" ? "انتهى التقرير." : "End of report." });
  return slides;
}

export function ReportPlayer({ html, title, lang, onClose }: { html: string; title: string; lang: string; onClose: () => void }) {
  const { t } = useI18n();
  const slides = useMemo(() => slidesFrom(html, title, lang), [html, title, lang]);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [voice, setVoice] = useState(true);
  const [scale, setScale] = useState(1);
  const [started, setStarted] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const stage = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null);
  const tts = typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
  const slide = slides[i];
  // Reading time: about 2.6 words a second, between 5 and 22 seconds per slide.
  const dur = Math.min(22000, Math.max(5000, (slide.say.split(/\s+/).length / 2.6) * 1000 + 1200));
  const go = (n: number) => { tts?.cancel(); setI(Math.max(0, Math.min(slides.length - 1, n))); setStarted(Date.now()); };

  // Fit the slide content to the stage.
  useEffect(() => {
    const fit = () => {
      const st = stage.current, c = content.current;
      if (!st || !c) return;
      // Content flows at the available width; the slide only shrinks when it's too tall (or grows a little on big screens).
      const card = c.parentElement as HTMLElement;
      const s = Math.min(1.35, (st.clientHeight - 40) / Math.max(card.offsetHeight, 1), (st.clientWidth - 24) / Math.max(card.offsetWidth, 1));
      setScale(Math.max(0.5, s));
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (stage.current) ro.observe(stage.current);
    return () => ro.disconnect();
  }, [i]);

  // Narration (when on) and auto-advance.
  useEffect(() => {
    if (!playing) { tts?.cancel(); return; }
    let done = false;
    const next = () => { if (!done) { done = true; if (i < slides.length - 1) go(i + 1); else setPlaying(false); } };
    if (voice && tts) {
      tts.cancel();
      const u = new SpeechSynthesisUtterance(slide.say.slice(0, 600));
      u.lang = lang === "ar" ? "ar-SA" : "en-GB";
      const v = tts.getVoices().find((x) => x.lang.toLowerCase().startsWith(lang === "ar" ? "ar" : "en"));
      if (v) u.voice = v;
      u.rate = 1.02;
      u.onend = () => setTimeout(next, 700);
      u.onerror = () => setTimeout(next, dur);
      tts.speak(u);
      const guard = setTimeout(next, Math.max(dur, 30000)); // never stall if the voice never ends
      return () => { done = true; clearTimeout(guard); tts.cancel(); };
    }
    const id = setTimeout(next, dur);
    return () => { done = true; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, playing, voice]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(id); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(lang === "ar" ? i - 1 : i + 1);
      else if (e.key === "ArrowLeft") go(lang === "ar" ? i + 1 : i - 1);
      else if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); setStarted(Date.now()); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  useEffect(() => () => tts?.cancel(), [tts]);

  const progress = playing && !(voice && tts) ? Math.min(1, (now - started) / dur) : playing ? 0.5 : 0;
  const btn: React.CSSProperties = { background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 20, padding: "7px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" };

  return (
    <div role="dialog" aria-label={title} dir={lang === "ar" ? "rtl" : "ltr"} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#0b0d12", color: "#fff", display: "flex", flexDirection: "column" }}>
      {/* Progress: one segment per slide */}
      <div style={{ display: "flex", gap: 3, padding: "10px 12px 6px" }}>
        {slides.map((_, k) => (
          <div key={k} style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.22)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", background: "#fff", width: k < i ? "100%" : k === i ? `${Math.round(progress * 100)}%` : "0%", transition: k === i ? "width .2s linear" : "none" }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 12px 6px", fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: ".12em", textTransform: "uppercase" }}>{slide.kicker}</span>
        <span dir="ltr">{i + 1} / {slides.length}</span>
        <button style={{ ...btn, padding: "4px 10px" }} onClick={onClose} aria-label={t("Close")}>✕</button>
      </div>
      {/* Stage: tap the start side to go back, the end side to go forward */}
      <div ref={stage} style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", padding: 16 }}
        onClick={(e) => { const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect(); const back = (e.clientX - r.left < r.width * 0.3) !== (lang === "ar"); go(back ? i - 1 : i + 1); }}>
        <div key={i} style={{ background: "#fff", color: "#000919", borderRadius: 6, boxShadow: "0 20px 60px rgba(0,0,0,0.5)", padding: "clamp(16px, 4vw, 28px)", transform: `scale(${scale})`, transformOrigin: "center", flex: "0 0 auto" }}>
          <div ref={content} style={{ width: "min(680px, calc(100vw - 72px))", animation: "slideIn .35s ease", fontFamily: lang === "ar" ? "Tahoma, Arial, sans-serif" : "Helvetica, Arial, sans-serif", fontSize: 14, lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: slide.html }} />
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "10px 12px 18px", flexWrap: "wrap" }}>
        <button style={btn} onClick={() => go(i - 1)} disabled={i === 0}>{lang === "ar" ? "→" : "←"} {t("Back")}</button>
        <button style={{ ...btn, background: "#fff", color: "#0b0d12", fontWeight: 700 }} onClick={() => { setPlaying(!playing); setStarted(Date.now()); }}>{playing ? `❚❚ ${t("Pause")}` : `▶ ${t("Play")}`}</button>
        <button style={btn} onClick={() => go(i + 1)} disabled={i === slides.length - 1}>{t("Next")} {lang === "ar" ? "←" : "→"}</button>
        {tts && <button style={btn} onClick={() => { setVoice(!voice); setStarted(Date.now()); }} aria-pressed={voice}>{voice ? `🔊 ${t("Voice on")}` : `🔇 ${t("Voice off")}`}</button>}
      </div>
      <style>{`@keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}
