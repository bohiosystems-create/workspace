"use client";

import { useEffect, useRef, useState } from "react";
import { closest } from "@/lib/chat-catalog";
import type { ChartSpec } from "@/lib/charts";
import type { LayoutView } from "@/lib/report-layout";
import type { CampaignLayoutView } from "@/lib/campaign-layout";
import { CampaignLayoutCard } from "./CampaignLayoutCard";
import { ChartView } from "./ChartView";
import { useI18n } from "./lang";
import { WorkingInline } from "./Working";
import { ReportLayoutCard } from "./ReportLayoutCard";

type Card = { kind: "rec"; key: string } | { kind: "email"; id: string } | { kind: "chart"; chart: ChartSpec } | { kind: "report"; view: LayoutView } | { kind: "campaigns"; view: CampaignLayoutView };
type Msg = { role: "user" | "assistant"; content: string; cards?: Card[]; engine?: string; model?: string; note?: string; api?: boolean; suggest?: string[]; flagged?: boolean };
type Store = { recommendations: any[]; outbox: any[]; integration: { mode: string; delivery: string; sender: string } };

const SUGGESTIONS = [
  "What's today's brief?",
  "Pie chart of revenue by vendor",
  "What needs my approval?",
  "What should I change in the campaigns?",
  "What do vendors owe us?",
  "When is my daily report?",
  "Which agency runs each Meta campaign?",
  "What's the budget plan for June?",
  "What should I do first?",
  "Which vendor converts best?",
  "Do vendor numbers match the CRM?",
  "Any invoice problems?",
  "Which contracts are ending?",
];
// Suggested questions are sent in the user's language so the answer comes back in it.
const SUGGESTIONS_AR: Record<string, string> = {
  "What's today's brief?": "ما موجز اليوم؟",
  "Pie chart of revenue by vendor": "رسم دائري للإيرادات حسب المورد",
  "What needs my approval?": "ما الذي ينتظر اعتمادي؟",
  "What should I change in the campaigns?": "ماذا أغيّر في الحملات؟",
  "What do vendors owe us?": "ما الذي يدين به الموردون لنا؟",
  "When is my daily report?": "متى يصلني التقرير اليومي؟",
  "Which agency runs each Meta campaign?": "أي وكالة تدير كل حملة على ميتا؟",
  "What's the budget plan for June?": "ما خطة الميزانية لشهر يونيو؟",
  "What should I do first?": "ماذا يجب أن أفعل أولاً؟",
  "Which vendor converts best?": "أي مورد يحقق أفضل تحويل؟",
  "Do vendor numbers match the CRM?": "هل أرقام الموردين تطابق نظام إدارة العملاء؟",
  "Any invoice problems?": "هل توجد مشاكل في الفواتير؟",
  "Which contracts are ending?": "أي العقود ستنتهي قريباً؟",
};
const TYPE_LABEL: Record<string, string> = {
  RENEWAL: "Renewal", DATA_MISMATCH: "Data", TEST_INCREMENTALITY: "Test", TRIAL: "Trial", CRM_MISMATCH: "CRM", SLA_BREACH: "SLA", CONTRACT_RENEWAL: "Contract", UNDERPERFORMING: "Performance", INVOICE_EXCEPTIONS: "Invoices",
  UNBILLED: "Unbilled", OVERDUE_PAYMENT: "Payment", REALLOCATE: "Budget", SCALE_UP: "Scale",
};

// Minimal markdown: **bold** and "- " bullets.
function Rich({ text }: { text: string }) {
  const bold = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>));
  return (
    <>
      {text.split("\n").map((l, i) =>
        l.startsWith("- ") ? <div key={i} style={{ paddingInlineStart: 12, textIndent: -10 }}>• {bold(l.slice(2))}</div> : l.trim() === "" ? <div key={i} style={{ height: 6 }} /> : <div key={i}>{bold(l)}</div>
      )}
    </>
  );
}

