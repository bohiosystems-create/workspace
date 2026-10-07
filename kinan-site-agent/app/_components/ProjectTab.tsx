"use client";
import { useEffect, useMemo, useState } from "react";
import type { Db, Location, ProjectData } from "@/lib/types";
import * as P from "@/lib/core/project";
import { progressByLocation, sCurve } from "@/lib/core/progress";
import { critState, expectedPct, isCritical, liveCritical, slipOf } from "@/lib/critical";
import type { Activity } from "@/lib/types";
import { pathOf } from "./site";
import { C, Columns3D, Curve, Donut3D, Gauge, Kpi, Panel, Ring, Timeline } from "./Charts";

type Section = "programme" | "procurement" | "safety" | "regs" | "drawings" | "team";
interface Props { locations: Location[]; refreshKey: number; onSelectLocation: (id: string) => void; onOpenDoc: (id: string) => void }

const sar = (n: number) => (n >= 1e6 ? `SAR ${(n / 1e6).toFixed(1)}M` : `SAR ${Math.round(n).toLocaleString("en")}`);
const Slip = ({ d }: { d: number }) => (d > 0 ? <span className="slip late">+{d} d</span> : d < 0 ? <span className="slip early">{d} d</span> : <span className="slip ok">on time</span>);
const BUILDING_NAMES: Record<string, string> = { "tower-a": "Tower A", "tower-b": "Tower B", podium: "Podium", "hotel-c": "Hotel C", "club-e": "Club E", "villas-d": "Villas D" };
const PKG_COLORS: Record<string, string> = { Planning: "#9c9ea1", RFQ: C.blue, Evaluation: C.violet, Awarded: C.teal, Manufacturing: C.warn, Delivering: C.or, Complete: C.good };
const PERMIT_COLORS = [C.or, C.blue, C.teal, C.violet, C.warn, C.good, "#9c9ea1", C.crit];
const count = <T,>(xs: T[], key: (x: T) => string) => { const m = new Map<string, number>(); for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1); return m; };
const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);

