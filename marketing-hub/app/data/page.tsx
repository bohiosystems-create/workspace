"use client";

import { useEffect, useState } from "react";
import Header from "../_components/Header";
import { saveFile } from "../_components/saveFile";
import { useI18n } from "../_components/lang";
import { useAgent, useApprover } from "../_components/useAgent";

const SOURCE: Record<string, [string, string]> = {
  VENDOR_REPORTS: ["Vendor reports", "Monthly report per campaign, in one canonical template (CSV upload or API)."],
  META: ["Meta ads (Facebook / Instagram)", "Ad accounts, campaigns, who created them and their tracking codes — the agent works out which agency runs each campaign."],
  ADS: ["Ad accounts", "Meta, Google, Snap, TikTok — what the platforms say was actually spent and delivered."],
  CRM: ["CRM", "Every lead, its stage, first response time and deal value — the record of truth for results."],
  ORACLE: ["Oracle (purchasing & payables)", "Purchase orders and supplier invoices — the record of truth for cost."],
  OUTLOOK: ["Outlook", "Vendor emails, sent only after human approval."],
  DELIVERABLES: ["Deliverables tracker", "Due dates, delivery dates and revision rounds per vendor."],
  MMM_HISTORY: ["Media-mix history", "Weekly spend per channel and total sales, for the media-mix model."],
};
const TRUTH: [string, string][] = [
  ["Cost", "Oracle invoices + accrued delivery not yet invoiced (vendor report only as fallback)"],
  ["Leads, qualified leads, wins, sales", "CRM"],
  ["Pipeline", "CRM open opportunities, stage-weighted (qualified 10%, viewing 25%, reserved 60%)"],
  ["Response time", "CRM (first human response)"],
  ["Media delivered", "Ad platforms (checks the vendor's reported media spend)"],
  ["Deadlines and revisions", "Deliverables tracker"],
];