export default function Chat() {
  const { lang, t, N } = useI18n();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [busySince, setBusySince] = useState<number | null>(null);
  useEffect(() => setBusySince(busy ? Date.now() : null), [busy]);
  const [store, setStore] = useState<Store | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approver, setApprover] = useState("");
  const [edits, setEdits] = useState<Record<string, { subject: string; body: string; cc: string }>>({});
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  const [working, setWorking] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const langRef = useRef(lang);
  langRef.current = lang;
  async function refresh() {
    const asked = lang;
    try {
      const d = await (await fetch(`/api/recommendations?lang=${asked}`)).json();
      if (!d.error && asked === langRef.current) setStore(d); // drop stale-language responses
    } catch {}
  }
  useEffect(() => {
    try { setApprover(localStorage.getItem("approver") ?? ""); } catch {}
    refresh();
  }, [lang]);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [msgs, busy, open, store]);

  const activeRecs = store ? store.recommendations.filter((r) => r.state === "OPEN" || r.state === "DRAFTED") : [];
  const pending = store ? store.outbox.filter((e) => e.status === "DRAFT" || e.status === "FAILED") : [];
  const showDrafts = (list = pending) =>
    setMsgs((m) => [...m, { role: "assistant", content: list.length ? t("Drafts waiting for your approval:") : t("No drafts waiting for approval."), cards: list.map((e: any) => ({ kind: "email" as const, id: e.id })), engine: "rules" }]);
  // Other pages (e.g. "Send RFP to bench") create drafts and ask the assistant to show them for approval.
  useEffect(() => {
    const h = async () => {
      setOpen(true);
      const d = await (await fetch(`/api/recommendations?lang=${langRef.current}`)).json().catch(() => null);
      if (d && !d.error) { setStore(d); showDrafts(d.outbox.filter((e: any) => e.status === "DRAFT" || e.status === "FAILED")); }
    };
    const o = () => setOpen(true);
    window.addEventListener("open-drafts", h);
    window.addEventListener("open-director", o);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("open-drafts", h); window.removeEventListener("open-director", o); window.removeEventListener("keydown", esc); };
  });
  const urgent = activeRecs.filter((r) => r.severity === "crit").length;

  async function flag(i: number) {
    const m = msgs[i];
    setMsgs((all) => all.map((x, j) => (j === i ? { ...x, flagged: true } : x)));
    try { await fetch("/api/chat/miss", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: msgs[i - 1]?.content ?? "", answer: m.content, lang, engine: m.engine ?? "rules" }) }); } catch { /* best effort */ }
  }

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
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })), lang }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setMsgs([...next, { role: "assistant", content: d.reply, cards: d.cards, engine: d.engine, model: d.model, note: d.note, api: true, suggest: d.suggest }]);
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
      const res = await fetch("/api/recommendations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, lang }) });
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
    if (e) setMsgs((m) => [...m, { role: "assistant", content: t("Draft ready. Nothing has been sent — review it, edit if needed, then approve."), cards: [{ kind: "email", id: e.id }], engine: "rules" }]);
  }

  const cur = (e: any) => edits[e.id] ?? { subject: e.subject, body: e.body, cc: e.cc };
  const dirty = (e: any) => { const c = edits[e.id]; return !!c && (c.subject !== e.subject || c.body !== e.body || c.cc !== e.cc); };
  const setEdit = (e: any, patch: any) => setEdits({ ...edits, [e.id]: { ...cur(e), ...patch } });
  const mode = store?.integration;
  const sendLabel = t(!mode ? "Approve & send" : mode.mode === "mock" ? "Approve & simulate send" : mode.delivery === "draft" ? "Approve & save to Outlook drafts" : "Approve & send via Outlook");

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
            <span className="tag">{t(TYPE_LABEL[r.type] ?? r.type)}</span>
            {r.impactK !== null && <span className="tag">{lang === "ar" ? `${r.impactK} ألف ر.س` : `SAR ${r.impactK}K`}</span>}
            <span className={`pill ${r.state === "SENT" ? "healthy" : r.state === "DRAFTED" ? "fix" : "hold"}`}>{t(r.state)}</span>
            <div style={{ flex: 1 }} />
            {r.state === "OPEN" && r.channel === "EMAIL" && (
              <button className="btn" style={{ padding: "6px 10px", fontSize: 8 }} disabled={working === r.key} onClick={() => draftFromCard(r.key)}>{working === r.key ? t("Drafting…") : t("Draft email")}</button>
            )}
            {r.state === "OPEN" && r.channel === "INTERNAL" && <a className="btn" style={{ padding: "6px 10px", fontSize: 8, textDecoration: "none" }} href={r.href}>{t("Decide →")}</a>}
            {r.state === "DRAFTED" && email && (
              <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 8 }} onClick={() => setMsgs((m) => [...m, { role: "assistant", content: t("Here is the draft for that item."), cards: [{ kind: "email", id: email.id }], engine: "rules" }])}>{t("Open draft")}</button>
            )}
            {r.state === "OPEN" && <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 8 }} onClick={() => act({ action: "DISMISS", key: r.key }, r.key)}>{t("Dismiss")}</button>}
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
          <div className="chart-label" style={{ margin: 0 }}>{t("Email to")} {N(e.vendor)}</div>
          <span className="tag">{t("by")} {t(e.drafter)}</span>
          <span className="tag">{t("rev")} {e.revision}</span>
          {e.status === "REJECTED" && <span className="pill review">{t("Rejected")}</span>}
          {e.status === "FAILED" && <span className="pill weak">{t("Failed — retry")}</span>}
        </div>
        {e.status === "SENT" ? (
          <>
            <div className="muted" style={{ marginBottom: 8 }}>
              {t(e.delivery === "mock" ? "Simulated (not delivered)" : e.delivery === "draft" ? "Saved to Outlook drafts" : "Sent")} {t("to")} {e.to} · {t("approved by")} <b>{e.approvedBy}</b>
            </div>
            <div className="note" dir="auto" style={{ fontSize: 11, padding: 12 }}><b>{e.subject}</b>{"\n\n"}{e.body}</div>
          </>
        ) : e.status === "REJECTED" ? (
          <div className="muted">{t("This draft was rejected and will not be sent.")}</div>
        ) : (
          <>
            {e.error && <div className="err" style={{ marginTop: 0, marginBottom: 10 }}>{e.error}</div>}
            <div className="field" style={{ marginBottom: 8 }}><label>{t("To (fixed)")}</label><input className="in" dir="ltr" value={e.to} readOnly /></div>
            <div className="field" style={{ marginBottom: 8 }}><label>{t("Cc")}</label><input className="in" dir="ltr" value={c.cc} onChange={(ev) => setEdit(e, { cc: ev.target.value })} /></div>
            <div className="field" style={{ marginBottom: 8 }}><label>{t("Subject")}</label><input dir="auto" className="in" value={c.subject} onChange={(ev) => setEdit(e, { subject: ev.target.value })} /></div>
            <div className="field"><label>{t("Message")}</label><textarea dir="auto" style={{ minHeight: 190 }} value={c.body} onChange={(ev) => setEdit(e, { body: ev.target.value })} /></div>
            <div className="field" style={{ marginTop: 8 }}>
              <label>{t("Approving as")}</label>
              <input className="in" placeholder={t("Your name")} value={approver} onChange={(ev) => { setApprover(ev.target.value); try { localStorage.setItem("approver", ev.target.value); } catch {} }} />
            </div>
            <label style={{ fontSize: 10, display: "flex", gap: 6, alignItems: "flex-start", margin: "10px 0" }}>
              <input type="checkbox" checked={!!reviewed[e.id + e.revision]} onChange={(ev) => setReviewed({ ...reviewed, [e.id + e.revision]: ev.target.checked })} />
              {t("I have read this exact message and approve it")}{approver ? ` ${t("as")} ${approver}` : ""}
            </label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button className="btn" style={{ padding: "9px 12px", fontSize: 8 }} disabled={dirty(e) || !approver.trim() || !reviewed[e.id + e.revision] || working === e.id}
                title={dirty(e) ? t("Save your changes first") : !approver.trim() ? t("Enter your name") : ""}
                onClick={() => act({ action: "APPROVE_SEND", id: e.id, approver, revision: e.revision }, e.id)}>
                {working === e.id ? t("Sending…") : sendLabel}
              </button>
              <button className="btn ghost" style={{ padding: "9px 12px", fontSize: 8 }} disabled={!dirty(e) || working === e.id} onClick={() => act({ action: "UPDATE", id: e.id, ...c }, e.id)}>{t("Save changes")}</button>
              <button className="btn ghost" style={{ padding: "9px 12px", fontSize: 8 }} disabled={working === e.id} onClick={() => act({ action: "REJECT", id: e.id, approver }, e.id)}>{t("Reject")}</button>
            </div>
            {mode?.mode === "mock" && <div className="muted" style={{ fontSize: 9, marginTop: 8 }}>{t("Sample mode: approving records the send but nothing is delivered.")}</div>}
          </>
        )}
      </div>
    );
  }

  return (
    <>
      {!open && (
        <button className="chat-fab" onClick={() => setOpen(true)} aria-label="Open assistant">
          <span>{t("Ask")}</span>
          {activeRecs.length > 0 && <span className={`chat-badge${urgent ? " hot" : ""}`}>{activeRecs.length}</span>}
        </button>
      )}
      {open && (
        <div className="chat-drawer">
          <div className="chat-head" style={{ justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}><span className="dot" />{t("AI Assistant Director of Marketing")}</div>
            <button className="btn ghost" style={{ padding: "4px 10px", fontSize: 9 }} onClick={() => setOpen(false)}>{t("Close")}</button>
          </div>
          <div className="chat-log" ref={logRef}>
            {msgs.length === 0 && (
              <div className="kmsg bot">
                <Rich text={lang === "ar"
                  ? `أنا مساعد مدير التسويق الذكي. اسألوني عن الموردين والحملات والنتائج وتحويل الإنفاق إلى مبيعات والتحقق عبر نظام إدارة العملاء وفواتير الموردين.${store ? `\n\nهناك **${activeRecs.length} توصية مفتوحة** (${urgent} عاجلة). يمكنني عرضها وإعداد رسائل الموردين — وأنتم تعتمدون كل رسالة قبل إرسالها.` : ""}`
                  : `I'm your AI assistant director of marketing. Ask me anything about the vendors, campaigns, results, sales conversion, CRM verification or supplier invoices.${store ? `\n\nThere are **${activeRecs.length} open recommendations** (${urgent} urgent). I can show them and draft the vendor emails — you approve every email before it goes.` : ""}`} />
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: m.role === "user" ? "flex-end" : "stretch" }}>
                <div dir="auto" className={`kmsg ${m.role === "user" ? "user" : "bot"}`} style={{ maxWidth: m.role === "user" ? "88%" : "100%" }}>
                  <Rich text={m.content} />
                  {m.role === "assistant" && m.engine && m.engine !== "rules" && (
                    <div className="muted" style={{ fontSize: 9, marginTop: 6 }} dir="ltr">{({ anthropic: "Claude", openai: "OpenAI", gemini: "Gemini" } as Record<string, string>)[m.engine] ?? m.engine}{m.model ? ` · ${m.model}` : ""}</div>
                  )}
                  {m.role === "assistant" && m.engine === "rules" && m.api && (m.note || i === msgs.findIndex((x) => x.api && x.engine === "rules")) && (
                    <div className="muted" style={{ fontSize: 9, marginTop: 6 }}>{m.note ?? t("Answered by built-in rules. Add a Claude, OpenAI or Gemini API key for free-form answers.")}</div>
                  )}
                </div>
                {m.cards?.map((c, j) => <div key={j}>{c.kind === "rec" ? recCard(c.key) : c.kind === "chart" ? <ChartView spec={c.chart} /> : c.kind === "report" ? <ReportLayoutCard view={c.view} compact onUndo={i === msgs.length - 1 ? () => ask(lang === "ar" ? "تراجع عن آخر تعديل على التقرير" : "Undo the last report change") : undefined} /> : c.kind === "campaigns" ? <CampaignLayoutCard view={c.view} onUndo={i === msgs.length - 1 ? () => ask(lang === "ar" ? "تراجع عن آخر تعديل على لوحات الحملات" : "Undo the last campaign dashboard change") : undefined} /> : emailCard(c.id)}</div>)}
                {m.role === "assistant" && m.api && i === msgs.length - 1 && !busy && (() => {
                  // Safety net for questions nobody anticipated: the closest questions the assistant knows, and a way to
                  // say the answer missed (logged for review on the Reports page).
                  const asked = msgs[i - 1]?.content ?? "";
                  const near = (m.suggest?.length ? m.suggest : m.flagged ? closest(asked, lang === "ar" ? "ar" : "en", 3) : []).filter((x) => x !== asked);
                  const showNear = near.length > 0 && (m.engine === "rules" || m.flagged);
                  return (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                      {showNear && <span className="muted" style={{ fontSize: 9 }}>{m.flagged ? t("Thanks — noted for review. Closest questions I can answer:") : t("Related:")}</span>}
                      {showNear && near.map((x) => <button key={x} className="chip" style={{ fontSize: 10 }} onClick={() => ask(x)}>{x}</button>)}
                      {!m.flagged && <button className="chip" style={{ fontSize: 10, opacity: 0.75 }} onClick={() => flag(i)}>{t("Not what I asked")}</button>}
                    </div>
                  );
                })()}
              </div>
            ))}
            {busy && busySince && <div className="kmsg bot"><WorkingInline since={busySince} label={t("Thinking…")} /></div>}
            {error && <div className="err" style={{ marginTop: 0 }}>{error}</div>}
          </div>
          <div className="chips">
            {pending.length > 0 && <button className="chip" style={{ borderColor: "var(--ink)", color: "var(--ink)", fontWeight: 700 }} onClick={() => showDrafts()}>{t("Drafts to approve")} ({pending.length})</button>}
            {(msgs.length === 0 ? SUGGESTIONS : SUGGESTIONS.slice(0, 3)).map((s) => <button key={s} className="chip" onClick={() => ask(lang === "ar" ? SUGGESTIONS_AR[s] : s)} disabled={busy}>{lang === "ar" ? SUGGESTIONS_AR[s] : s}</button>)}
          </div>
          <form className="chat-input" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
            <input dir="auto" placeholder={t("Ask about a vendor, campaign, invoice…")} value={input} onChange={(e) => setInput(e.target.value)} />
            <button className="btn" type="submit" disabled={busy || !input.trim()}>{t("Send")}</button>
          </form>
        </div>
      )}
    </>
  );
}