export default function ProjectTab({ locations, refreshKey, onSelectLocation, onOpenDoc }: Props) {
  const [data, setData] = useState<ProjectData | null>(null);
  const [sec, setSec] = useState<Section>("programme");
  const [q, setQ] = useState("");
  const [f, setF] = useState("");
  useEffect(() => { fetch("/api/project", { cache: "no-store" }).then((r) => r.json()).then(setData).catch(() => setData(null)); }, [refreshKey]);
  useEffect(() => { setQ(""); setF(""); }, [sec]);
  const db = useMemo(() => (data ? ({ locations, data, docs: [], notes: [], project: { name: "", client: "", code: "" } } as Db) : null), [data, locations]);
  const curve = useMemo(() => (db ? sCurve(db) : []), [db]);
  const byBuilding = useMemo(() => (db ? progressByLocation(db, Object.keys(BUILDING_NAMES)) : []), [db]);
  if (!db || !data) return <div className="proj"><div className="empty pad">Loading project data…</div></div>;

  const Loc = ({ id }: { id: string }) => <a className="loc" onClick={() => onSelectLocation(id)}>{pathOf(locations, id).split(" › ").slice(-1)[0]}</a>;
  const chips = (opts: [string, string][]) => (
    <div className="chips scroll">{opts.map(([v, l]) => <button key={v} className={"chip" + (f === v ? " hot" : "")} onClick={() => setF(f === v ? "" : v)}>{l}</button>)}</div>
  );
  const search = (ph: string) => <input className="search" type="search" placeholder={ph} value={q} onChange={(e) => setQ(e.target.value)} />;

  let body: React.JSX.Element;
  if (sec === "programme") {
    const s = P.scheduleSummary(db);
    // Default view (no filter, no search) = work in progress now.
    const status = f === "progress" || (!f && !q) ? "in_progress" : undefined;
    const res = f === "next2" ? null : P.scheduleQuery(db, { query: q, late: f === "late", critical: f === "critical", status, limit: 60 });
    const la = f === "next2" ? P.lookahead(db, { weeks: 2 }) : null;
    const list = la ? [...(la.milestones ?? []), ...(la.starting ?? [])] : res?.activities ?? [];
    const cp = liveCritical(db), d0 = data.meta.dataDate;
    const groups: [string, string, Activity[]][] = [
      ["late", "Late — completion moves with these", cp.late],
      ["risk", "At risk — behind their own dates", cp.atRisk],
      ["ok", "In progress, on time", cp.inProgress.filter((a) => critState(a, d0) === "ok")],
      ["next", "Starting in the next 14 days", cp.next],
      ["slipped", "Later — already forecast late", cp.slipped.slice(0, 5)],
    ];
    body = (
      <>
        <div className="kpis">
          <Kpi value={s.progressPercent} decimals={1} suffix="%" label="Complete" sub={`baseline plan ${s.plannedPercent}%`} bad={s.progressPercent < s.plannedPercent - 2} />
          <Kpi value={s.spi} decimals={2} label="SPI" sub={s.spi < 0.95 ? "behind schedule" : "on schedule"} bad={s.spi < 0.95} />
          <Kpi value={cp.late.length} label="Critical late now" sub={`${cp.slipped.length} later critical forecast late`} bad={cp.late.length > 0} />
          <Kpi text={s.practicalCompletion?.forecast ?? "—"} label="Completion" sub={`baseline ${s.practicalCompletion?.baseline ?? "—"}`} />
        </div>
        <Panel title="Critical path" sub="Zero-float activities: a day lost on any of them moves practical completion" aside={<span className={"cp-count" + (cp.late.length ? " bad" : "")}>{cp.remaining.length}<em>left</em></span>}>
          {cp.completion && <div className="cp-sum"><span className="cp-l">Practical completion</span><b>{cp.completion.forecast}</b><em>baseline {cp.completion.baseline}</em><Slip d={cp.completion.slip} /></div>}
          {groups.filter(([, , xs]) => xs.length).map(([k, label, xs]) => (
            <div key={k} className="cp-group">
              <div className={"cp-h " + k}>{label}<i>{k === "slipped" ? cp.slipped.length : xs.length}</i></div>
              <ul className="rows">
                {xs.slice(0, 8).map((a) => (
                  <li key={a.id} className={"crit " + critState(a, d0)}>
                    <span className="t"><b>{a.name}</b><em>{a.id} · {a.contractor} · <Loc id={a.locationId} /> · {a.start} → {a.finish}</em>
                      <em className="cp-f">{a.status === "in_progress" ? `${a.percent}% done · dates call for ${expectedPct(a, d0)}%` : a.status === "not_started" ? `starts ${a.start}` : ""}{` · float ${a.totalFloat} d`}</em>
                      {a.status === "in_progress" && <i className="bar"><i style={{ width: `${a.percent}%` }} /></i>}</span>
                    <Slip d={slipOf(a)} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {!cp.remaining.length && <p>No critical activities left.</p>}
        </Panel>
        <Panel title="Progress" sub={`Earned vs baseline at data date ${data.meta.dataDate}`}>
          <div className="side">
            <Ring pct={s.progressPercent} plan={s.plannedPercent} />
            <Gauge value={s.spi} min={0.7} max={1.2} decimals={2} label="Schedule performance" bands={[{ to: 0.9, color: C.crit, name: "Behind" }, { to: 0.97, color: C.warn, name: "Slipping" }, { to: 1.2, color: C.good, name: "On track" }]} />
          </div>
        </Panel>
        <Panel title="S-curve" sub="Cumulative % complete — baseline, earned to date and forecast">
          <Curve points={curve} />
        </Panel>
        <Panel title="Progress by building" sub="Earned % per building; the orange mark is the baseline plan">
          <Columns3D unit="%" max={100} targetLabel="Baseline plan" rows={byBuilding.map((b) => ({ label: BUILDING_NAMES[b.id], value: Math.round(b.earned), target: b.planned, color: b.earned < b.planned - 3 ? C.crit : undefined, sub: b.late ? `${b.late} late` : undefined }))} />
        </Panel>
        <Panel title="Milestones" sub="Baseline ◇ to forecast ●, next six">
          <Timeline items={s.upcomingMilestones.slice(0, 6)} today={data.meta.dataDate} />
        </Panel>
        <div className="lbl">Activities <span className="dd">data date {data.meta.dataDate}</span></div>
        {search("Search activities: slab, façade, L14, TA-…")}
        {chips([["progress", "In progress"], ["late", "Late"], ["critical", "Critical path"], ["next2", "Next 2 weeks"]])}
        <ul className="rows">
          {list.slice(0, 60).map((a) => (
            <li key={a.id} className={isCritical({ critical: a.critical, totalFloat: a.float }) ? "crit" : ""}>
              <span className="t"><b>{isCritical({ critical: a.critical, totalFloat: a.float }) && <span className="ctag">Critical</span>}{a.name}</b><em>{a.id} · {a.start} → {a.finish} · {a.percent}% · float {a.float} d</em>
                <i className="bar"><i style={{ width: `${a.percent}%` }} /></i></span>
              <Slip d={a.slipDays} />
            </li>
          ))}
          {!list.length && <li className="empty">No activities match.</li>}
        </ul>
      </>
    );
  } else if (sec === "procurement") {
    const view = f || "deliveries";
    const in14 = addDays(data.meta.dataDate, 14);
    const dl = P.deliveriesQuery(db, { from: data.meta.dataDate, to: in14, query: q });
    const all14 = P.deliveriesQuery(db, { from: data.meta.dataDate, to: in14 }).deliveries ?? [];
    const pk = P.packagesQuery(db, {}).packages;
    const atRisk = pk.filter((p) => p.floatDays < 0).length;
    const openPo = P.poQuery(db, { limit: 1000 }).purchaseOrders.filter((p) => p.status === "Open" || p.status === "Partially Delivered");
    const low = P.stockQuery(db, { low: true }).stock.length;
    const byStatus = count(pk, (p) => p.status);
    const days = Array.from({ length: 14 }, (_, i) => addDays(data.meta.dataDate, i));
    body = (
      <>
        <div className="kpis">
          <Kpi value={atRisk} label="Packages at risk" sub={`of ${pk.length} packages`} bad={atRisk > 0} />
          <Kpi value={all14.length} label="Deliveries · 14 days" sub={`${all14.filter((d) => d.status === "Delayed").length} delayed`} bad={all14.some((d) => d.status === "Delayed")} />
          <Kpi text={sar(openPo.reduce((s, p) => s + p.value, 0))} label="Open PO value" sub={`${openPo.length} purchase orders`} />
          <Kpi value={low} label="Stock below min" sub="items to reorder" bad={low > 0} />
        </div>
        <Panel title="Packages by status" sub={`Source: ${data.procurement.source}${data.procurement.lastSync ? ` · synced ${data.procurement.lastSync.slice(0, 16).replace("T", " ")}` : ""}`}>
          <Donut3D centre={String(pk.length)} centreSub="packages" segs={Object.keys(PKG_COLORS).map((k) => ({ label: k, value: byStatus.get(k) ?? 0, color: PKG_COLORS[k] }))} />
        </Panel>
        <Panel title="Deliveries · next 14 days" sub="Trucks booked per day through Gate 2; red = a delayed load that day">
          <Columns3D rows={days.map((d) => { const xs = all14.filter((x) => x.date === d); return { label: d.slice(8), sub: new Date(d).toLocaleDateString("en-GB", { weekday: "short" }).slice(0, 2), value: xs.length, color: xs.some((x) => x.status === "Delayed") ? C.crit : undefined }; })} height={120} />
        </Panel>
        <div className="chips scroll">{([["deliveries", "Deliveries"], ["risk", "Packages at risk"], ["packages", "All packages"], ["pos", "Purchase orders"], ["mr", "Material requests"], ["stock", "Stock"]] as const).map(([v, l]) => <button key={v} className={"chip" + (view === v ? " hot" : "")} onClick={() => setF(v)}>{l}</button>)}</div>
        {(view === "pos" || view === "packages" || view === "deliveries") && search(view === "pos" ? "PO number, supplier, item…" : "Search…")}
        <ul className="rows">
          {view === "deliveries" && (dl.deliveries ?? []).map((d) => <li key={d.id}><span className="t"><b>{d.date} {d.slot} — {d.items}</b><em>{d.supplier} · {d.po} · {d.gate} → <Loc id={d.locationId} /> · {d.vehicle}{d.remarks ? ` · ${d.remarks}` : ""}</em></span><span className={"st " + d.status.toLowerCase().replace(" ", "")}>{d.status}</span></li>)}
          {(view === "risk" || view === "packages") && P.packagesQuery(db, { atRisk: view === "risk", query: q }).packages.map((p) => <li key={p.id}><span className="t"><b>{p.id} {p.name}</b><em>{p.supplier || "—"} · {p.status} · need {p.requiredOnSite} · forecast {p.forecastOnSite} · {sar(p.committed)} / {sar(p.budget)}</em><em className="note">{p.notes}</em></span>{p.floatDays < 0 ? <span className="slip late">{p.floatDays} d</span> : <span className="slip ok">ok</span>}</li>)}
          {view === "pos" && P.poQuery(db, { query: q, limit: 60 }).purchaseOrders.map((p) => <li key={p.po}><span className="t"><b>{p.po} — {p.supplier}</b><em>{p.date} · {p.package} · {sar(p.value)}</em><em className="note">{p.items}</em></span><span className={"st " + p.status.toLowerCase().replace(/ /g, "")}>{p.status}</span></li>)}
          {view === "mr" && P.requestsQuery(db, {}).requests.map((m) => <li key={m.id}><span className="t"><b>{m.id} {m.item}</b><em>{m.qty} {m.unit} · need {m.neededBy} · <Loc id={m.locationId} /> · {m.requestedBy}{m.externalRef ? ` · ${m.externalRef}` : ""}</em></span><span className="st">{m.status}</span></li>)}
          {view === "stock" && P.stockQuery(db, {}).stock.map((s) => <li key={s.item + s.locationId}><span className="t"><b>{s.item}</b><em>{s.qty.toLocaleString("en")} {s.unit} (min {s.min.toLocaleString("en")}) · <Loc id={s.locationId} /></em></span>{s.belowMinimum ? <span className="slip late">low</span> : <span className="slip ok">ok</span>}</li>)}
        </ul>
      </>
    );
  } else if (sec === "safety") {
    const h = P.hseOverview(db);
    const st = h.stats as Record<string, number | string>;
    const reqs = data.safety.requirements.filter((r) => !q || `${r.topic} ${r.requirement} ${r.appliesTo.join(" ")}`.toLowerCase().includes(q.toLowerCase()));
    const byType = count(data.safety.incidents, (i) => i.type);
    const permitTypes = [...count(h.activePermits, (p) => p.type).entries()];
    body = (
      <>
        <div className="kpis">
          <Kpi value={Number(st.ltiFreeDays)} label="LTI-free days" sub="lost-time injury free" />
          <Kpi value={Number(st.trir)} decimals={2} label="TRIR" sub="recordable rate" bad={Number(st.trir) >= 1} />
          <Kpi value={Number(st.workforceToday)} label="Workforce today" sub="on site" />
          <Kpi value={h.openIncidents.length} label="Open incidents" sub={`${data.safety.incidents.length} this year`} bad={h.openIncidents.length > 0} />
        </div>
        <Panel title="Safety performance" sub="Total recordable incident rate and the permits live now">
          <div className="side">
            <Gauge value={Number(st.trir)} min={0} max={2} decimals={2} label="TRIR" bands={[{ to: 0.5, color: C.good, name: "Excellent" }, { to: 1, color: C.warn, name: "Watch" }, { to: 2, color: C.crit, name: "High" }]} />
            <Donut3D centre={String(h.activePermits.length)} centreSub="permits" segs={permitTypes.map(([k, v], i) => ({ label: k, value: v, color: PERMIT_COLORS[i % PERMIT_COLORS.length] }))} />
          </div>
        </Panel>
        <Panel title="Incidents by type" sub="Year to date, all severities">
          <Columns3D rows={["Near Miss", "First Aid", "Medical Treatment", "Property Damage", "Environmental", "Unsafe Condition"].map((t) => ({ label: t.split(" ")[0], sub: t.split(" ")[1], value: byType.get(t) ?? 0, color: t === "Medical Treatment" ? C.crit : t === "Near Miss" ? C.warn : undefined }))} height={130} />
        </Panel>
        {chips([["permits", "Active permits"], ["rules", "Requirements"], ["incidents", "Incidents"], ["ppe", "PPE matrix"]])}
        {(f === "" || f === "permits") && <ul className="rows">{h.activePermits.map((p) => <li key={p.id}><span className="t"><b>{p.type}</b><em>{p.id} · {p.location} · until {p.validTo}</em><em className="note">{p.description}</em></span></li>)}</ul>}
        {f === "rules" && <>{search("Search: hot work, edge, crane, heat…")}<ul className="rows">{reqs.map((r) => <li key={r.id}><span className="t"><b>{r.critical ? "⚠ " : ""}{r.topic}</b><em className="note">{r.requirement}</em><em>{r.permit ? `Permit: ${r.permit} · ` : ""}PPE: {r.ppe.join(", ")} · {r.source}</em></span></li>)}</ul></>}
        {f === "incidents" && <ul className="rows">{data.safety.incidents.map((i) => <li key={i.id}><span className="t"><b>{i.type}: {i.description}</b><em>{i.id} · {i.date} · <Loc id={i.locationId} /> · {i.status}</em><em className="note">Root cause: {i.rootCause}. Action: {i.actions}</em></span></li>)}</ul>}
        {f === "ppe" && <ul className="rows">{Object.entries(data.safety.ppeMatrix).map(([k, v]) => <li key={k}><span className="t"><b>{k}</b><em className="note">{v.join(" · ")}</em></span></li>)}</ul>}
      </>
    );
  } else if (sec === "regs") {
    const r = P.regulationsQuery(db, { query: q, status: f || undefined, limit: 100 });
    const all = P.regulationsQuery(db, { limit: 1000 }).regulations;
    const byStatus = count(all, (x) => x.status);
    body = (
      <>
        <div className="disclaimer">{data.meta.disclaimer}</div>
        <Panel title="Compliance" sub="Regulatory items by status">
          <Donut3D centre={String(all.length)} centreSub="items" segs={[["Compliant", C.good], ["In Progress", C.warn], ["Action Required", C.crit]].map(([k, c]) => ({ label: k, value: byStatus.get(k) ?? 0, color: c }))} />
        </Panel>
        {search("Search: SBC 801, Civil Defense, heat, permit…")}
        {chips([["Action Required", "Action required"], ["In Progress", "In progress"], ["Compliant", "Compliant"]])}
        <ul className="rows">{r.regulations.map((x) => <li key={x.id}><span className="t"><b>{x.code} — {x.title}</b><em>{x.authority} · {x.topic} · owner {x.owner} · review {x.nextReview}</em><em className="note">{x.requirement}</em>{x.evidence && <em>Evidence: {x.evidence}</em>}</span><span className={"st " + x.status.toLowerCase().replace(/ /g, "")}>{x.status}</span></li>)}</ul>
      </>
    );
  } else if (sec === "drawings") {
    const r = P.registerQuery(db, { query: q, discipline: f || undefined, limit: 80 });
    const all = data.register;
    const byDisc = count(all, (s) => s.discipline);
    body = (
      <>
        <Panel title="Drawing register" sub={`${all.length} sheets by discipline; red = sheets under review or rejected`}>
          <Columns3D rows={[...byDisc.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, value: v, sub: `${all.filter((s) => s.discipline === k && /review|rejected/i.test(s.status)).length} open`, color: all.some((s) => s.discipline === k && /rejected/i.test(s.status)) ? C.crit : undefined }))} height={130} />
        </Panel>
        {search("Sheet no. or title: TA-STR L14, façade, roof…")}
        {chips([["ARC", "ARC"], ["STR", "STR"], ["MEP", "MEP"], ["FIRE", "FIRE"], ["FAC", "Façade"], ["CIV", "CIV"]])}
        <div className="srcline">{r.count ?? 0} sheets{(r.count ?? 0) > 80 ? " — showing 80, refine the search" : ""}</div>
        <ul className="rows">{(r.sheets ?? []).map((s) => <li key={s.sheet}><span className="t"><b>{s.sheet}</b><em>{s.title}</em><em>Rev {s.rev} · {s.issued} · {s.lastChange}</em></span><span className={"st " + s.status.toLowerCase().replace(/ /g, "")}>{s.status}</span>{s.openableDocId && <button className="mini ask" onClick={() => onOpenDoc(s.openableDocId!)}>Open</button>}</li>)}</ul>
      </>
    );
  } else {
    const r = P.contactsQuery(db, { query: q });
    body = (
      <>
        {search("Role, name, company: lifting, HSE, façade…")}
        <ul className="rows">{(q ? r.contacts : data.contacts).map((c) => <li key={c.name + c.role}><span className="t"><b>{c.name}</b><em>{c.role} · {c.company}{c.area ? ` · ${c.area}` : ""}</em></span><a className="mini call" href={`tel:${c.phone.replace(/\s/g, "")}`}>📞 {c.phone}</a></li>)}</ul>
      </>
    );
  }

  return (
    <div className="proj">
      <div className="ptabs">
        {([["programme", "Programme"], ["procurement", "Procurement"], ["safety", "Safety"], ["regs", "Regulations"], ["drawings", "Drawings"], ["team", "Team"]] as const).map(([k, l]) => (
          <button key={k} className={sec === k ? "on" : ""} onClick={() => setSec(k)}>{l}</button>
        ))}
      </div>
      <div className="projbody" key={sec}>{body}</div>
    </div>
  );
}
