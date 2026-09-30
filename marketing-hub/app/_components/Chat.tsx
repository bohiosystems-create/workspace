"use client";

import { useEffect, useRef, useState } from "react";

type Card = { kind: "rec"; key: string } | { kind: "email"; id: string };
type Msg = { role: "user" | "assistant"; content: string; cards?: Card[]; engine?: string };
type Store = { recommendations: any[]; outbox: any[]; integration: { mode: string; delivery: string; sender: string } };

const SUGGESTIONS = [
  "What should I do first?",
  "Which vendor converts best?",
  "Any invoice problems?",
  "Which contracts are ending?",
  "How is Andalus doing?",
];
const TYPE_LABEL: Record<string, string> = {
  SLA_BREACH: "SLA", CONTRACT_RENEWAL: "Contract", UNDERPERFORMING: "Performance", INVOICE_EXCEPTIONS: "Invoices",
  UNBILLED: "Unbilled", OVERDUE_PAYMENT: "Payment", REALLOCATE: "Budget", SCALE_UP: "Scale",
};

// Minimal markdown: **bold** and "- " bullets.
function Rich({ text }: { text: string }) {
  const bold = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>));
  return (
    <>
      {text.split("\n").map((l, i) =>
        l.startsWith("- ") ? <div key={i} style={{ paddingLeft: 12, textIndent: -10 }}>• {bold(l.slice(2))}</div> : l.trim() === "" ? <div key={i} style={{ height: 6 }} /> : <div key={i}>{bold(l)}</div>
      )}
    </>
  );
}

