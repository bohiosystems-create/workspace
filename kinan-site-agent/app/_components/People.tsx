"use client";
/**
 * People & permissions: everyone who can sign in (by their mobile number), their role and what that role may approve.
 * Managers and directors can look; admins (KINAN_ADMINS) can add people and change roles.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Person, Role } from "@/lib/auth/people";
import { Icon } from "./icons";

type Data = { people: Person[]; canEdit: boolean; roles: { id: Role; label: string; limits: string }[] };
const ROLES: Role[] = ["field", "supervisor", "manager", "director", "admin"];

export default function People({ onBack }: { onBack: () => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [q, setQ] = useState("");
  const [add, setAdd] = useState({ phone: "", name: "", role: "manager" as Role, domain: "all" as Person["domain"] });
  const load = useCallback(() => { fetch("/api/people", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j.error) setErr(j.error); else setD(j); }).catch(() => setErr("Could not load the directory.")); }, []);
  useEffect(() => { load(); window.addEventListener("kinan:auth", load); return () => window.removeEventListener("kinan:auth", load); }, [load]);
  const save = async (b: Record<string, unknown>) => {
    setErr(""); setOk("");
    const r = await fetch("/api/people", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) { setErr(j.error ?? "Failed."); return false; }
    setOk("Saved — it applies at once, on the app and WhatsApp."); load(); return true;
  };
  const xs = useMemo(() => (d?.people ?? []).filter((p) => !q || `${p.name} ${p.title} ${p.org} ${p.role} ${p.phone}`.toLowerCase().includes(q.toLowerCase())), [d, q]);
  return (
    <div className="home">
      <button className="crumb" onClick={onBack}><Icon name="back" />Today</button>
      <div className="home-head"><div><h1>People &amp; permissions</h1><p>Everyone signs in with their own mobile number (a code sent from their WhatsApp). Their role decides what they may approve; the agent applies the same limits on WhatsApp.</p></div></div>
      {err && <div className="studio-err">{err}</div>}
      {ok && <div className="studio-ok">{ok}</div>}
      {d && (
        <section className="ops-panel">
          <div className="rpt-label">Roles and approval limits</div>
          <ul className="pp-roles">{d.roles.map((r) => <li key={r.id}><span className={`role-pill ${r.id}`}>{r.label}</span> {r.limits}</li>)}</ul>
        </section>
      )}
      {d?.canEdit && (
        <form className="ops-panel pp-add" onSubmit={async (e) => { e.preventDefault(); if (await save(add)) setAdd({ ...add, phone: "", name: "" }); }}>
          <div className="rpt-label">Add a person</div>
          <div className="ops-row">
            <input className="ops-search" placeholder="Mobile with country code, e.g. 966548363683" value={add.phone} onChange={(e) => setAdd({ ...add, phone: e.target.value })} inputMode="tel" />
            <input className="ops-search" placeholder="Name" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} />
            <select className="ops-search" value={add.role} onChange={(e) => setAdd({ ...add, role: e.target.value as Role })}>{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select>
            <select className="ops-search" value={add.domain} onChange={(e) => setAdd({ ...add, domain: e.target.value as Person["domain"] })}><option value="all">Construction &amp; operations</option><option value="site">Construction</option><option value="fm">Operations</option></select>
            <button className="studio-add" disabled={add.phone.replace(/\D/g, "").length < 8}>Add</button>
          </div>
        </form>
      )}
      {d && (
        <section className="ops-panel">
          <div className="ops-row"><div className="rpt-label">Directory · {xs.length}</div><span className="grow" /><input className="ops-search" type="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="ops-tablewrap"><table className="ops-table">
            <thead><tr><th>Name</th><th>Role</th><th>Covers</th><th>Mobile</th><th>Source</th></tr></thead>
            <tbody>{xs.map((p) => (
              <tr key={p.id}>
                <td><b>{p.name}</b><em className="pp-sub">{p.title} · {p.org}</em></td>
                <td>{d.canEdit && p.source !== "env" ? <select value={p.role} onChange={(e) => save({ phone: p.phone, name: p.name, role: e.target.value, domain: p.domain, facilityId: p.facilityId, title: p.title })}>{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select> : <span className={`role-pill ${p.role}`}>{p.role}</span>}</td>
                <td>{p.domain === "all" ? "Everything" : p.domain === "site" ? "Construction" : p.org}</td>
                <td>+{p.phone}</td>
                <td>{p.source === "env" ? "KINAN_ADMINS" : p.source === "admin" ? "added in the app" : "directory"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </section>
      )}
    </div>
  );
}
