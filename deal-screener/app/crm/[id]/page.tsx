"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Nav from "../../_components/Nav";

const CHANNELS = ["Call", "Email", "Meeting", "Note"];

type Interaction = {
  id: string;
  date: string;
  channel: string;
  summary: string;
  sentiment: string | null;
  nextStep: string | null;
  followUpOn: string | null;
};

type Contact = {
  id: string;
  name: string;
  title: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  category: string;
  stage: string;
  owner: string | null;
  location: string | null;
  notes: string | null;
  lastContactAt: string | null;
  interactions: Interaction[];
};

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ContactPage() {
  const params = useParams();
  const id = params.id as string;

  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Log interaction state
  const [mode, setMode] = useState<"note" | "structured">("note");
  const [note, setNote] = useState("");
  const [channel, setChannel] = useState("Call");
  const [summary, setSummary] = useState("");
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  // Follow-up draft state
  const [instruction, setInstruction] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/contacts/${id}`);
    if (res.status === 404) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setContact(data.contact);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function logInteraction() {
    setLogError(null);
    const body =
      mode === "note"
        ? { note: note.trim() }
        : { channel, summary: summary.trim() };
    if (mode === "note" ? !note.trim() : !summary.trim()) {
      setLogError("Please write something to log.");
      return;
    }
    setLogging(true);
    try {
      const res = await fetch(`/api/contacts/${id}/interactions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not log the interaction.");
      setNote("");
      setSummary("");
      await load();
    } catch (e: any) {
      setLogError(e.message);
    } finally {
      setLogging(false);
    }
  }

  async function draftFollowUp() {
    setDraftError(null);
    setEmail(null);
    setCopied(false);
    setDrafting(true);
    try {
      const res = await fetch(`/api/contacts/${id}/followup`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ instruction: instruction.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not draft the follow-up.");
      setEmail(data.email);
    } catch (e: any) {
      setDraftError(e.message);
    } finally {
      setDrafting(false);
    }
  }

  function copyEmail() {
    if (!email) return;
    navigator.clipboard?.writeText(email).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  if (loading) {
    return (
      <div className="shell">
        <Nav />
        <div className="muted" style={{ padding: 40, textAlign: "center" }}>
          <span className="spin dark" /> Loading…
        </div>
      </div>
    );
  }

  if (notFound || !contact) {
    return (
      <div className="shell">
        <Nav />
        <div className="panel">
          <div className="section-title">Contact not found</div>
          <p className="intro">
            <Link href="/crm">← Back to the CRM</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <Nav />
      <Link href="/crm" className="muted crm-back">
        ← Relationships CRM
      </Link>

      {/* Contact header */}
      <div className="panel crm-detail-head">
        <div>
          <div className="crm-detail-name">{contact.name}</div>
          <div className="muted crm-detail-sub">
            {[contact.title, contact.company].filter(Boolean).join(" · ") || "—"}
          </div>
          <div className="crm-detail-tags">
            <span className="pill">{contact.category}</span>
            <span className={`pill stage-${contact.stage.toLowerCase()}`}>{contact.stage}</span>
            {contact.location ? <span className="tag">{contact.location}</span> : null}
          </div>
        </div>
        <div className="crm-detail-meta">
          {contact.email ? (
            <div>
              <span className="crm-meta-l">Email</span> {contact.email}
            </div>
          ) : null}
          {contact.phone ? (
            <div>
              <span className="crm-meta-l">Phone</span> {contact.phone}
            </div>
          ) : null}
          {contact.owner ? (
            <div>
              <span className="crm-meta-l">Owner</span> {contact.owner}
            </div>
          ) : null}
          <div>
            <span className="crm-meta-l">Last contact</span> {fmtDate(contact.lastContactAt)}
          </div>
        </div>
      </div>

      {contact.notes ? (
        <div className="panel crm-notes">
          <div className="chart-label">Notes</div>
          <div className="muted" style={{ lineHeight: 1.6 }}>
            {contact.notes}
          </div>
        </div>
      ) : null}

      <div className="row twocol" style={{ alignItems: "start", marginTop: 4 }}>
        {/* Left: log + timeline */}
        <div>
          <div className="panel crm-log">
            <div className="chart-label">Log an interaction</div>
            <div className="crm-mode">
              <button
                className={`crm-tab ${mode === "note" ? "active" : ""}`}
                onClick={() => setMode("note")}
              >
                Quick note (AI)
              </button>
              <button
                className={`crm-tab ${mode === "structured" ? "active" : ""}`}
                onClick={() => setMode("structured")}
              >
                Structured
              </button>
            </div>

            {mode === "note" ? (
              <>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={`e.g. Called ${contact.name.split(" ")[0]} — happy with Q1 returns, wants the Andalus schedule by next week`}
                  style={{ minHeight: 90 }}
                />
                <div className="muted crm-hint">
                  Claude infers the channel, cleans up the summary, tags sentiment and sets a
                  follow-up date.
                </div>
              </>
            ) : (
              <>
                <div className="field" style={{ marginBottom: 10 }}>
                  <label>Channel</label>
                  <select value={channel} onChange={(e) => setChannel(e.target.value)}>
                    {CHANNELS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="What happened?"
                  style={{ minHeight: 90 }}
                />
              </>
            )}

            {logError && <div className="err">{logError}</div>}
            <div style={{ marginTop: 12 }}>
              <button className="btn" onClick={logInteraction} disabled={logging}>
                {logging ? <span className="spin" /> : mode === "note" ? "File with AI" : "Log"}
              </button>
            </div>
          </div>

          {/* Timeline */}
          <div className="chart-label" style={{ marginTop: 22 }}>
            Interaction history
          </div>
          {contact.interactions.length === 0 ? (
            <div className="muted" style={{ padding: "8px 0" }}>
              No interactions logged yet.
            </div>
          ) : (
            <div className="crm-timeline">
              {contact.interactions.map((it) => (
                <div key={it.id} className="crm-event">
                  <div className="crm-event-head">
                    <span className="pill">{it.channel}</span>
                    {it.sentiment ? (
                      <span className={`crm-sent crm-sent-${it.sentiment.toLowerCase()}`}>
                        {it.sentiment}
                      </span>
                    ) : null}
                    <span className="crm-event-date">{fmtDate(it.date)}</span>
                  </div>
                  <div className="crm-event-body">{it.summary}</div>
                  {it.nextStep ? (
                    <div className="crm-next">
                      <b>Next:</b> {it.nextStep}
                      {it.followUpOn ? (
                        <span className="tag" style={{ marginLeft: 8 }}>
                          by {fmtDate(it.followUpOn)}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: AI follow-up */}
        <div className="panel crm-followup">
          <div className="chart-label">Draft a follow-up email</div>
          <div className="muted crm-hint" style={{ marginBottom: 10 }}>
            Claude writes a follow-up from this contact&apos;s history — picking up on the
            latest open item. Add an optional instruction to steer it.
          </div>
          <input
            className="crm-input"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Optional: e.g. keep it brief, propose a call next week"
          />
          <div style={{ marginTop: 12 }}>
            <button className="btn" onClick={draftFollowUp} disabled={drafting}>
              {drafting ? <span className="spin" /> : "Draft email"}
            </button>
          </div>

          {draftError && <div className="err">{draftError}</div>}

          {email && (
            <div className="crm-email">
              <pre className="crm-email-body">{email}</pre>
              <button className="btn ghost crm-copy" onClick={copyEmail}>
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
