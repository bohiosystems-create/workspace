"use client";
import { useEffect, useState } from "react";

interface Target { provider: string; model: string }
interface Status {
  editable: boolean;
  providers: { anthropic: boolean; openai: boolean };
  available: string[]; mode: string; fallback: boolean;
  routes: Record<"fast" | "main" | "deep", Target[]>;
  transcription: string | null;
  procurement?: { provider: string; lastSync?: string; source: string };
  whatsapp?: boolean;
  storage?: string;
  keys?: { anthropic?: string; openai?: string };
  builtin?: boolean;
}
const TIER: Record<string, string> = { fast: "Fast — short lookups & commands", main: "Main — normal questions", deep: "Deep — analysis, delay/risk, reports" };
const fmt = (ts: Target[]) => ts.map((t) => `${t.provider}:${t.model}`).join(", ");

export default function SettingsSheet({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<Status | null>(null);
  const [form, setForm] = useState({ anthropic: "", openai: "", mode: "auto", fallback: true, fast: "", main: "", deep: "" });
  const [saved, setSaved] = useState("");
  const load = () => fetch("/api/llm", { cache: "no-store" }).then((r) => r.json()).then((j: Status) => {
    setS(j);
    setForm({ anthropic: j.keys?.anthropic ?? "", openai: j.keys?.openai ?? "", mode: j.mode, fallback: j.fallback, fast: fmt(j.routes.fast), main: fmt(j.routes.main), deep: fmt(j.routes.deep) });
  });
  useEffect(() => { load(); }, []);
  const save = async () => {
    await fetch("/api/llm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    setSaved("Saved ✓"); load();
  };
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });

  return (
    <div className="modal" role="dialog" aria-label="AI settings">
      <div className="modal-card">
        <div className="sheet-h"><b>AI &amp; integrations</b><button className="x" onClick={onClose} aria-label="Close">✕</button></div>
        {!s ? <div className="empty">Loading…</div> : (
          <>
            <div className="provs">
              <span className={s.providers.anthropic ? "on" : ""}>✳ Anthropic {s.providers.anthropic ? "connected" : "not set"}</span>
              <span className={s.providers.openai ? "on" : ""}>◎ OpenAI {s.providers.openai ? "connected" : "not set"}</span>
            </div>
            <p className="keybox">
              Every question is classified as <b>fast</b>, <b>main</b> or <b>deep</b> and sent to the first available model on that tier&apos;s list.
              If a provider errors or times out, the next one is tried{s.fallback ? "" : " (fallback is OFF)"}. Photos/PDFs prefer Claude. With no provider, a built-in offline assistant answers.
            </p>
            <table className="routes"><tbody>
              {(["fast", "main", "deep"] as const).map((t) => (
                <tr key={t}><th>{TIER[t]}</th><td>{s.routes[t].map((x, i) => <span key={i} className={"rt " + (s.available.includes(x.provider) ? "" : "off")}>{i ? "→ " : ""}{x.provider === "anthropic" ? "Claude" : "OpenAI"} {x.model}</span>)}</td></tr>
              ))}
              <tr><th>Voice notes</th><td>{s.transcription ? `OpenAI ${s.transcription}` : "needs OpenAI key"}</td></tr>
              {s.procurement && <tr><th>Purchasing system</th><td>{s.procurement.provider}{s.procurement.lastSync ? ` · synced ${s.procurement.lastSync.slice(0, 16).replace("T", " ")}` : ""}</td></tr>}
              {s.whatsapp !== undefined && <tr><th>WhatsApp</th><td>{s.whatsapp ? "connected" : "not configured"}</td></tr>}
              {s.storage && <tr><th>Storage</th><td>{s.storage === "blob" ? "Vercel Blob (private)" : s.storage === "tmp" ? <b className="bad">temporary — connect Vercel Blob</b> : "server disk"}</td></tr>}
            </tbody></table>
            {s.editable ? (
              <>
                <label>Anthropic API key<input type="password" autoComplete="off" value={form.anthropic} onChange={set("anthropic")} placeholder="sk-ant-…" /></label>
                <label>OpenAI API key<input type="password" autoComplete="off" value={form.openai} onChange={set("openai")} placeholder="sk-…" /></label>
                <div className="two">
                  <label>Routing<select value={form.mode} onChange={set("mode")}><option value="auto">Auto (by request)</option><option value="anthropic">Prefer Claude</option><option value="openai">Prefer OpenAI</option></select></label>
                  <label className="chk"><input type="checkbox" checked={form.fallback} onChange={set("fallback")} /> Fallback to other provider</label>
                </div>
                <label>Fast tier<input value={form.fast} onChange={set("fast")} /></label>
                <label>Main tier<input value={form.main} onChange={set("main")} /></label>
                <label>Deep tier<input value={form.deep} onChange={set("deep")} /></label>
                <p className="keybox">Keys are stored only in this browser and sent only to api.anthropic.com / api.openai.com.</p>
                <button className="primary" onClick={save}>Save {saved && `· ${saved}`}</button>
              </>
            ) : s.builtin ? (
              <p className="keybox">This test page asks Claude through your own Claude account, so no API keys are needed. The first question asks you to allow it. The deployed app (Vercel) uses its own Anthropic and OpenAI keys with the routing shown above.</p>
            ) : (
              <p className="keybox">Keys and routing are set by the server administrator (environment variables — see SETUP.md).</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
