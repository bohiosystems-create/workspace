"use client";
/**
 * Contractor emails from the project's Outlook inbox — the same mail the agent reads (contractor_emails / get_email).
 * Read-only: nothing is sent, moved or deleted.
 */
import { useEffect, useMemo, useState } from "react";
import type { Email, InboxState } from "@/lib/core/emails";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" });

export default function Emails() {
  const [inbox, setInbox] = useState<InboxState | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const load = async (sync = false) => {
    setBusy(true);
    try { setInbox(await fetch(`/api/inbox${sync ? "?sync=1" : ""}`, { cache: "no-store" }).then((r) => r.json())); } catch { /* keep the last list */ }
    finally { setBusy(false); }
  };
  useEffect(() => { load(); }, []);
  const list = useMemo(() => {
    const ws = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (inbox?.emails ?? []).filter((e) => { const h = `${e.subject} ${e.fromName} ${e.company} ${e.text}`.toLowerCase(); return ws.every((w) => h.includes(w)); });
  }, [inbox, q]);
  const byCompany = useMemo(() => { const m = new Map<string, number>(); for (const e of inbox?.emails ?? []) m.set(e.company, (m.get(e.company) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); }, [inbox]);

  if (!inbox) return <div className="empty pad">Loading the inbox…</div>;
  return (
    <>
      <section className="panel mail-status">
        <header><div><h3>Contractor emails</h3><p>{inbox.mode === "demo" ? "Demo inbox — connect the project mailbox in Outlook to read real mail (see SETUP.md)." : `Outlook · ${inbox.mailbox}${inbox.lastSync ? ` · synced ${when(inbox.lastSync)}` : ""}`}</p></div>
          {inbox.mode === "live" && <button className="mini" disabled={busy} onClick={() => load(true)}>{busy ? "Syncing…" : "Sync now"}</button>}</header>
        {inbox.error && <div className="mail-err">{inbox.error}</div>}
        <div className="mail-cos">{byCompany.map(([c, n]) => <button key={c} className={"chip" + (q === c.toLowerCase() ? " hot" : "")} onClick={() => setQ(q === c.toLowerCase() ? "" : c.toLowerCase())}>{c} <b>{n}</b></button>)}</div>
        <p className="mail-note">The AI agent reads these when you ask, e.g. <em>"any delays from the façade contractor?"</em></p>
      </section>
      <input className="search" type="search" placeholder="Search emails: delay, pour, inspection, PO-4500136…" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="rows mail-list">
        {list.map((e: Email) => (
          <li key={e.id} className={(open === e.id ? "open " : "") + (e.importance === "high" ? "crit" : "")}>
            <button className="mail-row" onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id}>
              <span className="t"><b>{e.subject}</b><em>{e.fromName} · {e.company} · {when(e.received)}{e.attachments.length ? ` · 📎 ${e.attachments.length}` : ""}</em>
                {open !== e.id && <em className="note">{e.text.replace(/\s+/g, " ").slice(0, 180)}…</em>}</span>
              {e.importance === "high" && <span className="slip late">high</span>}
            </button>
            {open === e.id && <div className="mail-body">{e.text}{e.attachments.length > 0 && <div className="mail-att">{e.attachments.map((a) => <span key={a}>📎 {a}</span>)}</div>}{e.webLink && <a href={e.webLink} target="_blank" rel="noreferrer">Open in Outlook</a>}</div>}
          </li>
        ))}
        {!list.length && <li className="empty">No emails match.</li>}
      </ul>
    </>
  );
}
