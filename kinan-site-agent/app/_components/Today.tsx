"use client";
/**
 * Today — the first screen. For a manager the product is the morning brief and the decisions waiting: the day in a
 * few lines (construction and every facility), the approvals queue across all of them with the reasons and the money,
 * and how the decisions are working out. The maps, schedules and control rooms are one tap away for the detail.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { today as todayFn } from "@/lib/approvals";
import { Decide } from "./Decide";
import { OutcomesPanel } from "./Outcomes";
import type { RejectReason } from "@/lib/proposals";

type T = ReturnType<typeof todayFn>;
type Item = T["approvals"][number];
const sar = (n: number) => `SAR ${Math.round(n).toLocaleString("en-US")}`;
const greet = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };

export default function Today({ onGo, onSignIn }: { onGo: (target: string) => void; onSignIn: () => void }) {
  const [t, setT] = useState<T | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [scope, setScope] = useState<string>("mine");
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => { fetch("/api/today", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j.error) setErr(j.error); else { setT(j); setErr(""); } }).catch(() => setErr("Could not load today's picture.")); }, []);
  useEffect(() => {
    load();
    window.addEventListener("kinan:changed", load); window.addEventListener("kinan:auth", load);
    return () => { window.removeEventListener("kinan:changed", load); window.removeEventListener("kinan:auth", load); };
  }, [load]);

  const decide = async (it: Item, decision: "approved" | "rejected", reason?: RejectReason) => {
    setBusy(it.key); setMsg(null);
    try {
      const r = await fetch("/api/approvals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: it.key, decision, reason }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error ?? "Failed.");
      setMsg({ text: j.message }); load();
    } catch (e) { setMsg({ text: (e as Error).message, bad: true }); }
    finally { setBusy(null); }
  };

  const scopes = useMemo(() => {
    if (!t) return [];
    const m = new Map<string, string>();
    for (const a of t.approvals) m.set(a.scopeId, a.scopeName);
    return [...m.entries()];
  }, [t]);
  if (!t) return <div className="home"><p className="muted">{err || "Loading today…"}</p></div>;
  const eff = !t.me && scope === "mine" ? "all" : scope; // signed out: nothing is "mine"
  const list = t.approvals.filter((a) => (eff === "mine" ? a.can.ok && !a.autopilot : eff === "all" ? true : a.scopeId === eff));
  const shown = more ? list : list.slice(0, 8);
  const first = t.me?.name.split(" ")[0];
  return (
    <div className="home today">
      <div className="home-head"><div>
        <h1>{t.me ? `${greet()}, ${first}` : "Today"}</h1>
        <p>{t.me ? <>{t.me.title} · {t.me.org} · <b>{t.me.roleLabel}</b> — {t.me.limits}.</> : <>The day across the building site and every facility, and the decisions waiting. <button className="linkish" onClick={onSignIn}>Sign in</button> to approve — what you may approve depends on your role.</>}</p>
      </div></div>

      <section className="td-day">
        <div className="rpt-label">The day · {t.date}</div>
        <ul>{t.lines.map((l, i) => <li key={i}><button onClick={() => l.go && onGo(l.go)}><span className={`td-dot ${l.tone}`} aria-hidden="true" /><span className="grow">{l.text}</span><span className="td-go" aria-hidden="true">›</span></button></li>)}</ul>
        <div className="td-acts"><button className="studio-add" onClick={() => onGo("reports")}>Open the full brief</button><button className="mini" onClick={() => onGo("home")}>All projects &amp; facilities</button></div>
      </section>

      <section className="td-appr">
        <div className="ops-row">
          <div className="rpt-label">{t.me ? `Waiting for you · ${t.counts.mine}` : `Decisions waiting · ${t.counts.all}`}</div>
          <span className="grow" />
          {t.me && t.counts.money > 0 && <span className="muted small">{sar(t.counts.money)} if you approve all of yours</span>}
        </div>
        <div className="chips scroll">
          {t.me && <button className={"chip" + (eff === "mine" ? " hot" : "")} onClick={() => setScope("mine")}>Mine<i>{t.counts.mine}</i></button>}
          <button className={"chip" + (eff === "all" ? " hot" : "")} onClick={() => setScope("all")}>All<i>{t.counts.all}</i></button>
          {scopes.map(([id, name]) => <button key={id} className={"chip" + (eff === id ? " hot" : "")} onClick={() => setScope(id)}>{name.replace(/^Kinan\s+/, "").replace(/ — Terminal 2$/, " T2")}<i>{t.approvals.filter((a) => a.scopeId === id).length}</i></button>)}
        </div>
        {msg && <div className={msg.bad ? "studio-err" : "studio-ok"} role="status">{msg.text}</div>}
        {list.length === 0 && <p className="muted">{eff === "mine" ? "Nothing waiting for you. The rest is under “All”." : "Nothing proposed here."}</p>}
        <ul className="ops-actions">
          {shown.map((a) => (
            <li key={a.key} className={`risk-${a.risk}`}>
              <div className="oa-head">
                <span className={`ops-pill ${a.risk}`}>{a.risk} risk</span><span className="oa-kind">{a.kindLabel}</span>
                <span className="td-scope">{a.scopeName.replace(/ — Terminal 2$/, " T2")}</span>
                {a.cost ? <span className="td-cost">{sar(a.cost)}{a.costNote ? " est." : ""}</span> : null}
                {a.autopilot && <span className="oa-auto">the autopilot will do this</span>}
              </div>
              <button className="td-title" onClick={() => setOpen(open === a.key ? null : a.key)} aria-expanded={open === a.key}><b>{a.title}</b></button>
              {(open === a.key || a.risk !== "low") && <ul className="oa-why">{a.why.map((y, i) => <li key={i}>{y}</li>)}{a.owner && <li>Carried out by {a.owner}</li>}</ul>}
              <Decide can={a.can} busy={busy === a.key} onApprove={() => decide(a, "approved")} onReject={(r) => decide(a, "rejected", r)} onSignIn={onSignIn} />
            </li>
          ))}
        </ul>
        {list.length > 8 && <button className="mini" onClick={() => setMore((m) => !m)}>{more ? "Show fewer" : `Show all ${list.length}`}</button>}
      </section>

      <section>
        <div className="rpt-label">How the decisions are working out</div>
        <OutcomesPanel o={t.outcomes} />
      </section>
    </div>
  );
}
