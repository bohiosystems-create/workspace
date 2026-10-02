"use client";

import { useEffect, useState } from "react";
import { useI18n } from "../_components/lang";

type Miss = { id: string; question: string; answer: string; lang: string; engine: string; source: "AUTO" | "USER"; createdAt: string };

// The feedback loop for questions nobody anticipated: what the assistant missed, newest first.
export function MissedQuestions() {
  const { t } = useI18n();
  const [d, setD] = useState<{ misses: Miss[]; total: number } | null>(null);
  useEffect(() => { fetch("/api/chat/miss").then((r) => r.json()).then(setD).catch(() => setD({ misses: [], total: 0 })); }, []);
  return (
    <div className="panel" id="missed" style={{ marginTop: 18 }}>
      <div className="chart-label">{t("Questions the assistant missed")}{d ? ` (${d.total})` : ""}</div>
      <div className="muted" style={{ fontSize: 11, marginBottom: 10 }}>{t("Logged automatically when the built-in answers can't match a question, and when someone presses \"Not what I asked\". Each one becomes a new answer, synonym or test question.")}</div>
      {d && !d.misses.length && <div className="muted" style={{ fontSize: 11 }}>{t("None yet.")}</div>}
      {d?.misses.map((m) => (
        <div className="logrow" key={m.id} style={{ alignItems: "flex-start" }}>
          <div className="lt">{m.createdAt.slice(0, 16).replace("T", " ")}</div>
          <span className={`pill ${m.source === "USER" ? "weak" : "hold"}`}>{t(m.source === "USER" ? "Pressed by a person" : "No built-in match")}</span>
          <div style={{ flex: 1 }} dir="auto"><b>{m.question}</b><div className="muted" style={{ fontSize: 10 }} dir="auto">{m.engine === "rules" ? "" : `${m.engine} · `}{m.answer.slice(0, 140)}{m.answer.length > 140 ? "…" : ""}</div></div>
        </div>
      ))}
    </div>
  );
}
