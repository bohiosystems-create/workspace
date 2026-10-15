"use client";
// "The agent is working" indicator for long jobs (building a brief, a snapshot, a PDF): a spinner, a running timer,
// the steps the job goes through, and — once it has been measured on this device — how long the same job took last
// time, so a slow run never looks stuck. Same component as the Kinan marketing agent's. No duration is ever guessed:
// before the first measured run the bar is an indeterminate sweep. The job runs in one request, so the highlighted
// step is paced, not reported by the server; the list completes when the job does.
import { useEffect, useState } from "react";

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

/** Inline: spinner + label + m:ss (for buttons). */
export function WorkingInline({ since, label }: { since: number; label: string }) {
  const s = useElapsed(since);
  return <span className="wk-inline"><span className="spin sm" /><span>{label}</span><span dir="ltr" className="wk-ms">{clock(s)}</span></span>;
}

/** Panel: spinner, big timer, progress bar against the usual duration and the steps of the job. */
export function WorkingPanel({ job, since, title, steps, typicalMs = 20000 }: { job: string; since: number; title: string; steps: string[]; typicalMs?: number }) {
  const s = useElapsed(since);
  const [last] = useState(() => readLast(job));
  const expected = (last ?? typicalMs) / 1000; // only paces the step list; never shown as a promise
  const frac = last ? Math.min(0.97, s <= expected ? (s / expected) * 0.9 : 0.9 + 0.07 * (1 - Math.exp(-(s - expected) / Math.max(5, expected)))) : null;
  const active = Math.min(steps.length - 1, Math.floor((s / expected) * steps.length));
  const slow = !!last && s > expected * 1.6 + 5;
  return (
    <div className="rpt-panel working" role="status" aria-live="polite">
      <div className="wk-head">
        <span className="wk-orb" aria-hidden="true"><span /><span /><span /></span>
        <div className="wk-text">
          <div className="wk-title">{title}</div>
          <div className="muted small">{last ? `Last time it took ${clock(last / 1000)}` : "Working through every source — this can take a minute or two."}{slow ? " · Taking longer than last time — still working." : ""}</div>
        </div>
        <div dir="ltr" className="wk-clock">{clock(s)}</div>
      </div>
      <div className="wk-track">{frac != null ? <div className="wk-fill" style={{ width: `${frac * 100}%` }} /> : <div className="wk-fill wk-indet" />}</div>
      <ol className="wk-steps">
        {steps.map((x, i) => (
          <li key={i} className={i < active ? "done" : i === active ? "on" : ""}>
            <span className="wk-dot">{i < active ? "✓" : i === active ? <span className="spin sm" /> : ""}</span>{x}
          </li>
        ))}
      </ol>
    </div>
  );
}
