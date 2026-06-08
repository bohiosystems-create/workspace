"use client";

import { useRef, useState } from "react";
import { marked } from "marked";
import Nav from "../_components/Nav";

const FUNDS = [
  "Bevilacqua Holdings — GP Portfolio",
  "Meridian Capital Partners — JV/LP",
  "Al-Harbi Development — Local JV",
];

const SAMPLE = `NAHDAH LOGISTICS PARK II — INVESTMENT TEASER (CONFIDENTIAL)

Asset: Grade A logistics campus, 3 cross-dock units, 58,400 sqm GLA
Location: Jeddah · East Corridor (Highway 40)
Asking price: SAR 412,000,000 (SAR 7,055 / sqm)
Net Initial Yield: 8.1%
In-place NOI: SAR 33.4M  |  ERV: SAR 38.9M (reversionary)
Occupancy: 98.8%  |  WALE: 7.1 years
Anchor tenant: Almajdouie Logistics (single-tenant pre-let, 100% of income)
Indexation: 100% CPI-linked, annual
Tenure: Freehold · Vendor seeks Q3 2026 close`;

type Result = {
  id: string;
  fund: string;
  deal: Record<string, any>;
  underwrite: any;
  memo: string;
};

export default function ScreeningPage() {
  const [fund, setFund] = useState(FUNDS[0]);
  const [text, setText] = useState(SAMPLE);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function screen() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.set("fund", fund);
      if (file) form.set("file", file);
      else form.set("text", text);
      const res = await fetch("/api/screen", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Screening failed.");
      setResult(data);
    } catch (e: any) {
      setError(e.message ?? "Screening failed.");
    } finally {
      setLoading(false);
    }
  }

  const d = result?.deal;
  const u = result?.underwrite;

  return (
    <div className="shell">
      <Nav />
      <div className="section-title">Deal Screening &amp; IC Memos</div>
      <p className="intro">
        Drop in a teaser or OM. Claude extracts the key figures, a deterministic
        first-pass underwrite runs against the fund&apos;s return hurdles, and Claude
        drafts a structured investment-committee memo.
      </p>

      <div className="panel">
        <div className="row twocol">
          <div className="field">
            <label>Underwrite against</label>
            <select value={fund} onChange={(e) => setFund(e.target.value)}>
              {FUNDS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
            <div
              className={`drop${file ? " has" : ""}`}
              style={{ marginTop: 16 }}
              onClick={() => fileInput.current?.click()}
            >
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf"
                hidden
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <div style={{ fontSize: 22, marginBottom: 6 }}>⇪</div>
              <div style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700 }}>
                {file ? file.name : "Upload a teaser / OM (PDF)"}
              </div>
              <div className="muted" style={{ marginTop: 6 }}>
                {file ? "Click to replace · clears the pasted text below" : "or paste the deal text below"}
              </div>
            </div>
          </div>
          <div className="field">
            <label>Or paste deal text</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={!!file}
              placeholder="Paste teaser / OM text here…"
            />
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 18, alignItems: "center" }}>
          <button className="btn" onClick={screen} disabled={loading || (!file && !text.trim())}>
            {loading ? (
              <>
                <span className="spin" /> &nbsp; Screening…
              </>
            ) : (
              "Screen this deal"
            )}
          </button>
          {file && (
            <button className="btn ghost" onClick={() => setFile(null)} disabled={loading}>
              Clear file
            </button>
          )}
          <span className="muted">Claude extraction → underwrite → memo. ~20–40s.</span>
        </div>
        {error && <div className="err">{error}</div>}
      </div>

      {result && d && u && (
        <div style={{ marginTop: 24 }}>
          <div className="panel">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{d.assetName ?? "Untitled deal"}</div>
              {d.assetType && <span className="tag">{d.assetType}</span>}
              {d.location && <span className="tag">{d.location}</span>}
              <span className="tag">Extracted</span>
            </div>
            <div className="extract">
              <Ex l="Asking Price" v={money(d.currency, d.askingPriceM)} />
              <Ex l="Net Initial Yield" v={pct(d.netInitialYieldPct)} />
              <Ex l="In-place NOI" v={money(d.currency, d.inPlaceNoiM)} />
              <Ex l="ERV (reversion)" v={money(d.currency, d.ervM)} />
              <Ex l="Occupancy" v={pct(d.occupancyPct)} />
              <Ex l="WALE" v={d.waleYears != null ? `${d.waleYears} yrs` : "—"} />
            </div>
            {d.anchorTenant && (
              <div className="muted">
                Anchor: <b>{d.anchorTenant}</b>
                {d.anchorTenantPct != null ? ` · ${d.anchorTenantPct}% of income` : ""} ·{" "}
                {d.indexation ?? "indexation n/d"} · {d.tenure ?? "tenure n/d"}
              </div>
            )}
          </div>

          <div className={`verdict ${u.verdict}`}>
            <span className="badge solid">{u.verdict}</span>
            <span className="muted">{u.rationale}</span>
          </div>

          <div className="row twocol">
            <div className="panel">
              <div className="section-title" style={{ fontSize: 12 }}>
                Underwrite vs. Hurdles
              </div>
              <div style={{ marginTop: 12 }}>
                {u.hurdles.map((h: any) => (
                  <div className="hurdle" key={h.label}>
                    <span className={`check ${h.pass ? "pass" : "fail"}`}>{h.pass ? "✓" : "!"}</span>
                    <span className="name">{h.label}</span>
                    <span className="target">
                      {h.actual} &nbsp;<span style={{ opacity: 0.5 }}>{h.target}</span>
                    </span>
                  </div>
                ))}
              </div>
              <div className="muted" style={{ marginTop: 14, fontSize: 10 }}>
                Indicative {u.assumptions.holdYears}-yr underwrite · LTV {u.assumptions.ltvPct}% ·
                cost of debt {u.assumptions.costOfDebtPct}% · entry {u.assumptions.entryYieldPct}% /
                exit {u.assumptions.exitYieldPct}% · growth {u.assumptions.rentalGrowthPct}%. First-pass
                model — confirm in full DD.
              </div>
            </div>

            <div className="panel">
              <div className="section-title" style={{ fontSize: 12 }}>
                Computed Returns
              </div>
              <div className="extract" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <Ex l="Net IRR" v={pct(u.netIrrPct)} />
                <Ex l="Equity Multiple" v={u.equityMultiple != null ? `${u.equityMultiple}x` : "—"} />
                <Ex l="Equity" v={money(d.currency, u.equityM)} />
                <Ex l="Exit Value" v={money(d.currency, u.exitValueM)} />
              </div>
            </div>
          </div>

          <div style={{ marginTop: 20, marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
            <div className="section-title" style={{ fontSize: 12 }}>
              IC Screening Memo
            </div>
            <span className="tag">AI draft · {result.fund}</span>
          </div>
          <div
            className="memo"
            dangerouslySetInnerHTML={{ __html: marked.parse(result.memo) as string }}
          />
        </div>
      )}
    </div>
  );
}

function Ex({ l, v }: { l: string; v: string }) {
  return (
    <div className="ex">
      <div className="l">{l}</div>
      <div className="v">{v}</div>
    </div>
  );
}
function money(currency: string | null, m: number | null | undefined): string {
  if (m == null) return "—";
  return `${currency ?? ""} ${m.toLocaleString()}M`.trim();
}
function pct(x: number | null | undefined): string {
  return x != null ? `${x}%` : "—";
}
