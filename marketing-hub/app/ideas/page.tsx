"use client";

import { useEffect, useRef, useState } from "react";
import Header from "../_components/Header";
import { useI18n } from "../_components/lang";
import { useApprover, openDrafts } from "../_components/useAgent";

const PROVIDER: Record<string, string> = { anthropic: "Claude", openai: "OpenAI", gemini: "Gemini", rules: "" };
const STATUS_PILL: Record<string, string> = { SHORTLISTED: "watch", APPROVED: "healthy", DISCARDED: "hold" };

export default function IdeasPage() {
  const { lang, t } = useI18n();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [srcFilter, setSrcFilter] = useState("");
  const [brief, setBrief] = useState<any>({ project: "", month: "", budgetK: "", goal: "", audience: "", notes: "", engine: "auto" });
  const [saved, save] = useApprover();
  const [approver, setApprover] = useState("");
  const langRef = useRef(lang);
  langRef.current = lang;
  useEffect(() => setApprover(saved), [saved]);

  useEffect(() => {
    let live = true;
    fetch(`/api/ideas?lang=${lang}`).then((r) => r.json()).then((x) => { if (!live) return; if (x.error) setError(x.error); else { setData(x); setBrief((b: any) => ({ ...b, month: b.month || x.defaults.month })); } }).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [lang]);

  async function act(body: any, key: string) {
    setBusy(key); setError(null); setInfo(null);
    try {
      const x = await (await fetch("/api/ideas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, approver, lang: langRef.current }) })).json();
      if (x.error) throw new Error(x.error);
      setData(x);
      if (x.result?.note) setInfo(x.result.note);
      if (x.result?.drafted) { setInfo(`${t("Brief drafted for")} ${x.result.drafted}. ${t("Review and approve it in the assistant before it is sent.")}`); openDrafts(); }
    } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }

  const runs: [string, any[]][] = data ? [...data.ideas.reduce((m: Map<string, any[]>, r: any) => m.set(r.runKey, [...(m.get(r.runKey) ?? []), r]), new Map()).entries()] : [];
  const set = (k: string) => (e: any) => setBrief({ ...brief, [k]: e.target.value });
  // Findings explained by another one are shown under it, not twice.
  const shown = data ? data.signals.filter((x: any) => !x.linkedTo && (!srcFilter || x.source === srcFilter || x.related.some((r: any) => r.source === srcFilter))) : [];

  return (
    <div className="shell">
      <Header />
      <div className="section-title">{t("Market initiatives")}</div>
      <p className="intro">{t("Campaigns, offers, partnerships, events, broker programmes, content, budget shifts and positioning — proposed from your data. Every day, before the report, all your data is scanned — the CRM, the email inbox, Oracle invoices and POs, social and ad platforms, competitors' ads, the market and the calendar — and each finding gets an initiative that answers it. Forecasts are computed from the 2023–2025 campaign history, not by the AI. Approving an initiative drafts a brief to the lead vendor for your approval.")}</p>
      {error && <div className="err">{error}</div>}
      {info && <div className="panel" style={{ marginBottom: 12 }}><div style={{ fontSize: 12.5 }}>{info}</div></div>}
      {!data && !error && <div className="muted"><span className="spin dark" /> {t("Loading…")}</div>}
      {data && (
        <>
          <div className="panel" style={{ marginBottom: 12 }}>
            <div className="chart-label">{t("What the data shows")} · {t("daily scan")} {data.crmAsOf ? new Date(data.crmAsOf).toLocaleDateString(lang === "ar" ? "ar-SA-u-nu-latn" : "en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "0 0 8px" }}>
              {data.sources.map((x: any) => (
                <button key={x.source} className={`chip${srcFilter === x.source ? " on" : ""}`} style={{ fontSize: 10 }} title={x.note ?? ""} onClick={() => setSrcFilter(srcFilter === x.source ? "" : x.source)}>
                  {x.label} · <span dir="ltr">{x.items.toLocaleString("en")}</span> {x.unit}{x.found ? <b> → {x.found}</b> : null}
                </button>
              ))}
            </div>
            {shown.length === 0 && <div className="muted" style={{ fontSize: 12 }}>{t("Nothing unusual in any source today.")}</div>}
            {shown.map((sg: any) => (
              <div key={sg.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderTop: "1px solid var(--line)", flexWrap: "wrap" }}>
                <span className={`pill ${sg.direction === "up" ? "healthy" : sg.severity === "crit" ? "weak" : "watch"}`} style={{ flex: "none" }}>{sg.direction === "up" ? t("Opportunity") : sg.severity === "crit" ? t("Urgent") : t("Watch")}</span>
                <div style={{ flex: "1 1 320px", fontSize: 12, lineHeight: 1.55 }}>
                  <span className="tag" style={{ marginInlineEnd: 6 }}>{sg.sourceLabel}</span><b>{sg.title}</b>
                  <div className="muted" style={{ fontSize: 11.5 }}>{sg.why}</div>
                  {sg.related.length > 0 && <div style={{ fontSize: 11, marginTop: 3 }}>{sg.related.map((r: any) => <div key={r.id}>↳ <span className="muted">{r.sourceLabel}:</span> {r.title}</div>)}</div>}
                </div>
                {(sg.projectKey || sg.scope === "portfolio") && <button className="btn ghost" style={{ padding: "5px 10px", fontSize: 8, flex: "none" }} disabled={busy === sg.id} title={!sg.projectKey ? t("For the project chosen in the brief (or the one furthest behind target)") : ""} onClick={() => act({ action: "GENERATE", brief: { project: sg.projectKey || brief.project || undefined, signalId: sg.id, engine: brief.engine } }, sg.id)}>{busy === sg.id ? t("Thinking…") : t("Initiatives for this")}</button>}
              </div>
            ))}
          </div>
          <div className="panel">
            <div className="chart-label">{t("Brief")}</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div className="field" style={{ width: 200 }}><label>{t("Project")}</label>
                <select className="in" value={brief.project} onChange={set("project")}><option value="">{t("Furthest behind target")}</option>{data.defaults.projects.map((p: any) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
              <div className="field" style={{ width: 150 }}><label>{t("Month")}</label><input className="in" type="month" value={brief.month} onChange={set("month")} /></div>
              <div className="field" style={{ width: 130 }}><label>{t("Budget (SAR K)")}</label><input className="in" type="number" min={20} placeholder={t("auto")} value={brief.budgetK} onChange={set("budgetK")} /></div>
              <div className="field" style={{ width: 180 }}><label>{t("Goal")}</label>
                <select className="in" value={brief.goal} onChange={set("goal")}><option value="">{t("From the target gap")}</option>{data.defaults.goals.map((g: any) => <option key={g.value} value={g.value}>{g.label}</option>)}</select></div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              <div className="field" style={{ flex: "1 1 260px" }}><label>{t("Audience (optional)")}</label><input className="in" dir="auto" value={brief.audience} onChange={set("audience")} placeholder={t("e.g. young families in Jeddah, investors")} /></div>
              <div className="field" style={{ flex: "2 1 320px" }}><label>{t("Anything else (optional)")}</label><input className="in" dir="auto" value={brief.notes} onChange={set("notes")} placeholder={t("e.g. new phase release, show unit ready in August, avoid outdoor")} /></div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
              <button className="btn" disabled={busy === "gen"} onClick={() => act({ action: "GENERATE", brief: { ...brief, engine: brief.engine } }, "gen")}>{busy === "gen" ? t("Thinking…") : t("Generate initiatives")}</button>
              {data.ai.enabled && (
                <label className="muted" style={{ fontSize: 11 }}><input type="checkbox" checked={brief.engine === "rules"} onChange={(e) => setBrief({ ...brief, engine: e.target.checked ? "rules" : "auto" })} /> {t("Built-in rules only (no AI)")}</label>
              )}
              <span className="muted" style={{ fontSize: 11 }} dir="auto">
                {data.ai.enabled
                  ? `${t("Ideas by")} ${data.ai.ideate.map((p: string) => PROVIDER[p]).join(" + ")}${data.ai.judge ? ` · ${t("ranked by")} ${PROVIDER[data.ai.judge]}` : ""}`
                  : t("Built-in ideas (no AI key). With a Claude, OpenAI or Gemini key, two models propose ideas and a third step ranks them against your data.")}
              </span>
            </div>
          </div>

          <div className="row twocol" style={{ marginTop: 12 }}>
            <div className="panel">
              <div className="field" style={{ width: 220 }}><label>{t("Deciding as")}</label><input className="in" placeholder={t("Your name")} value={approver} onChange={(e) => { setApprover(e.target.value); save(e.target.value); }} /></div>
            </div>
            <div className="panel"><div className="muted" style={{ fontSize: 11.5 }}>{t("Shortlist the ideas worth discussing; approving one drafts a campaign brief to its lead vendor. Nothing is sent and no money is committed until you approve the email and the vendor's proposal.")}</div></div>
          </div>

          {runs.length === 0 && <div className="panel" style={{ marginTop: 14 }}><div className="muted">{t("No initiatives yet. Fill in the brief (or leave it empty for the project furthest behind target) and generate, or answer a CRM signal above.")}</div></div>}
          {runs.map(([run, ideas]) => (
            <div key={run} style={{ marginTop: 18 }}>
              <div className="chart-label">{ideas[0].brief.projectLabel} · {ideas[0].brief.monthLabel} · {ideas[0].brief.seasonLabel} · {ideas[0].brief.goalLabel} · <span dir="ltr">{lang === "ar" ? `${ideas[0].brief.budgetK} ألف ر.س` : `SAR ${ideas[0].brief.budgetK}K`}</span></div>
              {ideas.map((x: any) => <IdeaCard key={x.id} x={x} t={t} lang={lang} busy={busy} approver={approver} act={act} />)}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function IdeaCard({ x, t, lang, busy, approver, act }: any) {
  const [note, setNote] = useState("");
  const f = x.forecast;
  const sar = (k: number) => (lang === "ar" ? `${k} ألف ر.س` : `SAR ${k}K`);
  const sarM = (a: number, b: number) => (lang === "ar" ? `${a}–${b} مليون ر.س` : `SAR ${a}–${b}M`);
  return (
    <div className="panel" style={{ marginTop: 10, opacity: x.status === "DISCARDED" ? 0.6 : 1 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <b style={{ fontSize: 15 }}>{x.title}</b>
        {x.status !== "NEW" && <span className={`pill ${STATUS_PILL[x.status] ?? ""}`}>{t(x.status)}{x.decidedBy ? ` · ${x.decidedBy}` : ""}</span>}
        {x.score !== null && x.score !== undefined && <span className="tag" dir="ltr">{x.score}/10</span>}
        <span className="muted" style={{ fontSize: 10 }} dir="ltr">{x.source === "rules" ? t("Built-in") : `${PROVIDER[x.source] ?? x.source}${x.model ? ` · ${x.model}` : ""}`}{x.judge ? ` → ${PROVIDER[x.judge.by]}` : ""}</span>
        <span className="tag">{x.kindLabel}</span>
        <span className="tag" dir="ltr">{x.campaignCode}</span>
      </div>
      {x.trigger && <div style={{ fontSize: 12, marginTop: 6, padding: "5px 9px", borderInlineStart: "3px solid var(--alert)", background: "var(--paper)" }}>{t("Answers")}: <b>{x.trigger.title}</b><div className="muted" style={{ fontSize: 11 }}>{x.trigger.why}</div></div>}
      <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.55 }}>{x.bigIdea}</div>
      <div className="row twocol" style={{ marginTop: 8, gap: 12 }}>
        <div style={{ fontSize: 12, lineHeight: 1.6 }}>
          <div><b>{t("Audience")}:</b> {x.audience}</div>
          <div><b>{t("Offer")}:</b> {x.offer}</div>
          <div><b>{t("Headline")}:</b> “{x.headline}”</div>
          {x.judge?.why && <div className="muted" style={{ marginTop: 4 }}><b>{t("Why it should work")}:</b> {x.judge.why}{x.judge.improve ? ` ${t("Improve")}: ${x.judge.improve}` : ""}</div>}
        </div>
        <div>
          <div className="kpis" style={{ marginBottom: 0 }}>
            <div className="kpi"><div className="kv" dir="ltr">{f.contracts[0]}–{f.contracts[2]}</div><div className="kl">{t("Contracts (range)")}</div></div>
            <div className="kpi"><div className="kv" dir="ltr" style={{ fontSize: 15 }}>{sarM(f.salesM[0], f.salesM[2])}</div><div className="kl">{t("Sales (range)")}</div></div>
            <div className="kpi"><div className="kv">{f.costToSalesPct}%</div><div className="kl">{t("Cost to sales")}</div></div>
          </div>
          {f.targetNextM !== null && <div className="muted" style={{ fontSize: 10.5, marginTop: 4 }}>{t("Monthly sales target for the project")}: {lang === "ar" ? `${f.targetNextM} مليون ر.س` : `SAR ${f.targetNextM}M`}</div>}
        </div>
      </div>
      <table className="tbl" style={{ marginTop: 10, fontSize: 11.5, width: "100%" }}>
        <thead><tr><th>{t("Channel")}</th><th>{t("Share")}</th><th>{t("Spend")}</th><th>{t("Role")}</th><th>{t("Vendor")}</th><th>{t("Expected cost to sales")}</th></tr></thead>
        <tbody>{x.channels.map((ch: any) => (
          <tr key={ch.family}><td>{ch.label}</td><td dir="ltr">{ch.sharePct}%</td><td dir="ltr">{sar(ch.spendK)}</td><td>{ch.role}</td><td>{ch.vendor} <span className="muted" style={{ fontSize: 10 }}>({ch.vendorNote})</span></td><td dir="ltr">{ch.ctsPct}%</td></tr>
        ))}</tbody>
      </table>
      {x.cautions.length > 0 && <div style={{ fontSize: 11.5, marginTop: 8, color: "var(--alert)" }}>{x.cautions.map((c: string, i: number) => <div key={i}>⚠ {c}</div>)}</div>}
      <details style={{ marginTop: 8 }}>
        <summary className="muted" style={{ cursor: "pointer", fontSize: 11 }}>▸ {t("Guardrails, measurement, evidence and risks")}</summary>
        <ul style={{ fontSize: 11.5, lineHeight: 1.6, paddingInlineStart: 18 }}>
          {x.guardrails.map((g: string, i: number) => <li key={`g${i}`}>{g}</li>)}
          <li>{x.measurement}</li>
          {x.forecast.adjustments.map((a: string, i: number) => <li key={`a${i}`} className="muted">{a}</li>)}
          {x.risks.map((r: string, i: number) => <li key={`r${i}`}>{t("Risk")}: {r}</li>)}
          {x.evidence.map((e: any) => <li key={e.code} className="muted"><span dir="ltr">{e.code}</span> — {e.name}: {e.costToSalesPct}% {t("cost to sales")}. {e.lesson}</li>)}
        </ul>
      </details>
      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
        {x.status !== "APPROVED" && <>
          {x.status !== "SHORTLISTED" && <button className="btn ghost" style={{ padding: "5px 10px", fontSize: 8 }} disabled={!approver.trim() || busy === x.id} onClick={() => act({ action: "DECIDE", id: x.id, decision: "SHORTLIST", note }, x.id)}>{t("Shortlist")}</button>}
          <button className="btn" style={{ padding: "5px 10px", fontSize: 8 }} disabled={!approver.trim() || busy === x.id} title={!approver.trim() ? t("Enter your name") : ""} onClick={() => act({ action: "DECIDE", id: x.id, decision: "APPROVE", note }, x.id)}>{t("Approve & draft vendor brief")}</button>
          {x.status !== "DISCARDED" && <button className="btn ghost" style={{ padding: "5px 10px", fontSize: 8 }} disabled={!approver.trim() || busy === x.id} onClick={() => act({ action: "DECIDE", id: x.id, decision: "DISCARD", note }, x.id)}>{t("Discard")}</button>}
          <input className="in" style={{ width: 200, padding: "4px 8px", fontSize: 11 }} placeholder={t("Note (optional)")} value={note} onChange={(e) => setNote(e.target.value)} />
        </>}
        {x.status !== "NEW" && <button className="btn ghost" style={{ padding: "5px 10px", fontSize: 8 }} disabled={!approver.trim() || busy === x.id} onClick={() => act({ action: "DECIDE", id: x.id, decision: "REOPEN" }, x.id)}>{t("Reopen")}</button>}
        {x.leadVendor && <span className="muted" style={{ fontSize: 10.5 }}>{t("Lead vendor")}: {x.leadVendor}</span>}
      </div>
    </div>
  );
}
