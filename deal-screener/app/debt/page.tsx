"use client";

import { useEffect, useState } from "react";
import Nav from "../_components/Nav";

export default function DebtPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [narrative, setNarrative] = useState<string>("");
  const [narrLoading, setNarrLoading] = useState(false);

  useEffect(() => {
    fetch("/api/debt")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d.dashboard);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function getNarrative() {
    setNarrLoading(true);
    try {
      const res = await fetch("/api/debt?narrative=1");
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setNarrative(d.narrative);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setNarrLoading(false);
    }
  }

  const k = data?.kpis;
  const cur = data?.currency ?? "SAR";
  const maxLadder = data ? Math.max(...data.ladder.map((l: any) => l.drawnM), 1) : 1;
  const sevOrder: Record<string, number> = { crit: 0, warn: 1, info: 2 };

  return (
    <div className="shell">
      <Nav />
      <div className="section-title">Debt &amp; Covenants</div>
      <p className="intro">
        Facility terms, maturity ladder, and ICR / LTV / DSCR computed across the
        portfolio from the facilities register — with forward-looking, rule-based
        alerts on covenant headroom and refinancing windows. Ask Claude for a risk
        narrative on demand.
      </p>

      {error && <div className="err">{error}</div>}
      {!data && !error && <div className="muted"><span className="spin dark" /> Loading portfolio…</div>}

      {data && (
        <>
          <div className="kpis">
            <Kpi v={`${cur} ${k.totalDebtM}M`} l="Total Debt" d={`${k.facilities} facilities`} />
            <Kpi v={`${k.wtdAvgCostPct}%`} l="Wtd. Avg. Cost" />
            <Kpi v={`${cur} ${k.maturingLt18moM}M`} l="Maturing < 18mo" d={`${k.maturingLt18moPct}% of debt`} />
            <Kpi v={`${k.portfolioDscr}x`} l="Portfolio DSCR" />
            <Kpi
              v={`${k.watchCount} / ${k.alertCount}`}
              l="Watch / Alerts"
              alert={k.watchCount > 0}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0 14px" }}>
            <div className="section-title" style={{ fontSize: 12 }}>Forward-looking alerts</div>
            <button className="btn ghost" style={{ padding: "7px 14px", fontSize: 9 }} onClick={getNarrative} disabled={narrLoading}>
              {narrLoading ? <><span className="spin dark" /> &nbsp;Asking Claude…</> : "AI risk narrative"}
            </button>
          </div>
          {narrative && <div className="panel" style={{ marginBottom: 14, fontSize: 12, lineHeight: 1.6 }}>{narrative}</div>}

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

          <div className="row twocol" style={{ marginTop: 22 }}>
            <div className="panel">
              <div className="chart-label">Maturity ladder ({cur} M)</div>
              <div className="ladder">
                {data.ladder.map((l: any) => (
                  <div className="lcol" key={l.year}>
                    <div className="lv">{l.drawnM}</div>
                    <div className="lbar" style={{ height: `${(l.drawnM / maxLadder) * 100}%`, background: l.flagged ? "var(--alert)" : "var(--ink)" }} />
                    <div className="ly">{l.year}</div>
                  </div>
                ))}
              </div>
              <div className="muted" style={{ marginTop: 10, fontSize: 10 }}>
                Red = a facility in that year matures within 18 months.
              </div>
            </div>

            <div className="panel">
              <div className="chart-label">Covenant headroom (DSCR over covenant)</div>
              <div style={{ marginTop: 8 }}>
                {data.facilitiesTable.map((f: any) => (
                  <div className="hbar-row" key={f.asset}>
                    <div className="hbar-name">{f.asset}</div>
                    <div className="hbar-track">
                      <div
                        className="hbar-fill"
                        style={{
                          width: `${Math.min(f.dscrHeadroomPct, 100)}%`,
                          background: f.dscrHeadroomPct < 15 ? "var(--alert)" : "var(--ink)",
                        }}
                      />
                    </div>
                    <div className="hbar-v">{f.dscrHeadroomPct}%</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginTop: 18 }}>
            <div className="chart-label">Facilities</div>
            <div style={{ overflowX: "auto" }}>
              <table className="dtable">
                <thead>
                  <tr>
                    <th>Asset</th><th>Lender</th><th className="num">Drawn</th><th className="num">Rate</th>
                    <th className="num">LTV</th><th className="num">DSCR</th><th className="num">ICR</th>
                    <th>Maturity</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.facilitiesTable.map((f: any) => (
                    <tr key={f.asset}>
                      <td><b>{f.asset}</b></td>
                      <td>{f.lender}</td>
                      <td className="num">{f.drawnM}</td>
                      <td className="num">{f.ratePct}%</td>
                      <td className="num">{f.ltvPct}%</td>
                      <td className="num" style={f.dscrHeadroomPct < 15 ? { color: "var(--alert)", fontWeight: 700 } : {}}>{f.dscr}x</td>
                      <td className="num">{f.icr}x</td>
                      <td>{new Date(f.maturity).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</td>
                      <td>
                        <span className={`pill ${f.status.toLowerCase()}`}>{f.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