export default function Chat() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [store, setStore] = useState<Store | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approver, setApprover] = useState("");
  const [edits, setEdits] = useState<Record<string, { subject: string; body: string; cc: string }>>({});
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  const [working, setWorking] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    try {
      const d = await (await fetch("/api/recommendations")).json();
      if (!d.error) setStore(d);
    } catch {}
  }
  useEffect(() => {
    try { setApprover(localStorage.getItem("approver") ?? ""); } catch {}
    refresh();
  }, []);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [msgs, busy, open, store]);

  const activeRecs = store ? store.recommendations.filter((r) => r.state === "OPEN" || r.state === "DRAFTED") : [];
  const urgent = activeRecs.filter((r) => r.severity === "crit").length;

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })) }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setMsgs([...next, { role: "assistant", content: d.reply, cards: d.cards, engine: d.engine }]);
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function act(body: any, key: string) {
    setWorking(key);
    setError(null);
    try {
      const res = await fetch("/api/recommendations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setStore(d);
      return d as Store;
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setWorking(null);
    }
  }

  // Drafting from a card: create the draft, then show the email card in the conversation.
  async function draftFromCard(key: string) {
    const d = await act({ action: "DRAFT", key }, key);
    const e = d?.outbox.find((x: any) => x.recKey === key && x.status !== "REJECTED");
    if (e) setMsgs((m) => [...m, { role: "assistant", content: "Draft ready. Nothing has been sent — review it, edit if needed, then approve.", cards: [{ kind: "email", id: e.id }], engine: "rules" }]);
  }

  const cur = (e: any) => edits[e.id] ?? { subject: e.subject, body: e.body, cc: e.cc };
  const dirty = (e: any) => { const c = edits[e.id]; return !!c && (c.subject !== e.subject || c.body !== e.body || c.cc !== e.cc); };
  const setEdit = (e: any, patch: any) => setEdits({ ...edits, [e.id]: { ...cur(e), ...patch } });
  const mode = store?.integration;
  const sendLabel = !mode ? "Approve & send" : mode.mode === "mock" ? "Approve & simulate send" : mode.delivery === "draft" ? "Approve & save to Outlook drafts" : "Approve & send via Outlook";

  function recCard(k: string) {
    const r = store?.recommendations.find((x) => x.key === k);
    if (!r) return null;
    const email = r.emailId ? store!.outbox.find((e) => e.id === r.emailId) : null;
    return (
      <div className={`alert ${r.severity}`} style={{ marginBottom: 0, padding: "10px 12px", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="at" style={{ fontSize: 11 }}>{r.title}</div>
          <div className="ad" style={{ fontSize: 10 }}>{r.rationale}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span className="tag">{TYPE_LABEL[r.type]}</span>
            {r.impactK !== null && <span className="tag">SAR {r.impactK}K</span>}
            <span className={`pill ${r.state === "SENT" ? "healthy" : r.state === "DRAFTED" ? "fix" : "hold"}`}>{r.state}</span>
            <div style={{ flex: 1 }} />
            {r.state === "OPEN" && r.channel === "EMAIL" && (
              <button className="btn" style={{ padding: "6px 10px", fontSize: 8 }} disabled={working === r.key} onClick={() => draftFromCard(r.key)}>{working === r.key ? "Drafting…" : "Draft email"}</button>
            )}
            {r.state === "OPEN" && r.channel === "INTERNAL" && <a className="btn" style={{ padding: "6px 10px", fontSize: 8, textDecoration: "none" }} href={r.href}>Decide →</a>}
            {r.state === "DRAFTED" && email && (
              <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 8 }} onClick={() => setMsgs((m) => [...m, { role: "assistant", content: "Here is the draft for that item.", cards: [{ kind: "email", id: email.id }], engine: "rules" }])}>Open draft</button>
            )}
            {r.state === "OPEN" && <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 8 }} onClick={() => act({ action: "DISMISS", key: r.key }, r.key)}>Dismiss</button>}
          </div>
        </div>
      </div>
    );
  }

  function emailCard(id: string) {
    const e = store?.outbox.find((x) => x.id === id);
    if (!e) return null;
    const c = cur(e);
    return (
      <div className="panel" style={{ padding: 12 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
          <div className="chart-label" style={{ margin: 0 }}>Email to {e.vendor}</div>
          <span className="tag">by {e.drafter}</span>
          <span className="tag">rev {e.revision}</span>
          {e.status === "REJECTED" && <span className="pill review">Rejected</span>}
          {e.status === "FAILED" && <span className="pill weak">Failed — retry</span>}
        </div>
        {e.status === "SENT" ? (
          <>
            <div className="muted" style={{ marginBottom: 8 }}>
              {e.delivery === "mock" ? "Simulated (not delivered)" : e.delivery === "draft" ? "Saved to Outlook drafts" : "Sent"} to {e.to} · approved by <b>{e.approvedBy}</b>
            </div>
            <div className="note" style={{ fontSize: 11, padding: 12 }}><b>{e.subject}</b>{"\n\n"}{e.body}</div>
          </>
        ) : e.status === "REJECTED" ? (
          <div className="muted">This draft was rejected and will not be sent.</div>
        ) : (
          <>
            {e.error && <div className="err" style={{ marginTop: 0, marginBottom: 10 }}>{e.error}</div>}
            <div className="field" style={{ marginBottom: 8 }}><label>To (fixed)</label><input className="in" value={e.to} readOnly /></div>
            <div className="field" style={{ marginBottom: 8 }}><label>Cc</label><input className="in" value={c.cc} onChange={(ev) => setEdit(e, { cc: ev.target.value })} /></div>
            <div className="field" style={{ marginBottom: 8 }}><label>Subject</label><input className="in" value={c.subject} onChange={(ev) => setEdit(e, { subject: ev.target.value })} /></div>
            <div className="field"><label>Message</label><textarea style={{ minHeight: 190 }} value={c.body} onChange={(ev) => setEdit(e, { body: ev.target.value })} /></div>
            <div className="field" style={{ marginTop: 8 }}>
              <label>Approving as</label>
              <input className="in" placeholder="Your name" value={approver} onChange={(ev) => { setApprover(ev.target.value); try { localStorage.setItem("approver", ev.target.value); } catch {} }} />
            </div>
            <label style={{ fontSize: 10, display: "flex", gap: 6, alignItems: "flex-start", margin: "10px 0" }}>
              <input type="checkbox" checked={!!reviewed[e.id + e.revision]} onChange={(ev) => setReviewed({ ...reviewed, [e.id + e.revision]: ev.target.checked })} />
              I have read this exact message and approve it{approver ? ` as ${approver}` : ""}
            </label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button className="btn" style={{ padding: "9px 12px", fontSize: 8 }} disabled={dirty(e) || !approver.trim() || !reviewed[e.id + e.revision] || working === e.id}
                title={dirty(e) ? "Save your changes first" : !approver.trim() ? "Enter your name" : ""}
                onClick={() => act({ action: "APPROVE_SEND", id: e.id, approver, revision: e.revision }, e.id)}>
                {working === e.id ? "Sending…" : sendLabel}
              </button>
              <button className="btn ghost" style={{ padding: "9px 12px", fontSize: 8 }} disabled={!dirty(e) || working === e.id} onClick={() => act({ action: "UPDATE", id: e.id, ...c }, e.id)}>Save changes</button>
              <button className="btn ghost" style={{ padding: "9px 12px", fontSize: 8 }} disabled={working === e.id} onClick={() => act({ action: "REJECT", id: e.id, approver }, e.id)}>Reject</button>
            </div>
            {mode?.mode === "mock" && <div className="muted" style={{ fontSize: 9, marginTop: 8 }}>Sample mode: approving records the send but nothing is delivered.</div>}
          </>
        )}
      </div>
    );
  }

  return (
    <>
      {!open && (
        <button className="chat-fab" onClick={() => setOpen(true)} aria-label="Open assistant">
          <span>Ask</span>
          {activeRecs.length > 0 && <span className={`chat-badge${urgent ? " hot" : ""}`}>{activeRecs.length}</span>}
        </button>
      )}
      {open && (
        <div className="chat-drawer">
          <div className="chat-head" style={{ justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}><span className="dot" />Marketing assistant</div>
            <button className="btn ghost" style={{ padding: "4px 10px", fontSize: 9 }} onClick={() => setOpen(false)}>Close</button>
          </div>
          <div className="chat-log" ref={logRef}>
            {msgs.length === 0 && (
              <div className="kmsg bot">
                <Rich text={`Ask me anything about the vendors, campaigns, results, sales conversion or supplier invoices.${store ? `\n\nThere are **${activeRecs.length} open recommendations** (${urgent} urgent). I can show them and draft the vendor emails — you approve every email before it goes.` : ""}`} />
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: m.role === "user" ? "flex-end" : "stretch" }}>
                <div className={`kmsg ${m.role === "user" ? "user" : "bot"}`} style={{ maxWidth: m.role === "user" ? "88%" : "100%" }}>
                  <Rich text={m.content} />
                  {m.role === "assistant" && m.engine === "rules" && i === msgs.findIndex((x) => x.engine === "rules") && (
                    <div className="muted" style={{ fontSize: 9, marginTop: 6 }}>Answered by built-in rules. Set ANTHROPIC_API_KEY for free-form answers from Claude.</div>
                  )}
                </div>
                {m.cards?.map((c, j) => <div key={j}>{c.kind === "rec" ? recCard(c.key) : emailCard(c.id)}</div>)}
              </div>
            ))}
            {busy && <div className="kmsg bot"><span className="spin dark" /> &nbsp;Thinking…</div>}
            {error && <div className="err" style={{ marginTop: 0 }}>{error}</div>}
          </div>
          <div className="chips">
            {(msgs.length === 0 ? SUGGESTIONS : SUGGESTIONS.slice(0, 3)).map((s) => <button key={s} className="chip" onClick={() => ask(s)} disabled={busy}>{s}</button>)}
          </div>
          <form className="chat-input" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
            <input placeholder="Ask about a vendor, campaign, invoice…" value={input} onChange={(e) => setInput(e.target.value)} />
            <button className="btn" type="submit" disabled={busy || !input.trim()}>Send</button>
          </form>
        </div>
      )}
    </>
  );
}
