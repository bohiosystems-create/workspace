"use client";

import { useEffect, useRef, useState } from "react";
import Nav from "../_components/Nav";

type Msg = { role: "bot" | "user"; text: string };
type Report = any;

const CHIPS = [
  "LP quarterly report for Bevilacqua, Q1 2026, institutional style",
  "Concise board deck for Meridian, Q1 2026",
  "Detailed fund fact sheet for Al-Harbi, Q4 2025",
];

export default function ReportingPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "bot",
      text: "I build LP quarterly reports, board decks and fund fact sheets straight from the fund data. Tell me which report you want, for which fund & period, and in what style.",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [commentary, setCommentary] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages]);

  async function send(message?: string) {
    const text = (message ?? input).trim();
    if (!text || loading) return;
    setInput("");
    setError(null);
    setMessages((m) => [...m, { role: "user", text }]);
    setLoading(true);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Report generation failed.");
      const s = data.spec;
      setMessages((m) => [
        ...m,
        {
          role: "bot",
          text: `Generated a ${s.style} ${s.reportType} for ${s.fund.split(" — ")[0]}, ${s.period}. The branded report is below — pulled from the fund's asset data and live debt position.`,
        },
      ]);
      setReport(data.report);
      setCommentary(data.commentary);
    } catch (e: any) {
      setError(e.message ?? "Report generation failed.");
      setMessages((m) => [...m, { role: "bot", text: `Sorry — ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  const cur = report?.currency ?? "SAR";

  return (
    <div className="shell">
      <Nav />
      <div className="section-title">LP &amp; Board Reporting</div>
      <p className="intro">
        Ask for the report you need. Claude interprets the request, the snapshot
        and returns are computed from the fund&apos;s asset data and live debt
        position, and Claude drafts the manager commentary. Every figure traces
        to the data.
      </p>

      <div className="row twocol" style={{ alignItems: "start" }}>
        <div className="chat">
          <div className="chat-head"><span className="dot" /> Report Assistant</div>
          <div className="chat-log" ref={logRef}>
            {messages.map((m, i) => (
              <div key={i} className={`kmsg ${m.role}`}>
                {m.text}
              </div>
            ))}
            {loading && <div className="kmsg bot"><span className="spin dark" /> Building report…</div>}
          </div>
          <div className="chips">
            {CHIPS.map((c) => (
              <button key={c} className="chip" onClick={() => send(c)} disabled={loading}>
                {c.split(",")[0]}
              </button>
            ))}
          </div>
          <div className="chat-input">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="e.g. Q1 2026 LP report for Bevilacqua, formal style"
            />
            <button className="btn" onClick={() => send()} disabled={loading}>
              Send
            </button>
          </div>
        </div>

        <div className="panel" style={{ minHeight: 200 }}>
          <div className="chart-label">Linked data sources</div>
          <div className="muted" style={{ lineHeight: 2 }}>
            ◵ Fund register — assets, valuations, NOI, occupancy, WALE<br />
            ◵ Distributions ledger — per fund / per period<br />
            ◷ Debt facilities — drawn balances (NAV = valuation − debt)<br />
            ◷ Fund cashflow models — IRR / equity multiple / YoC / DSCR
          </div>
          {error && <div className="err">{error}</div>}
        </div>
      </div>

      {report && (
        <div className="reportdoc" style={{ marginTop: 24 }}>
          <div className="rd-head">
            <div className="rd-kicker">Bohio · {report.reportType}</div>
            <div className="rd-title">{report.fund}</div>
            <div className="rd-sub">
              {report.period} · {report.style} · Confidential — for Limited Partners
            </div>
          </div>
          <div className="rd-body">
            <h4>Fund Snapshot</h4>
            <div className="rd-grid">
              <K l="Net Asset Value" v={`${cur} ${report.snapshot.navM}M`} d="valuation − debt" />
              <K l="Gross Valuation" v={`${cur} ${report.snapshot.grossValuationM}M`} d="independent" />
              <K l="NOI (annualised)" v={`${cur} ${report.snapshot.noiM}M`} d="sum of assets" />
              <K
                l="Occupancy"
                v={report.snapshot.weightedOccupancyPct != null ? `${report.snapshot.weightedOccupancyPct}%` : "—"}
                d={`WALE ${report.snapshot.weightedWaleYears ?? "—"} yrs`}
              />
            </div>
            <h4>Return Metrics</h4>
            <div className="rd-grid">
              <K l="Net IRR" v={`${report.returns.netIrrPct}%`} />
              <K l="Equity Multiple" v={`${report.returns.equityMultiple}x`} />
              <K l="Yield on Cost" v={`${report.returns.yieldOnCostPct}%`} />
              <K l="DSCR" v={`${report.returns.dscr}x`} />
            </div>
            <h4>Asset Detail</h4>
            <table className="rd-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th className="num">Valuation</th>
                  <th className="num">Occupancy</th>
                  <th className="num">WALE</th>
                  <th className="num">NOI</th>
                </tr>
              </thead>
              <tbody>
                {report.assets.map((a: any) => (
                  <tr key={a.name}>
                    <td>
                      <b>{a.name}</b> <span className="muted">· {a.type}</span>
                      {a.conceptStage && <span className="tag" style={{ marginLeft: 6 }}>concept</span>}
                    </td>
                    <td className="num">{cur} {a.valuationM}M</td>
                    <td className="num">{a.occupancyPct != null ? `${a.occupancyPct}%` : "—"}</td>
                    <td className="num">{a.waleYears != null ? `${a.waleYears} yrs` : "—"}</td>
                    <td className="num">{a.noiM ? `${cur} ${a.noiM}M` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h4>Distributions</h4>
            <p>
              {report.snapshot.distributionM != null
                ? `A distribution of ${cur} ${report.snapshot.distributionM}M was declared for ${report.period}, reconciled to the fund ledger.`
                : `No distribution recorded for ${report.period}.`}
            </p>
            <h4>Manager Commentary <span className="tag">AI draft · {report.style} · review before send</span></h4>
            <p>{commentary}</p>
          </div>
          <div className="rd-foot">
            Generated by Bohio · {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} ·
            Every figure traces to the fund register. Draft — partner sign-off required before distribution.
          </div>
        </div>
      )}
    </div>
  );
}

function K({ l, v, d }: { l: string; v: string; d?: string }) {
  return (
    <div className="rd-kpi">
      <div className="l">{l}</div>
      <div className="v">{v}</div>
      {d && <div className="d">{d}</div>}
    </div>
  );
}