export default function DataPage() {
  const { t, N, k, dm, lang } = useI18n();
  const { data, error, setError, busy, act } = useAgent();
  const [result, setResult] = useState<any>(null);

  async function upload(f: File | undefined) {
    if (!f) return;
    const csv = await f.text();
    const r = await act({ action: "IMPORT_REPORT", csv, fileName: f.name }, "upload");
    if (r) setResult(r.imported);
  }
  async function template() {
    try {
      const text = await (await fetch("/api/ingest/vendor-report")).text();
      await saveFile("vendor-report-template.csv", text, "text/csv");
    } catch (e: any) { setError(e.message); }
  }
  // Deep link (/data#meta): scroll once the panel exists (data loads after navigation).
  useEffect(() => { if (data && window.location.hash === "#meta") document.getElementById("meta")?.scrollIntoView({ behavior: "smooth" }); }, [!!data]);
  const pct = (a: number | null, b: number | null) => (a === null || b === null || !a ? null : Math.round(((b - a) / a) * 100));
  const Gap = ({ v }: { v: number | null }) => v === null ? <span className="muted">—</span> : <span className={Math.abs(v) > 5 ? "bad" : "ok"}>{v > 0 ? "+" : ""}{v}%</span>;

  return (
    <div className="shell">
      <Header />
      <div className="section-title">{t("Data sources")}</div>
      <p className="intro">{t("Every vendor's reporting, the ad accounts, the CRM and the invoices in one model — each metric taken from an independent source of truth, so vendors are no longer grading their own homework.")}</p>
      {error && <div className="err">{error}</div>}
      {!data && !error && <div className="muted"><span className="spin dark" /> {t("Loading…")}</div>}

      {data && (
        <>
          <div className="panel">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
              <div className="chart-label" style={{ margin: 0 }}>{t("Sources")}</div>
              <div style={{ flex: 1 }} />
              <button className="btn ghost" style={{ padding: "7px 14px", fontSize: 9 }} disabled={busy === "ads"} onClick={() => act({ action: "SYNC_ADS" }, "ads")}>{busy === "ads" ? t("Syncing…") : t("Sync ad accounts")}</button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="dtable">
                <thead><tr><th>{t("Source")}</th><th>{t("Mode")}</th><th>{t("Status")}</th><th>{t("Last sync")}</th><th className="num">{t("Records")}</th><th className="num">{t("Coverage")}</th></tr></thead>
                <tbody>
                  {data.sources.map((s: any) => (
                    <tr key={s.key}>
                      <td><b>{t(SOURCE[s.key]?.[0] ?? s.key)}</b><div className="muted" style={{ fontSize: 9, maxWidth: 360 }}>{t(SOURCE[s.key]?.[1] ?? "")}</div></td>
                      <td><span className="tag" dir="ltr">{s.mode}</span></td>
                      <td><span className={`pill ${s.connected ? "healthy" : "hold"}`}>{s.connected ? t("Connected") : t("Not connected")}</span></td>
                      <td>{s.lastSync ? dm(s.lastSync) : "—"}</td>
                      <td className="num">{s.records.toLocaleString("en-GB")}</td>
                      <td className="num">{s.coverage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="muted" style={{ fontSize: 10, marginTop: 8 }}>{t("\"mock\" = sample data in the real format. Real connections are switched on per source in the environment settings (see docs/data-sources.md).")}</div>
          </div>

          <div className="row twocol" style={{ marginTop: 18 }}>
            <div className="panel">
              <div className="chart-label">{t("Source of truth per metric")}</div>
              <table className="rd-table"><tbody>{TRUTH.map(([a, b]) => <tr key={a}><td><b>{t(a)}</b></td><td>{t(b)}</td></tr>)}</tbody></table>
            </div>
            <div className="panel">
              <div className="chart-label">{t("Upload a vendor report")}</div>
              <p className="muted" style={{ marginTop: 0 }}>{t("Vendors fill in one canonical monthly template (one row per campaign and month). Uploads are validated — unknown campaign codes and funnels that do not narrow are rejected — and replace that month's reported figures.")}</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button className="btn ghost" onClick={template}>{t("Download template")}</button>
                <label className="btn" style={{ cursor: "pointer" }}>
                  {busy === "upload" ? t("Importing…") : t("Upload CSV")}
                  <input type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
                </label>
              </div>
              {result && (
                <div style={{ marginTop: 12, fontSize: 12 }}>
                  <b>{result.accepted}</b> {t("rows imported")} ({result.created} {t("new")}{lang === "ar" ? "، " : ", "}{result.updated} {t("updated")}){lang === "ar" ? "؛ " : "; "}<b className={result.rejected.length ? "bad" : ""}>{result.rejected.length}</b> {t("rejected")}
                  {result.rejected.length > 0 && <ul style={{ fontSize: 11 }}>{result.rejected.map((r: any) => <li key={r.line}>{t("Line")} {r.line}: {r.reason}</li>)}</ul>}
                </div>
              )}
              <div className="muted" style={{ fontSize: 10, marginTop: 12, lineHeight: 1.6 }} dir="ltr">
                POST /api/ingest/ad-spend · POST /api/ingest/vendor-report · POST /api/crm/leads — header x-api-key
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: 18 }}>
            <div className="chart-label">{t("What vendors report vs independent sources")}</div>
            <div style={{ overflowX: "auto" }}>
              <table className="dtable">
                <thead>
                  <tr>
                    <th>{t("Vendor")}</th>
                    <th className="num">{t("Spend reported")}</th><th className="num">{t("Ad platforms")}</th><th className="num">{t("Gap")}</th><th className="num">{t("Cost (Oracle)")}</th>
                    <th className="num">{t("Leads reported")}</th><th className="num">{t("CRM")}</th><th className="num">{t("Gap")}</th>
                    <th className="num">{t("Contracts claimed")}</th><th className="num">{t("Won (CRM)")}</th>
                    <th className="num">{t("Response reported (h)")}</th><th className="num">{t("CRM (h)")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.vendors.map((v: any) => (
                    <tr key={v.id}>
                      <td><b>{N(v.name)}</b>{v.flags.map((f: any) => <div key={f.code} className={f.severity === "crit" ? "bad" : "muted"} style={{ fontSize: 9, marginTop: 3 }}>{f.text}</div>)}</td>
                      <td className="num">{k(v.digitalReportedSpendK || v.reported.spendK)}</td>
                      <td className="num">{v.platformSpendK === null ? "—" : k(v.platformSpendK)}</td>
                      <td className="num"><Gap v={v.platformSpendK === null ? null : pct(v.digitalReportedSpendK, v.platformSpendK)} /></td>
                      <td className="num">{k(v.verified.costK)}</td>
                      <td className="num">{v.reported.leads}</td>
                      <td className="num">{v.verified.leads}</td>
                      <td className="num"><Gap v={pct(v.reported.leads, v.verified.leads)} /></td>
                      <td className="num">{v.reported.contracts}</td>
                      <td className="num">{v.verified.won}</td>
                      <td className="num">{v.reported.respHrs ?? "—"}</td>
                      <td className="num" style={v.reported.respHrs && v.verified.respHrs && v.verified.respHrs > v.reported.respHrs * 1.2 ? { color: "var(--alert)", fontWeight: 700 } : {}}>{v.verified.respHrs ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="muted" style={{ fontSize: 10, marginTop: 8 }}>{t("Spend gap compares digital media only (ad platforms cover Google, Meta, Snap and TikTok campaigns).")} {lang === "ar" ? "" : ""}</div>
          </div>
          {data.meta && <MetaPanel m={data.meta} act={act} busy={busy} />}
          <AiPanel />
        </>
      )}
    </div>
  );
}

const KIND: Record<string, [string, string]> = {
  VENDOR: ["Agency", "live"], IN_HOUSE: ["In-house", "hold"], UNKNOWN_AGENCY: ["Not one of your agencies", "weak"], CONFLICT: ["Conflicting evidence", "watch"], UNRESOLVED: ["Unknown", "hold"],
};
const CONF: Record<string, string> = { HIGH: "healthy", MEDIUM: "fix", LOW: "weak" };

function MetaPanel({ m, act, busy }: { m: any; act: (b: any, k: string) => Promise<any>; busy: string | null }) {
  const { t, N, k } = useI18n();
  const [saved, save] = useApprover();
  const [approver, setApprover] = useState<string | null>(null);
  const name = approver ?? saved;
  const [pick, setPick] = useState<Record<string, { target: string; code: string; remember: boolean }>>({});
  const sel = (c: any) => pick[c.id] ?? { target: c.vendorId ?? c.suggested[0] ?? (c.kind === "UNKNOWN_AGENCY" ? "UNKNOWN" : c.kind === "IN_HOUSE" ? "IN_HOUSE" : ""), code: c.code ?? "", remember: false };
  const set = (c: any, p: any) => setPick({ ...pick, [c.id]: { ...sel(c), ...p } });
  const codesOf = (vid: string) => m.vendorOptions.find((v: any) => v.id === vid)?.codes ?? [];
  const s = m.summary;
  return (
    <div className="panel" id="meta" style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <div className="chart-label" style={{ margin: 0 }}>{t("Meta ads — which agency runs each campaign")}</div>
        <span className="tag" dir="ltr">meta · {m.mode}</span>
        <div style={{ flex: 1 }} />
        <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 8 }} disabled={busy === "meta-sync"} onClick={() => act({ action: "META_SYNC" }, "meta-sync")}>{t("Sync now")}</button>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: "0 0 12px", maxWidth: 820 }}>{t("Meta doesn't say which agency runs a campaign. The agent works it out from the campaign code in the name, the utm_campaign on the ads, who created the campaign (ad-account activity log) and who owns the ad account — and asks you when the evidence is weak or conflicting. Only attributed spend counts towards checking a vendor's reported media spend.")}</p>
      <div className="kpis" style={{ marginBottom: 12 }}>
        <div className="kpi"><div className="kv">{k(s.spendK)}</div><div className="kl">{t("Meta spend")}</div><div className="kd">{s.campaigns} {t("campaigns")}</div></div>
        <div className="kpi"><div className="kv">{s.attributedPct}%</div><div className="kl">{t("Attributed to an agency")}</div><div className="kd">{k(s.attributedK)}</div></div>
        <div className="kpi"><div className="kv" style={s.unknownK ? { color: "var(--alert)" } : {}}>{k(s.unknownK)}</div><div className="kl">{t("Not one of your agencies")}</div></div>
        <div className="kpi"><div className="kv" style={s.conflictK ? { color: "var(--alert)" } : {}}>{k(s.conflictK)}</div><div className="kl">{t("Unclear — to confirm")}</div></div>
        <div className="kpi"><div className="kv">{k(s.inHouseK)}</div><div className="kl">{t("In-house")}</div></div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {s.byVendor.map((v: any) => <span key={v.vendorId} className="tag" style={{ fontSize: 9 }}>{v.vendor}: {k(v.spendK)} · {v.campaigns} {t("campaigns")}</span>)}
      </div>
      <div style={{ marginBottom: 12 }}>
        {m.accounts.map((a: any) => (
          <div key={a.id} className="logrow">
            <div style={{ flex: 1 }}>
              <b>{a.name}</b> <span className="muted" dir="ltr">{a.id}</span>
              <div className="muted" style={{ fontSize: 10 }}>
                {t("Owner")}: {a.owner ?? "—"} ({t(a.ownerIs === "CLIENT" ? "you" : a.ownerIs === "VENDOR" ? "an agency" : "unknown")}) · {t("Partners with access")}: {a.agencies.length ? a.agencies.map((g: any, i: number) => <span key={i} className={g.known ? "" : "bad"}>{i ? ", " : ""}{g.name}{g.known ? "" : ` (${t("not a vendor")})`}</span>) : "—"}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="field" style={{ width: 220, marginBottom: 10 }}><label>{t("Confirming as")}</label><input className="in" placeholder={t("Your name")} value={name} onChange={(e) => { setApprover(e.target.value); save(e.target.value); }} /></div>
      <table className="dtable">
        <thead><tr><th>{t("Meta campaign")}</th><th>{t("Created by")}</th><th className="num">{t("Spend")}</th><th>{t("Agency · code")}</th><th>{t("Evidence")}</th></tr></thead>
        <tbody>
          {m.campaigns.map((c: any) => {
            const p = sel(c);
            return (
              <tr key={c.id} style={c.needsReview ? { background: "rgba(255,77,106,0.05)" } : {}}>
                <td style={{ minWidth: 180 }}><b>{c.name}</b><div className="muted" style={{ fontSize: 9 }}>{c.account} · {c.status.toLowerCase()}{c.utm.length ? <> · <span dir="ltr">utm {c.utm.join(", ")}</span></> : ""}</div></td>
                <td style={{ fontSize: 11 }}>{c.creator ?? "—"}</td>
                <td className="num">{k(c.spendK)}<div className="muted" style={{ fontSize: 9 }}>{c.leads} {t("leads")}</div></td>
                <td style={{ minWidth: 170 }}>
                  <span className={`pill ${KIND[c.kind]?.[1] ?? "hold"}`} style={{ display: "inline-block" }}>{t(KIND[c.kind]?.[0] ?? c.kind)}</span>{" "}
                  {c.kind === "VENDOR" && <span className={`pill ${CONF[c.confidence]}`} style={{ display: "inline-block" }}>{t(c.confidence)}</span>}
                  {c.vendor && <div style={{ marginTop: 4 }}><b>{c.vendor}</b>{c.code ? <span className="muted" dir="ltr"> · {c.code}</span> : ""}</div>}
                  {c.review === "CONFIRMED" && <div className="muted" style={{ fontSize: 9, marginTop: 3 }}>{t("confirmed by")} {c.reviewedBy}</div>}
                </td>
                <td style={{ fontSize: 11, minWidth: 240 }}>
                  <ul style={{ margin: 0, paddingInlineStart: 14 }}>{c.signals.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>
                  {c.flags.filter((f: any) => f.code !== "IN_HOUSE" && f.code !== "UNKNOWN_AGENCY").map((f: any) => <div key={f.code} className="bad" style={{ fontSize: 10, marginTop: 3 }}>⚠ {f.text}</div>)}
                  {c.needsReview && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
                      <select className="in" style={{ width: 170, padding: "5px 6px" }} value={p.target} onChange={(e) => set(c, { target: e.target.value, code: codesOf(e.target.value)[0] ?? "" })}>
                        <option value="">{t("Who runs it?")}</option>
                        {m.vendorOptions.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                        <option value="IN_HOUSE">{t("In-house")}</option>
                        <option value="UNKNOWN">{t("Not one of your agencies")}</option>
                      </select>
                      {p.target && p.target !== "IN_HOUSE" && p.target !== "UNKNOWN" && (
                        <select className="in" dir="ltr" style={{ width: 140, padding: "5px 6px" }} value={p.code || codesOf(p.target)[0] || ""} onChange={(e) => set(c, { code: e.target.value })}>
                          {codesOf(p.target).map((x: string) => <option key={x} value={x}>{x}</option>)}
                        </select>
                      )}
                      {!c.creatorKnown && c.creator && p.target !== "UNKNOWN" && <label className="muted" style={{ fontSize: 10, display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={p.remember} onChange={(e) => set(c, { remember: e.target.checked })} />{t("Remember this creator")}</label>}
                      <button className="btn" style={{ padding: "6px 10px", fontSize: 8 }} disabled={!name.trim() || !p.target || busy === c.id} title={!name.trim() ? t("Enter your name") : ""}
                        onClick={() => act({ action: "META_ASSIGN", id: c.id, target: p.target, code: p.code || codesOf(p.target)[0] || null, remember: p.remember && !c.creatorKnown, approver: name }, c.id)}>{t("Confirm")}</button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const PROVIDER_NAME: Record<string, string> = { anthropic: "Claude", openai: "OpenAI", gemini: "Gemini" };
// AI providers and the task router (lib/llm.ts): which provider each kind of work goes to, and the fallbacks.
function AiPanel() {
  const { lang, t } = useI18n();
  const [ai, setAi] = useState<any>(null);
  useEffect(() => { fetch("/api/ai").then((r) => r.json()).then(setAi).catch(() => setAi(null)); }, []);
  if (!ai) return null;
  const s = ai.status, tasks = Object.entries(ai.tasks) as [string, any][];
  return (
    <div className="panel" id="ai" style={{ marginTop: 18 }}>
      <div className="chart-label">{t("AI providers and task routing")}</div>
      <p className="muted" style={{ fontSize: 11.5, marginTop: 0 }}>{t("Each kind of AI work goes to the provider best suited to it among those with a key; if it fails, the next one answers. Without any key the app runs on its built-in rules. Change the order per task with LLM_ROUTE_<TASK> in .env.")}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {(["anthropic", "openai", "gemini"] as const).map((p) => (
          <span key={p} className={`pill ${s.keys[p] ? "healthy" : "hold"}`} dir="ltr">{PROVIDER_NAME[p]} · {p === "gemini" ? `${s.models.gemini} / ${s.models.geminiFast}` : s.models[p]} · {s.keys[p] ? (/account/.test(String(s.models[p])) ? t("your Claude account") : t("key set")) : t("no key")}</span>
        ))}
      </div>
      <table className="tbl" style={{ width: "100%", fontSize: 11.5 }}>
        <thead><tr><th>{t("Task")}</th><th>{t("Routed to (in order)")}</th><th>{t("Why")}</th></tr></thead>
        <tbody>{tasks.map(([k, v]) => {
          const live = s.routes?.find((r: any) => r.task === k);
          const order: string[] = live?.order?.length ? live.order : v.order;
          return (
            <tr key={k}>
              <td>{lang === "ar" ? v.ar : v.en}</td>
              <td dir="ltr">{order.map((p: string, i: number) => <span key={p} style={{ fontWeight: i === 0 && live?.order?.length ? 700 : 400, opacity: live?.order?.length || !s.enabled ? 1 : 0.6 }}>{i ? " → " : ""}{PROVIDER_NAME[p]}</span>)}{v.tier === "fast" ? <span className="muted"> · {t("fast model")}</span> : null}{live?.custom ? <span className="muted"> · {t("custom")}</span> : null}</td>
              <td className="muted">{lang === "ar" ? v.whyAr : v.why}</td>
            </tr>
          );
        })}</tbody>
      </table>
      {!s.enabled && <div className="muted" style={{ fontSize: 10.5, marginTop: 6 }}>{t("No AI key set: the order shown is the default that applies once keys are added.")}</div>}
    </div>
  );
}
