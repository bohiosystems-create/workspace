"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Nav from "../_components/Nav";

const CATEGORIES = ["LP", "Broker", "Lender", "Seller", "Advisor", "Tenant", "Other"];
const STAGES = ["Prospect", "Active", "Committed", "Dormant"];

type Contact = {
  id: string;
  name: string;
  title: string | null;
  company: string | null;
  email: string | null;
  category: string;
  stage: string;
  owner: string | null;
  location: string | null;
  lastContactAt: string | null;
  _count: { interactions: number };
};

type Stats = {
  total: number;
  byCategory: Record<string, number>;
  byStage: Record<string, number>;
  stale: number;
  followUps: Array<{
    id: string;
    contactId: string;
    name: string;
    company: string | null;
    nextStep: string | null;
    followUpOn: string | null;
    overdue: boolean;
  }>;
};

const EMPTY_FORM = {
  name: "",
  title: "",
  company: "",
  email: "",
  phone: "",
  category: "LP",
  stage: "Prospect",
  owner: "",
  location: "",
  notes: "",
};

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function daysSince(s: string | null) {
  if (!s) return null;
  return Math.floor((Date.now() - new Date(s).getTime()) / (24 * 60 * 60 * 1000));
}

export default function CrmPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [stage, setStage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (category) params.set("category", category);
    if (stage) params.set("stage", stage);
    const res = await fetch(`/api/contacts?${params.toString()}`);
    const data = await res.json();
    setContacts(data.contacts ?? []);
    setStats(data.stats ?? null);
    setLoading(false);
  }

  // Initial load + reload on filter change.
  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, category, stage]);

  async function submit() {
    if (!form.name.trim()) {
      setError("A contact name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create the contact.");
      setForm({ ...EMPTY_FORM });
      setShowForm(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="shell">
      <Nav />
      <div className="section-title">Relationships CRM</div>
      <p className="intro">
        Bohio&apos;s internal register of LPs, brokers, lenders, sellers, advisors and
        tenants — with a logged interaction history. Jot a note in plain English and
        Claude files it; draft a follow-up email from a contact&apos;s history in one click.
      </p>

      {/* KPI row */}
      <div className="kpis crm-kpis">
        <div className="kpi">
          <div className="kv">{stats?.total ?? "—"}</div>
          <div className="kl">Contacts</div>
        </div>
        <div className="kpi">
          <div className="kv">{stats?.byStage?.["Committed"] ?? 0}</div>
          <div className="kl">Committed</div>
        </div>
        <div className="kpi">
          <div className="kv">{stats?.byStage?.["Active"] ?? 0}</div>
          <div className="kl">Active</div>
        </div>
        <div className="kpi">
          <div className="kv">{stats?.byStage?.["Prospect"] ?? 0}</div>
          <div className="kl">Prospects</div>
        </div>
        <div className="kpi">
          <div className="kv" style={{ color: (stats?.stale ?? 0) > 0 ? "var(--alert)" : undefined }}>
            {stats?.stale ?? 0}
          </div>
          <div className="kl">Stale &gt;45d</div>
        </div>
      </div>

      {/* Follow-ups due */}
      {stats && stats.followUps.length > 0 && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="chart-label">Follow-ups due</div>
          {stats.followUps.map((f) => (
            <div key={f.id} className={`alert ${f.overdue ? "crit" : "info"}`}>
              <div className="ai">{f.overdue ? "!" : "◷"}</div>
              <div style={{ flex: 1 }}>
                <div className="at">
                  <Link href={`/crm/${f.contactId}`} style={{ textDecoration: "none" }}>
                    {f.name}
                  </Link>
                  {f.company ? <span className="muted"> · {f.company}</span> : null}
                </div>
                <div className="ad">{f.nextStep ?? "Follow up"}</div>
              </div>
              <div className="tag">
                {f.overdue ? "Overdue · " : "Due "}
                {fmtDate(f.followUpOn)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="crm-controls">
        <input
          className="crm-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, company, email…"
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="crm-select">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c} {stats?.byCategory?.[c] ? `(${stats.byCategory[c]})` : ""}
            </option>
          ))}
        </select>
        <select value={stage} onChange={(e) => setStage(e.target.value)} className="crm-select">
          <option value="">All stages</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button className="btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "+ New contact"}
        </button>
      </div>

      {/* New contact form */}
      {showForm && (
        <div className="panel crm-form">
          <div className="row twocol">
            <div className="field">
              <label>Name *</label>
              <input
                className="crm-input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Title</label>
              <input
                className="crm-input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Company</label>
              <input
                className="crm-input"
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Email</label>
              <input
                className="crm-input"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Phone</label>
              <input
                className="crm-input"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Location</label>
              <input
                className="crm-input"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Stage</label>
              <select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Relationship owner</label>
              <input
                className="crm-input"
                value={form.owner}
                onChange={(e) => setForm({ ...form, owner: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Notes</label>
              <input
                className="crm-input"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          {error && <div className="err">{error}</div>}
          <div style={{ marginTop: 14 }}>
            <button className="btn" onClick={submit} disabled={saving}>
              {saving ? <span className="spin" /> : "Save contact"}
            </button>
          </div>
        </div>
      )}

      {/* Contact table */}
      <div className="panel" style={{ padding: 0, marginTop: 8 }}>
        <table className="dtable crm-table">
          <thead>
            <tr>
              <th>Contact</th>
              <th>Category</th>
              <th>Stage</th>
              <th>Owner</th>
              <th>Last contact</th>
              <th className="num">Log</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: 30 }}>
                  <span className="spin dark" /> Loading…
                </td>
              </tr>
            )}
            {!loading && contacts.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: 30 }} className="muted">
                  No contacts match.
                </td>
              </tr>
            )}
            {!loading &&
              contacts.map((c) => {
                const since = daysSince(c.lastContactAt);
                const stale = c.stage !== "Dormant" && (since == null || since > 45);
                return (
                  <tr key={c.id} className="crm-row">
                    <td>
                      <Link href={`/crm/${c.id}`} className="crm-name">
                        {c.name}
                      </Link>
                      <div className="muted crm-sub">
                        {[c.title, c.company].filter(Boolean).join(" · ") || c.email || "—"}
                      </div>
                    </td>
                    <td>
                      <span className="pill">{c.category}</span>
                    </td>
                    <td>
                      <span className={`pill stage-${c.stage.toLowerCase()}`}>{c.stage}</span>
                    </td>
                    <td className="muted">{c.owner ?? "—"}</td>
                    <td className={stale ? "crm-stale" : ""}>
                      {fmtDate(c.lastContactAt)}
                      {since != null ? <span className="crm-ago"> · {since}d</span> : null}
                    </td>
                    <td className="num">{c._count.interactions}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
