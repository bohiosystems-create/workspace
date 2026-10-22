"use client";
/**
 * Outcomes: how the decisions are working out, week by week — time from a fault to someone on it, planned
 * maintenance on time, how often proposals are accepted (and why they are rejected), the coordination time saved.
 * Earlier weeks are the demo's history (marked); this week is live.
 */
import type { Outcomes } from "@/lib/outcomes";

const wk = (iso: string) => { const [, m, d] = iso.split("-").map(Number); return `${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]}`; };

function Bars({ title, unit, rows, better }: { title: string; unit: string; rows: { week: string; demo: boolean; v: number | null }[]; better: "low" | "high" }) {
  const max = Math.max(1, ...rows.map((r) => r.v ?? 0));
  // label the first week, the week the orchestrator came on, the last week before this one, and this week
  const key = (i: number) => i === 0 || i === 4 || i === rows.length - 2 || i === rows.length - 1;
  return (
    <figure className="oc-bars">
      <figcaption>{title} <em>{better === "low" ? "lower is better" : "higher is better"}</em></figcaption>
      <div className="oc-plot" role="img" aria-label={`${title}: ${rows.map((r) => `${wk(r.week)} ${r.v ?? "no data"}${unit}`).join(", ")}`}>
        {rows.map((r, i) => (
          <div key={r.week} className={`oc-col${r.demo ? " demo" : " live"}${i === 4 ? " on" : ""}${i >= 4 ? " after" : ""}`} title={`${i === rows.length - 1 ? "This week" : `Week of ${wk(r.week)}`}: ${r.v ?? "no data yet"}${r.v === null ? "" : unit}`}>
            <span className="oc-v">{key(i) ? (r.v === null ? "—" : `${r.v}${unit.trim() === "%" ? "%" : ""}`) : ""}</span>
            <span className="oc-bar" style={{ height: `${r.v === null ? 0 : Math.max(4, (r.v / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="oc-axis"><span>{wk(rows[0].week)}</span><span>orchestrator on ┆ {wk(rows[4].week)}</span><span>this week</span></div>
    </figure>
  );
}

export function OutcomesPanel({ o, compact }: { o: Outcomes; compact?: boolean }) {
  const acc = (k: { approved: number; rejected: number; auto: number }) => { const t = k.approved + k.rejected + k.auto; return t ? Math.round(((k.approved + k.auto) / t) * 100) : 0; };
  const empty = o.charts.map((c) => c.empty).filter(Boolean).join(" · ");
  return (
    <section className="ops-panel oc">
      <div className="oc-tiles">
        {o.tiles.map((t) => <div key={t.label} className={`ops-kpi ${t.tone ?? ""}`}><span className="kl">{t.label}</span><b>{t.value}</b><em>{t.sub}</em></div>)}
      </div>
      {!compact && <p className="oc-legend"><span className="sw demo" /> earlier weeks: the demo&apos;s history <span className="sw live" /> this week: live from the app{empty ? ` · ${empty}` : ""}</p>}
      {!compact && <div className="oc-charts">
        {o.charts.map((c) => <Bars key={c.title} title={c.title} unit={c.unit} better={c.better} rows={c.rows} />)}
      </div>}
      {!compact && (
        <div className="oc-split">
          <div>
            <div className="rpt-label">Decisions by kind (live)</div>
            {o.decisions.byKind.length === 0 ? <p className="muted small">No decisions yet. Approve, reject or let the autopilot run, and they show here.</p> : (
              <div className="ops-tablewrap"><table className="ops-table oc-table"><thead><tr><th>Proposal</th><th>Approved</th><th>Autopilot</th><th>Rejected</th><th>Accepted</th></tr></thead>
                <tbody>{o.decisions.byKind.map((k) => <tr key={k.domain + k.kind}><td>{k.label}<em>{k.domain === "site" ? "construction" : "operations"}</em></td><td>{k.approved}</td><td>{k.auto}</td><td>{k.rejected}</td><td>{acc(k)}%</td></tr>)}</tbody></table></div>
            )}
          </div>
          <div>
            <div className="rpt-label">Why proposals are rejected</div>
            {o.decisions.reasons.length === 0 ? <p className="muted small">Nothing rejected yet.</p> : <ul className="oc-reasons">{o.decisions.reasons.map((r) => <li key={r.reason}><b>{r.count}</b> {r.label}</li>)}</ul>}
            <p className="muted small">The orchestrator learns from these: “not now” brings a proposal back tomorrow, “wrong person” proposes someone else, and a kind of proposal rejected again and again in one place stops running by itself.</p>
          </div>
        </div>
      )}
      <p className="muted small">{o.note}</p>
    </section>
  );
}
