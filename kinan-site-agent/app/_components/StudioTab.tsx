"use client";
/**
 * 3D Studio: upload a project's documents (area schedule, setting-out, P6 programme, logistics plan, brief, PDFs or
 * drawings) and an AI engine (Claude, OpenAI or Gemini, or the offline parser) reads them into a 3D/4D model.
 * A demo pack for a fictional project, Kinan Bay Residences, shows the whole flow without any files of your own.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { ProjectModelSpec } from "@/lib/model3d/spec";
import { mockDocs, MOCK_PROJECT } from "@/lib/model3d/mock";
import { Icon } from "./icons";

const ModelViewer = lazy(() => import("./ModelViewer"));

type Engine = "auto" | "anthropic" | "openai" | "gemini" | "offline";
interface Doc { name: string; size: number; file?: File; text?: string; demo?: boolean }
interface Result { spec: ProjectModelSpec; warnings: string[]; engine: Exclude<Engine, "auto">; model: string; ms: number; log: { step: string; detail: string }[]; tried: { engine: string; error: string }[] }

const ENGINES: { id: Engine; label: string }[] = [{ id: "auto", label: "Auto" }, { id: "anthropic", label: "Claude" }, { id: "openai", label: "OpenAI" }, { id: "gemini", label: "Gemini" }, { id: "offline", label: "Offline" }];
const ENGINE_NAME: Record<string, string> = { anthropic: "Claude", openai: "OpenAI", gemini: "Gemini", offline: "Offline parser", sample: "Claude" };
const USE_LABEL: Record<string, string> = { residential: "Residential", office: "Office", hotel: "Hotel", retail: "Retail", townhouse: "Townhouse", amenity: "Amenity", parking: "Parking", school: "School", mosque: "Mosque", utility: "Utility" };
const STEPS = ["Reading the documents", "Matching the area schedule to the setting-out", "Reading the programme", "Placing roads, gates and cranes", "Building the 3D model"];
const KEY = "kinan.studio.v1";
const kb = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
const nice = (s: string) => new Date(s + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const kindOf = (n: string) => /\.(csv|tsv)$/i.test(n) ? "Table" : /\.md$/i.test(n) ? "Text" : /\.pdf$/i.test(n) ? "PDF" : /\.(png|jpe?g|webp)$/i.test(n) ? "Drawing" : /\.(xer|xml)$/i.test(n) ? "Programme" : "Text";

export default function StudioTab() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [engine, setEngine] = useState<Engine>("auto");
  const [avail, setAvail] = useState<Record<string, string | null> | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [view, setView] = useState<"model" | "setup">("setup");
  const [peek, setPeek] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const [sel, setSel] = useState<string | undefined>();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/model3d").then((r) => r.json()).then((j) => setAvail(j.engines ?? null)).catch(() => setAvail(null));
    try { const s = localStorage.getItem(KEY); if (s) { const r = JSON.parse(s) as Result; if (r?.spec?.buildings) { setRes(r); setView("model"); } } } catch { /* storage blocked */ }
  }, []);
  useEffect(() => { if (!busy) return; setStep(0); const t = setInterval(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), 2600); return () => clearInterval(t); }, [busy]);

  const add = (files: FileList | null) => {
    if (!files?.length) return;
    setDocs((d) => [...d.filter((x) => !x.demo), ...Array.from(files).filter((f) => !d.some((x) => x.name === f.name)).map((f) => ({ name: f.name, size: f.size, file: f }))].slice(0, 20));
  };
  const loadDemo = () => { setDocs(mockDocs().map((d) => ({ name: d.name, size: new Blob([d.text]).size, text: d.text, demo: true }))); setErr(""); };
  const preview = async (d: Doc) => {
    if (peek === d.name) { setPeek(null); return; }
    setPeek(d.name);
    if (d.text === undefined && d.file && /\.(csv|tsv|txt|md|json|xml|xer)$/i.test(d.name)) { const t = await d.file.text(); setDocs((all) => all.map((x) => (x.name === d.name ? { ...x, text: t } : x))); }
  };

  const generate = async () => {
    if (!docs.length || busy) return;
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      for (const d of docs) fd.append("files", d.file ?? new File([d.text ?? ""], d.name, { type: /\.csv$/i.test(d.name) ? "text/csv" : /\.md$/i.test(d.name) ? "text/markdown" : "text/plain" }));
      fd.append("engine", engine);
      const r = await fetch("/api/model3d", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
      if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
      setRes(j); setView("model"); setSel(undefined); setDetails(false);
      try { localStorage.setItem(KEY, JSON.stringify(j)); } catch { /* storage full or blocked */ }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const spec = res?.spec;
  const counts = useMemo(() => {
    if (!spec) return null;
    const gfa = spec.buildings.reduce((a, b) => a + b.w * b.d * b.floors * 0.85, 0);
    return { buildings: spec.buildings.length, floors: spec.buildings.reduce((a, b) => a + b.floors, 0), tallest: spec.buildings.reduce((a, b) => (b.floors * b.storeyHeight > a.floors * a.storeyHeight ? b : a), spec.buildings[0]), gfa, acts: spec.schedule.activities.length };
  }, [spec]);
  const selB = spec?.buildings.find((b) => b.id === sel);
  const selActs = spec && sel ? spec.schedule.activities.filter((a) => a.building === sel).sort((a, b) => a.start.localeCompare(b.start)) : [];

  // ------------------------------------------------------------------ model view
  if (view === "model" && res && spec) return (
    <div className="studio studio-model">
      <Suspense fallback={<div className="studio-empty"><p>Loading 3D…</p></div>}>
        <ModelViewer spec={spec} selectedId={sel} onSelect={(id) => { setSel(id); if (id) setDetails(false); }} />
      </Suspense>
      <div className="studio-bar">
        <div className="studio-title"><b>{spec.name}</b><em>{ENGINE_NAME[res.engine] ?? res.engine}{res.model && res.model.toLowerCase() !== (ENGINE_NAME[res.engine] ?? "").toLowerCase() ? ` · ${res.model}` : ""} · {res.ms < 1000 ? `${Math.max(1, res.ms)} ms` : `${(res.ms / 1000).toFixed(1)} s`} · {spec.buildings.length} buildings</em></div>
        <button className="mini" onClick={() => { setDetails((d) => !d); setSel(undefined); }} aria-expanded={details}>{details ? "Hide" : "What it read"}</button>
        <button className="mini" onClick={() => setView("setup")}>New</button>
      </div>
      {selB && (
        <div className="studio-sheet small">
          <div className="studio-sh"><div><b>{selB.name}</b><em>{selB.id} · {USE_LABEL[selB.use]} · {selB.floors} floors × {selB.storeyHeight} m{selB.basements ? ` · ${selB.basements} basement${selB.basements > 1 ? "s" : ""}` : ""}</em></div><button className="x" onClick={() => setSel(undefined)} aria-label="Close">✕</button></div>
          <p className="studio-src">Footprint {selB.w} × {selB.d} m at E {selB.x} m, {selB.z} m from the north boundary{selB.source ? <> · from <i>{selB.source}</i></> : null}{selB.confidence ? <span className={"conf " + selB.confidence}>{selB.confidence}</span> : null}</p>
          <ul className="studio-acts">{selActs.map((a, i) => <li key={i}><span className={"ph " + a.phase}>{a.phase}</span><span className="an">{a.name ?? a.phase}</span><span className="ad">{nice(a.start)} – {nice(a.finish)}</span></li>)}</ul>
        </div>
      )}
      {details && counts && (
        <div className="studio-sheet">
          <div className="studio-sh"><div><b>What the model read</b><em>{spec.location ?? ""}{spec.client ? ` · ${spec.client}` : ""}</em></div><button className="x" onClick={() => setDetails(false)} aria-label="Close">✕</button></div>
          <div className="studio-kpis">
            <div><b>{counts.buildings}</b><em>buildings</em></div>
            <div><b>{counts.floors}</b><em>floors</em></div>
            <div><b>{Math.round(counts.gfa / 1000)}k</b><em>m² GFA (est.)</em></div>
            <div><b>{counts.acts}</b><em>activities</em></div>
          </div>
          <p className="studio-src">Site {spec.site.width} × {spec.site.depth} m · {spec.roads.length} roads · {spec.gates.length} gates · {spec.cranes.length} tower cranes · programme {nice(spec.schedule.start)} – {nice(spec.schedule.finish)} · data date {nice(spec.schedule.dataDate)}</p>
          <div className="studio-tablewrap">
            <table className="studio-table">
              <thead><tr><th>ID</th><th>Building</th><th>Use</th><th className="n">Floors</th><th className="n">Height</th><th>Source</th></tr></thead>
              <tbody>{spec.buildings.map((b) => <tr key={b.id} onClick={() => { setSel(b.id); setDetails(false); }}><td><b>{b.id}</b></td><td>{b.name}</td><td>{USE_LABEL[b.use]}</td><td className="n">{b.floors}</td><td className="n">{Math.round(b.floors * b.storeyHeight)} m</td><td className="s">{b.source ?? "—"}{b.confidence && <span className={"conf " + b.confidence}>{b.confidence}</span>}</td></tr>)}</tbody>
            </table>
          </div>
          {res.log.length > 0 && <><h4>Steps</h4><ul className="studio-list">{res.log.map((l, i) => <li key={i}><b>{l.step}</b> {l.detail}</li>)}</ul></>}
          {spec.assumptions.length > 0 && <><h4>Assumptions</h4><ul className="studio-list">{spec.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul></>}
          {res.warnings.length > 0 && <><h4>Check these</h4><ul className="studio-list warn">{res.warnings.map((a, i) => <li key={i}>{a}</li>)}</ul></>}
          {res.tried.length > 0 && <><h4>Engines tried first</h4><ul className="studio-list">{res.tried.map((t, i) => <li key={i}><b>{ENGINE_NAME[t.engine] ?? t.engine}</b> {t.error}</li>)}</ul></>}
          {spec.sources.length > 0 && <><h4>Documents used</h4><ul className="studio-list">{spec.sources.map((s, i) => <li key={i}><b>{s.file}</b> {s.used}</li>)}</ul></>}
        </div>
      )}
    </div>
  );

  // ------------------------------------------------------------------ setup
  const missing = (e: Engine) => e !== "auto" && e !== "offline" && avail !== null && !avail[e];
  return (
    <div className="studio studio-setup">
      <div className="studio-head">
        <span className="studio-ico"><Icon name="cube" /></span>
        <div><h2>3D Studio</h2><p>Upload a project&apos;s documents and programme. Claude, OpenAI or Gemini reads them and builds a 3D model you can play through the programme.</p></div>
      </div>

      <div className="studio-card">
        <div className="studio-l">1 · Documents</div>
        <div className={"studio-drop" + (docs.length ? " has" : "")} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); add(e.dataTransfer.files); }}>
          <button className="studio-add" onClick={() => input.current?.click()}><Icon name="file" />Add files</button>
          <span>Area schedule, setting-out, P6 or MS Project export (CSV), logistics plan, brief, PDFs, plan images · up to 20 files, 4 MB</span>
          <input ref={input} type="file" multiple hidden accept=".csv,.tsv,.txt,.md,.json,.xml,.xer,.pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        </div>
        <button className="studio-demo" onClick={loadDemo}>
          <b>Load the demo pack</b><em>{MOCK_PROJECT.name}, {MOCK_PROJECT.location} · 7 mock documents · 16 buildings · P6 programme</em>
        </button>
        {docs.length > 0 && (
          <ul className="studio-docs">
            {docs.map((d) => (
              <li key={d.name}>
                <div className="studio-doc">
                  <span className="k">{kindOf(d.name)}</span>
                  <span className="dn">{d.name}<em>{kb(d.size)}{d.demo ? " · demo" : ""}</em></span>
                  <button className="mini" onClick={() => preview(d)} aria-expanded={peek === d.name}>{peek === d.name ? "Hide" : "View"}</button>
                  <button className="x" onClick={() => setDocs((all) => all.filter((x) => x !== d))} aria-label={`Remove ${d.name}`}>✕</button>
                </div>
                {peek === d.name && <pre className="studio-pre">{d.text !== undefined ? d.text.split("\n").slice(0, 60).join("\n") + (d.text.split("\n").length > 60 ? "\n…" : "") : "Preview is for text and CSV files. The AI engines read PDFs and images directly."}</pre>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="studio-card">
        <div className="studio-l">2 · Engine</div>
        <div className="seg studio-eng" role="radiogroup" aria-label="Engine">
          {ENGINES.map((e) => <button key={e.id} role="radio" aria-checked={engine === e.id} className={engine === e.id ? "on" : ""} disabled={missing(e.id)} onClick={() => setEngine(e.id)}>{e.label}{missing(e.id) && <i>no key</i>}</button>)}
        </div>
        <p className="studio-note">
          {engine === "auto" ? `Uses the first AI engine with a key${avail ? ` (${["anthropic", "openai", "gemini"].filter((k) => avail[k]).map((k) => ENGINE_NAME[k]).join(", ") || "none set"})` : ""}, then falls back to the offline parser.`
            : engine === "offline" ? "Reads CSV, Markdown and text with fixed rules: no AI and no keys. Skips PDFs and images."
            : `Sends the documents to ${ENGINE_NAME[engine]}${avail?.[engine] ? ` (${avail[engine]})` : ""}. The model returns positions, floors, the programme mapped to each building, and what it had to assume.`}
        </p>
      </div>

      {err && <div className="studio-err">{err}</div>}
      <button className="studio-go" disabled={!docs.length || busy} onClick={generate}>{busy ? "Building the model…" : "Generate 3D model"}</button>
      {busy && <ol className="studio-steps">{STEPS.map((s, i) => <li key={s} className={i < step ? "done" : i === step ? "now" : ""}>{s}</li>)}</ol>}
      {res && !busy && <button className="studio-back" onClick={() => setView("model")}>Back to {res.spec.name}</button>}
    </div>
  );
}
