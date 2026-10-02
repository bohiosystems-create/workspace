"use client";
import { useEffect, useMemo, useState } from "react";
import type { Db, Location, ProjectData } from "@/lib/types";
import * as P from "@/lib/core/project";
import { pathOf } from "./site";

type Section = "programme" | "procurement" | "safety" | "regs" | "drawings" | "team";
interface Props { locations: Location[]; refreshKey: number; onAsk: (q: string) => void; onSelectLocation: (id: string) => void; onOpenDoc: (id: string) => void }

const sar = (n: number) => (n >= 1e6 ? `SAR ${(n / 1e6).toFixed(1)}M` : `SAR ${Math.round(n).toLocaleString("en")}`);
const Slip = ({ d }: { d: number }) => (d > 0 ? <span className="slip late">+{d} d</span> : d < 0 ? <span className="slip early">{d} d</span> : <span className="slip ok">on time</span>);

export default function ProjectTab({ locations, refreshKey, onAsk, onSelectLocation, onOpenDoc }: Props) {
  const [data, setData] = useState<ProjectData | null>(null);
  const [sec, setSec] = useState<Section>("programme");
  const [q, setQ] = useState("");
  const [f, setF] = useState("");
  useEffect(() => { fetch("/api/project", { cache: "no-store" }).then((r) => r.json()).then(setData).catch(() => setData(null)); }, [refreshKey]);
  useEffect(() => { setQ(""); setF(""); }, [sec]);
  const db = useMemo(() => (data ? ({ locations, data, docs: [], notes: [], project: { name: "", client: "", code: "" } } as Db) : null), [data, locations]);
  if (!db || !data) return <div className="proj"><div className="empty pad">Loading project data…</div></div>;

  const Loc = ({ id }: { id: string }) => <a className="loc" onClick={() => onSelectLocation(id)}>{pathOf(locations, id).split(" › ").slice(-1)[0]}</a>;
  const Ask = ({ text }: { text: string }) => <button className="mini ask" onClick={() => onAsk(text)}>Ask ✦</button>;
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
    body = (
      <>
        <div className="kpis">
          <div><b>{s.progressPercent}%</b><em>complete · plan {s.plannedPercent}%</em></div>
          <div><b className={s.spi < 0.95 ? "bad" : ""}>{s.spi}</b><em>SPI</em></div>
          <div><b>{s.practicalCompletion?.forecast}</b><em>completion · BL {s.practicalCompletion?.baseline}</em></div>
        </div>
        <div className="lbl">Next milestones</div>
        <ul className="rows">{s.upcomingMilestones.slice(0, 5).map((m) => <li key={m.id}><span className="t"><b>{m.name}</b><em>{m.forecast} · baseline {m.baseline}</em></span><Slip d={m.varianceDays} /></li>)}</ul>
        <div className="lbl">Activities <span className="dd">data date {data.meta.dataDate}</span></div>
        {search("Search activities: slab, façade, L14, TA-…")}
        {chips([["progress", "In progress"], ["late", "Late"], ["critical", "Critical"], ["next2", "Next 2 weeks"]])}
        <ul className="rows">
          {list.slice(0, 60).map((a) => (
            <li key={a.id}>
              <span className="t"><b>{a.name}</b><em>{a.id} · {a.start} → {a.finish} · {a.percent}%{a.critical ? " · critical" : ""}</em>
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
    const in14 = new Date(Date.parse(data.meta.dataDate) + 14 * 86400000).toISOString().slice(0, 10);
    const dl = P.deliveriesQuery(db, { from: data.meta.dataDate, to: in14, query: q });
    body = (
      <>
        <div className="srcline">Source: <b>{data.procurement.source}</b>{data.procurement.lastSync ? ` · synced ${data.procurement.lastSync.slice(0, 16).replace("T", " ")}` : ""}</div>
        <div className="chips scroll">{([["deliveries", "Deliveries"], ["risk", "Packages at risk"], ["packages", "All packages"], ["pos", "Purchase orders"], ["mr", "Material requests"], ["stock", "Stock"]] as const).map(([v, l]) => <button key={v} className={"chip" + (view === v ? " hot" : "")} onClick={() => setF(v)}>{l}</button>)}</div>
        {(view === "pos" || view === "packages" || view === "deliveries") && search(view === "pos" ? "PO number, supplier, item…" : "Search…")}
        <ul className="rows">
          {view === "deliveries" && (dl.deliveries ?? []).map((d) => <li key={d.id}><span className="t"><b>{d.date} {d.slot} — {d.items}</b><em>{d.supplier} · {d.po} · {d.gate} → <Loc id={d.locationId} /> · {d.vehicle}{d.remarks ? ` · ${d.remarks}` : ""}</em></span><span className={"st " + d.status.toLowerCase().replace(" ", "")}>{d.status}</span></li>)}
          {(view === "risk" || view === "packages") && P.packagesQuery(db, { atRisk: view === "risk", query: q }).packages.map((p) => <li key={p.id}><span className="t"><b>{p.id} {p.name}</b><em>{p.supplier || "—"} · {p.status} · need {p.requiredOnSite} · forecast {p.forecastOnSite} · {sar(p.committed)} / {sar(p.budget)}</em><em className="note">{p.notes}</em></span>{p.floatDays < 0 ? <span className="slip late">{p.floatDays} d</span> : <span className="slip ok">ok</span>}<Ask text={`What is the schedule impact of ${p.id} ${p.name}, and what should we do?`} /></li>)}
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
    body = (
      <>
        <div className="kpis">
          <div><b>{st.ltiFreeDays}</b><em>LTI-free days</em></div>
          <div><b>{st.trir}</b><em>TRIR</em></div>
          <div><b>{Number(st.workforceToday).toLocaleString("en")}</b><em>workforce today</em></div>
        </div>
        {chips([["permits", "Active permits"], ["rules", "Requirements"], ["incidents", "Incidents"], ["ppe", "PPE matrix"]])}
        {(f === "" || f === "permits") && <ul className="rows">{h.activePermits.map((p) => <li key={p.id}><span className="t"><b>{p.type}</b><em>{p.id} · {p.location} · until {p.validTo}</em><em className="note">{p.description}</em></span></li>)}</ul>}
        {f === "rules" && <>{search("Search: hot work, edge, crane, heat…")}<ul className="rows">{reqs.map((r) => <li key={r.id}><span className="t"><b>{r.critical ? "⚠ " : ""}{r.topic}</b><em className="note">{r.requirement}</em><em>{r.permit ? `Permit: ${r.permit} · ` : ""}PPE: {r.ppe.join(", ")} · {r.source}</em></span></li>)}</ul></>}
        {f === "incidents" && <ul className="rows">{data.safety.incidents.map((i) => <li key={i.id}><span className="t"><b>{i.type}: {i.description}</b><em>{i.id} · {i.date} · <Loc id={i.locationId} /> · {i.status}</em><em className="note">Root cause: {i.rootCause}. Action: {i.actions}</em></span></li>)}</ul>}
        {f === "ppe" && <ul className="rows">{Object.entries(data.safety.ppeMatrix).map(([k, v]) => <li key={k}><span className="t"><b>{k}</b><em className="note">{v.join(" · ")}</em></span></li>)}</ul>}
      </>
    );
  } else if (sec === "regs") {
    const r = P.regulationsQuery(db, { query: q, status: f || undefined, limit: 100 });
    body = (
      <>
        <div className="disclaimer">{data.meta.disclaimer}</div>
        {search("Search: SBC 801, Civil Defense, heat, permit…")}
        {chips([["Action Required", "Action required"], ["In Progress", "In progress"], ["Compliant", "Compliant"]])}
        <ul className="rows">{r.regulations.map((x) => <li key={x.id}><span className="t"><b>{x.code} — {x.title}</b><em>{x.authority} · {x.topic} · owner {x.owner} · review {x.nextReview}</em><em className="note">{x.requirement}</em>{x.evidence && <em>Evidence: {x.evidence}</em>}</span><span className={"st " + x.status.toLowerCase().replace(/ /g, "")}>{x.status}</span></li>)}</ul>
      </>
    );
  } else if (sec === "drawings") {
    const r = P.registerQuery(db, { query: q, discipline: f || undefined, limit: 80 });
    body = (
      <>
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
      <div className="projbody">{body}</div>
    </div>
  );
}
