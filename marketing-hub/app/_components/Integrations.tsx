"use client";
// The settings panel (gear icon, top right): every integration — Meta and the other social / ad platforms, Outlook,
// the calendars, live news, the business systems and AI — with its status, what it brings and how to connect it.
// Only non-secret settings are saved here (news cities, calendar links); keys stay on the server.
import { useEffect, useState } from "react";
import { useI18n } from "./lang";

const DOT: Record<string, string> = { connected: "#1f8a4c", builtin: "#1f8a4c", snapshot: "#2a78d6", sample: "#d99400", available: "#9c9ea1", off: "#9c9ea1" };

export default function Integrations({ onClose }: { onClose: () => void }) {
  const { t, lang } = useI18n();
  const [d, setD] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState<{ newsCities: string; icsUrls: string; newsOn: boolean }>({ newsCities: "", icsUrls: "", newsOn: true });
  const [open, setOpen] = useState<string | null>(null);
  const take = (x: any) => { setD(x); setForm({ newsCities: x.settings.newsCities ?? "", icsUrls: x.settings.icsUrls ?? "", newsOn: x.settings.newsOn !== false }); };
  useEffect(() => { fetch(`/api/integrations?lang=${lang}`).then((r) => r.json()).then((x) => !x.error && take(x)).catch(() => {}); }, [lang]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  async function post(body: any, key: string) {
    setBusy(key); setMsg(null);
    try { const x = await (await fetch("/api/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, lang }) })).json(); if (x.error) throw new Error(x.error); take(x); setMsg(x.message ?? null); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(null); }
  }
  const label: Record<string, string> = { connected: t("Connected"), builtin: t("Built in"), sample: t("Sample data"), snapshot: t("Real-news snapshot"), available: t("Not connected"), off: t("Off") };
  return (
    <>
      <div className="ig-scrim" onClick={onClose} />
      <aside className="ig-panel" role="dialog" aria-label={t("Settings and integrations")}>
        <div className="ig-head">
          <div><div className="ig-title">{t("Settings and integrations")}</div>{d && <div className="ig-sub">{d.summary.connected} / {d.summary.total} {t("connected or built in")} · {d.note}</div>}</div>
          <button className="rp-x" aria-label={t("Close")} onClick={onClose}>×</button>
        </div>
        {msg && <div className="alert info" style={{ padding: "8px 12px", margin: "0 0 10px", fontSize: 12 }}>{msg}</div>}
        {!d && <div className="muted"><span className="spin dark" /> {t("Loading…")}</div>}
        {d?.groups.map((g: any) => (
          <section key={g.id} className="ig-group">
            <div className="chart-label">{g.name}</div>
            {g.items.map((x: any) => (
              <div key={x.id} className={`ig-item ${open === x.id ? "open" : ""}`}>
                <button className="ig-row" onClick={() => setOpen(open === x.id ? null : x.id)} aria-expanded={open === x.id}>
                  <span className="ig-dot" style={{ background: DOT[x.status] }} />
                  <span className="ig-name"><b>{x.name}</b><span>{x.detail}</span></span>
                  <span className={`ig-pill ${x.status}`}>{label[x.status]}</span>
                </button>
                {open === x.id && (
                  <div className="ig-body">
                    <p><b>{t("What it brings")}:</b> {x.brings}</p>
                    <p><b>{t("How to connect")}:</b> {x.connect}</p>
                    {x.env.length > 0 && <p className="muted" style={{ fontSize: 11 }}>{t("Server settings")}: <span dir="ltr">{x.env.join(", ")}</span></p>}
                    {x.editable.includes("icsUrls") && (
                      <div className="field"><label>{t("Calendar links (ICS), comma-separated")}</label>
                        <input className="in" dir="ltr" placeholder="https://outlook.office365.com/owa/calendar/…/calendar.ics" value={form.icsUrls} onChange={(e) => setForm({ ...form, icsUrls: e.target.value })} /></div>
                    )}
                    {x.editable.includes("newsCities") && (
                      <div className="field"><label>{t("Cities to follow")}</label>
                        <input className="in" dir="ltr" placeholder="Jeddah, Riyadh" value={form.newsCities} onChange={(e) => setForm({ ...form, newsCities: e.target.value })} /></div>
                    )}
                    {x.editable.includes("newsOn") && <label className="muted" style={{ fontSize: 11, display: "flex", gap: 6, alignItems: "center", margin: "6px 0" }}><input type="checkbox" checked={form.newsOn} onChange={(e) => setForm({ ...form, newsOn: e.target.checked })} />{t("Read the news every few hours")}</label>}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                      {x.editable.length > 0 && <button className="btn" style={{ padding: "6px 12px", fontSize: 9 }} disabled={busy === `save-${x.id}`} onClick={() => post({ action: "SAVE", ...(x.editable.includes("icsUrls") ? { icsUrls: form.icsUrls } : {}), ...(x.editable.includes("newsCities") ? { newsCities: form.newsCities, newsOn: form.newsOn } : {}) }, `save-${x.id}`)}>{t("Save")}</button>}
                      {x.test && <button className="btn ghost" style={{ padding: "6px 12px", fontSize: 9 }} disabled={busy === `test-${x.id}`} onClick={() => post({ action: "TEST", id: x.id }, `test-${x.id}`)}>{busy === `test-${x.id}` ? t("Testing…") : t("Test connection")}</button>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </section>
        ))}
      </aside>
    </>
  );
}
