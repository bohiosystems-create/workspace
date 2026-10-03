"use client";
// "The agent is working" indicator for long jobs (building a report, a snapshot, a PDF): a spinner, a running timer,
// the steps the job goes through, and how long the same job took last time — so a slow run never looks stuck.
// The job runs in one request, so the highlighted step is paced from the typical duration, not reported by the server;
// the list completes when the job does.
import { useEffect, useState } from "react";
import { useI18n } from "./lang";

const KEY = "working-ms:";
const readLast = (job: string) => { try { const v = Number(localStorage.getItem(KEY + job)); return v > 0 ? v : null; } catch { return null; } };
/** Remember how long a job took (call when it finishes). */
export function rememberDuration(job: string, ms: number) { try { localStorage.setItem(KEY + job, String(Math.round(ms))); } catch { /* storage off */ } }

/** Seconds since `since`, ticking every 250 ms while mounted. */
export function useElapsed(since: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (since == null) return; const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id); }, [since]);
  return since == null ? 0 : Math.max(0, (now - since) / 1000);
}
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Inline: spinner + label + m:ss (for buttons and chat bubbles). */
export function WorkingInline({ since, label, dark = true }: { since: number; label: string; dark?: boolean }) {
  const s = useElapsed(since);
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span className={`spin${dark ? " dark" : ""}`} /><span>{label}</span><span dir="ltr" style={{ fontVariantNumeric: "tabular-nums", opacity: 0.7 }}>{clock(s)}</span></span>;
}

/** Panel: spinner, big timer, progress bar against the usual duration and the steps of the job. */
export function WorkingPanel({ job, since, title, steps, typicalMs = 20000 }: { job: string; since: number; title: string; steps: string[]; typicalMs?: number }) {
  const { t } = useI18n();
  const s = useElapsed(since);
  const [last] = useState(() => readLast(job));
  const expected = (last ?? typicalMs) / 1000;
  // Ease towards the end without ever claiming to be done: 95% at the expected time, creeping on after it.
  const frac = Math.min(0.97, s <= expected ? (s / expected) * 0.9 : 0.9 + 0.07 * (1 - Math.exp(-(s - expected) / Math.max(5, expected))));
  const active = Math.min(steps.length - 1, Math.floor((s / expected) * steps.length));
  const slow = s > expected * 1.6 + 5;
  return (
    <div className="panel working" role="status" aria-live="polite" style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <span className="wk-orb" aria-hidden="true"><span /><span /><span /></span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{title}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {last ? `${t("Last time it took")} ${clock(last / 1000)}` : `${t("Usually takes")} ~${clock(typicalMs / 1000)}`}
            {slow ? ` · ${t("Taking longer than usual — still working.")}` : ""}
          </div>
        </div>
        <div dir="ltr" className="wk-clock">{clock(s)}</div>
      </div>
      <div className="wk-track"><div className="wk-fill" style={{ width: `${frac * 100}%` }} /></div>
      <ol className="wk-steps">
        {steps.map((x, i) => (
          <li key={i} className={i < active ? "done" : i === active ? "on" : ""}>
            <span className="wk-dot">{i < active ? "✓" : i === active ? <span className="spin dark" /> : ""}</span>{x}
          </li>
        ))}
      </ol>
    </div>
  );
}
