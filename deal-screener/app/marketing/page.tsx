"use client";

import { useEffect, useState } from "react";
import Nav from "../_components/Nav";

const fmtMonth = (m: string) =>
  new Date(`${m}-01`).toLocaleDateString("en-GB", { month: "short" });
const n0 = (x: number) => x.toLocaleString("en-GB");
const dash = (x: number | null | undefined, suffix = "") => (x === null || x === undefined ? "—" : `${x}${suffix}`);

export default function MarketingPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [narrative, setNarrative] = useState("");
  const [narrLoading, setNarrLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ vendor: string; text: string } | null>(null);
  const [vendorFilter, setVendorFilter] = useState<string>("all");

  useEffect(() => {
    fetch("/api/marketing")
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setData(d.dashboard)))
      .catch((e) => setError(e.message));
  }, []);

  async function post(body: any, key: string) {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/marketing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      return d;
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function act(body: any, key: string) {
    const d = await post(body, key);
    if (d?.dashboard) setData(d.dashboard);
  }

  async function getNarrative() {
    setNarrLoading(true);
    setError(null);
    try {
      const d = await (await fetch("/api/marketing?narrative=1")).json();
      if (d.error) throw new Error(d.error);
      setNarrative(d.narrative);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setNarrLoading(false);
    }
  }

  async function draftNote(v: any) {
    const d = await post({ action: "VENDOR_NOTE", vendorId: v.id }, `note-${v.id}`);
    if (d?.note) setNote({ vendor: v.name, text: d.note });
  }

  const k = data?.kpis;
  const sevOrder: Record<string, number> = { crit: 0, warn: 1, info: 2 };
  const maxSales = data ? Math.max(...data.monthly.map((m: any) => m.revenueM), 1) : 1;
  const maxSpend = data ? Math.max(...data.monthly.map((m: any) => m.spendK), 1) : 1;
  const funnelMax = data ? Math.max(...data.funnel.map((f: any) => f.value), 1) : 1;
  const campaigns = data
    ? data.campaigns.filter((c: any) => vendorFilter === "all" || c.vendorId === vendorFilter)
    : [];

  return (
    <div className="shell">
      <Nav />
      <div className="section-title">Marketing &amp; Sales</div>
      <p className="intro">
        Every external marketing vendor, the campaigns they run per asset, and how
        that spend translates into leads, viewings, reservations and contracted
        sales — computed from the campaign register. Rule-based alerts flag SLA and
        contract issues; recommendations can be applied in one click and are
        written to an audit trail. Claude writes the briefing and the vendor notes.
      </p>

      {error && <div className="err">{error}</div>}
      {!data && !error && <div className="muted"><span className="spin dark" /> Loading vendors…</div>}

      {data && (
        <>
          <div className="kpis">
            <Kpi v={`${data.currency} ${n0(k.spendK)}K`} l="Marketing Spend" d={`${k.liveCampaigns} live campaigns`} />
            <Kpi v={n0(k.leads)} l="Leads" />
            <Kpi v={n0(k.contracts)} l="Contracts" d={`${data.currency} ${k.revenueM}M sales`} />
            <Kpi v={dash(k.costToSalesPct, "%")} l="Cost-to-Sales" d={`CAC ${data.currency} ${dash(k.cacK)}K`} />
            <Kpi v={String(k.alertCount)} l="Alerts" alert={k.alertCount > 0} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0 14px" }}>
            <div className="section-title" style={{ fontSize: 12 }}>Orchestration</div>
            <button className="btn ghost" style={{ padding: "7px 14px", fontSize: 9 }} onClick={getNarrative} disabled={narrLoading}>
              {narrLoading ? <><span className="spin dark" /> &nbsp;Asking Claude…</> : "AI vendor briefing"}
            </button>
          </div>
          {narrative && <div className="panel" style={{ marginBottom: 14, fontSize: 12, lineHeight: 1.6 }}>{narrative}</div>}

          {data.recommendations.length === 0 && <div className="muted" style={{ marginBottom: 14 }}>No recommended actions — spend is converting within thresholds.</div>}
          {data.recommendations.map((r: any, i: number) => {
            const key = `rec-${i}`;
            return (
              <div className="rec" key={key}>
                <span className={`badge ${r.type === "PAUSE" ? "alert" : "solid"}`}>{r.type === "PAUSE" ? "Pause" : "Shift budget"}</span>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div className="rt">
                    {r.type === "PAUSE"
                      ? `Pause ${r.campaign} (${r.vendor})`
                      : `Move ${data.currency} ${r.amountK}K from ${r.campaign} (${r.vendor}) to ${r.toCampaign} (${r.toVendor})`}
                  </div>
                  <div className="rd">{r.rationale} {r.impact}</div>
                </div>
                <button
                  className="btn"
                  disabled={busy === key}
                  onClick={() =>
                    act(
                      r.type === "PAUSE"
                        ? { action: "PAUSE", campaignId: r.campaignId }
                        : { action: "SHIFT_BUDGET", campaignId: r.campaignId, toCampaignId: r.toCampaignId, amountK: r.amountK },
                      key
                    )
                  }
                >
                  {busy === key ? "Applying…" : "Apply"}
                </button>
              </div>
            );
          })}

          <div className="section-title" style={{ fontSize: 12, margin: "22px 0 14px" }}>Alerts</div>
          {[...data.alerts].sort((a: any, b: any) => sevOrder[a.severity] - sevOrder[b.severity]).map((a: any, i: number) => (
            <div key={i} className={`alert ${a.severity}`}>
              <div className="ai">{a.severity === "crit" ? "!" : a.severity === "warn" ? "◷" : "≡"}</div>
              <div style={{ flex: 1 }}>
                <div className="at">{a.title}</div>
                <div className="ad">{a.detail}</div>
              </div>
              <span className={`badge ${a.severity === "crit" ? "alert" : ""}`}>{a.tag}</span>
            </div>
          ))}
          {data.alerts.length === 0 && <div className="muted">No alerts.</div>}

          <div className="row twocol" style={{ marginTop: 22 }}>
            <div className="panel">
              <div className="chart-label">Spend vs contracted sales, by month</div>
              <div className="trend">
                {data.monthly.map((m: any) => (
                  <div className="tcol" key={m.month}>
                    <div className="tbars">
                      <div className="tbar" title={`Spend SAR ${m.spendK}K`} style={{ height: `${(m.spendK / maxSpend) * 100}%`, background: "var(--ink-faint)" }} />
                      <div className="tbar" title={`Sales SAR ${m.revenueM}M`} style={{ height: `${(m.revenueM / maxSales) * 100}%`, background: "var(--ink)" }} />
                    </div>
                    <div className="lv">{m.revenueM}M</div>
                    <div className="ly">{fmtMonth(m.month)}</div>
                  </div>
                ))}
              </div>
              <div className="legend">
                <span><i style={{ background: "var(--ink-faint)" }} />Spend (SAR K)</span>
                <span><i style={{ background: "var(--ink)" }} />Sales (SAR M)</span>
              </div>
            </div>

            <div className="panel">
              <div className="chart-label">Lead-to-contract funnel</div>
              <div style={{ marginTop: 8 }}>
                {data.funnel.map((f: any, i: number) => (
                  <div className="hbar-row" key={f.stage}>
                    <div className="hbar-name">{f.stage}</div>
                    <div className="hbar-track">
                      <div className="hbar-fill" style={{ width: `${Math.max((f.value / funnelMax) * 100, 1.5)}%`, background: "var(--ink)" }} />
                    </div>
                    <div className="hbar-v" style={{ width: 96 }}>
                      {n0(f.value)}
                      {i > 0 && <span className="muted" style={{ fontSize: 9 }}> {Math.round((f.value / data.funnel[i - 1].value) * 100)}%</span>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="chart-label" style={{ marginTop: 18 }}>By asset — cost-to-sales</div>
              {data.assets.map((a: any) => (
                <div className="hbar-row" key={a.asset}>
                  <div className="hbar-name">{a.asset}</div>
                  <div className="hbar-track">
                    <div className="hbar-fill" style={{ width: `${Math.min(((a.costToSalesPct ?? 0) / 4) * 100, 100)}%`, background: (a.costToSalesPct ?? 0) > 3 ? "var(--alert)" : "var(--ink)" }} />
                  </div>
                  <div className="hbar-v" style={{ width: 96 }}>{dash(a.costToSalesPct, "%")} <span className="muted" style={{ fontSize: 9 }}>· {a.revenueM}M</span></div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel" style={{ marginTop: 18 }}>
            <div className="chart-label">Vendor scorecard</div>
            <div style={{ overflowX: "auto" }}>
              <table className="dtable">
                <thead>
                  <tr>
                    <th>Vendor</th><th>Category</th><th className="num">Spend</th><th className="num">Contracts</th>
                    <th className="num">Sales (M)</th><th className="num">Cost / Sales</th><th className="num">Qual. rate</th>
                    <th className="num">Resp. (h)</th><th>Score</th><th>Verdict</th><th>Contract</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.vendors.map((v: any) => (
                    <tr key={v.id}>
                      <td>
                        <b>{v.name}</b>
                        {v.slaBreaches.map((b: string) => <div key={b} style={{ color: "var(--alert)", fontSize: 9, marginTop: 3 }}>{b}</div>)}
                      </td>
                      <td>{v.category}</td>
                      <td className="num">{n0(v.spendK)}K <span className="muted">({v.spendSharePct}%)</span></td>
                      <td className="num">{v.contracts}</td>
                      <td className="num">{v.revenueM}</td>
                      <td className="num" style={v.costToSalesPct === null || v.costToSalesPct > 3 ? { color: "var(--alert)", fontWeight: 700 } : {}}>{dash(v.costToSalesPct, "%")}</td>
                      <td className="num">{dash(v.qualRatePct, "%")}</td>
                      <td className="num">{dash(v.latestRespHrs)} <span className="muted">/ {v.slaResponseHrs}</span></td>
                      <td>
                        <div className="score" title={`Efficiency ${v.scoreParts.efficiency}/40 · Quality ${v.scoreParts.quality}/25 · Responsiveness ${v.scoreParts.responsiveness}/20 · Delivery ${v.scoreParts.delivery}/15`}>
                          <div className="score-track"><div className="score-fill" style={{ width: `${v.score}%`, background: v.score < 45 ? "var(--alert)" : "var(--ink)" }} /></div>
                          <b>{v.score}</b>
                        </div>
                      </td>
                      <td><span className={`pill ${v.verdict.toLowerCase()}`}>{v.verdict}</span></td>
                      <td>{new Date(v.contractEnd).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</td>
                      <td>
                        <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 8 }} onClick={() => draftNote(v)} disabled={busy === `note-${v.id}`}>
                          {busy === `note-${v.id}` ? "Drafting…" : "Draft note"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="muted" style={{ marginTop: 10, fontSize: 10 }}>
              Score = efficiency 40 (cost-to-sales) + quality 25 (qualified rate) + responsiveness 20 (vs contract SLA) + delivery 15 (budget pacing). PR and outdoor are last-touch under-attributed.
            </div>
            {note && (
              <>
                <div className="chart-label" style={{ marginTop: 18 }}>Draft note — {note.vendor}</div>
                <div className="note">{note.text}</div>
              </>
            )}
          </div>

          <div className="panel" style={{ marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
              <div className="chart-label" style={{ margin: 0 }}>Campaigns</div>
              <select style={{ width: "auto" }} value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)}>
                <option value="all">All vendors</option>
                {data.vendors.map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="dtable">
                <thead>
                  <tr>
                    <th>Campaign</th><th>Vendor</th><th>Status</th><th className="num">Spend / Budget</th><th className="num">Pacing</th>
                    <th className="num">Leads</th><th className="num">CPL (SAR)</th><th className="num">Qual.</th><th className="num">View.</th>
                    <th className="num">Contracts</th><th className="num">Sales (M)</th><th className="num">CAC (K)</th><th className="num">Cost / Sales</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c: any) => (
                    <tr key={c.id}>
                      <td><b>{c.name}</b><div className="muted" style={{ fontSize: 9 }}>{c.asset} · {c.channel}{c.attribution === "Weak" ? " · weak attribution" : ""}</div></td>
                      <td>{c.vendor}</td>
                      <td><span className={`pill ${c.status.toLowerCase()}`}>{c.status}</span></td>
                      <td className="num">{c.spendK} / {c.budgetK}K</td>
                      <td className="num" style={c.pacingPct !== null && (c.pacingPct > 115 || c.pacingPct < 75) ? { color: "var(--alert)" } : {}}>{dash(c.pacingPct, "%")}</td>
                      <td className="num">{n0(c.leads)}</td>
                      <td className="num">{dash(c.cplSar)}{c.cplTrendPct !== null && c.cplTrendPct > 20 ? <span style={{ color: "var(--alert)" }}> ↑</span> : ""}</td>
                      <td className="num">{c.qualified}</td>
                      <td className="num">{c.viewings}</td>
                      <td className="num">{c.contracts}</td>
                      <td className="num">{c.revenueM}</td>
                      <td className="num">{dash(c.cacK)}</td>
                      <td className="num"><span className={`pill ${c.health.toLowerCase()}`}>{dash(c.costToSalesPct, "%")}</span></td>
                      <td>
                        {c.status === "LIVE" && (
                          <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 8 }} disabled={busy === c.id} onClick={() => act({ action: "PAUSE", campaignId: c.id }, c.id)}>Pause</button>
                        )}
                        {c.status === "PAUSED" && (
                          <button className="btn ghost" style={{ padding: "6px 10px", fontSize: 8 }} disabled={busy === c.id} onClick={() => act({ action: "RESUME", campaignId: c.id }, c.id)}>Resume</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel" style={{ marginTop: 18 }}>
            <div className="chart-label">Orchestration audit trail</div>
            {data.actions.length === 0 && <div className="muted">No actions taken yet.</div>}
            {data.actions.map((a: any) => (
              <div className="logrow" key={a.id}>
                <div className="lt">{new Date(a.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                <span className="tag">{a.type.replace("_", " ")}</span>
                <div><b>{a.campaign}</b> — {a.detail}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ v, l, d, alert }: { v: string; l: string; d?: string; alert?: boolean }) {
  return (
    <div className="kpi">
      <div className="kv" style={alert ? { color: "var(--alert)" } : {}}>{v}</div>
      <div className="kl">{l}</div>
      {d && <div className="kd">{d}</div>}
    </div>
  );
}
