"use client";
/**
 * Home: the project list. Kinan Heights is the live site (map, 4D model, documents, WhatsApp agent); every other
 * project was generated from its documents. "+" starts a new one: drop or pick files, a whole folder or a .zip,
 * pick an engine (Claude, OpenAI, Gemini or the offline parser) and the documents become a playable 3D/4D model.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { mockDocs, MOCK_PROJECT } from "@/lib/model3d/mock";
import { collectFromDrop, collectFromList, mimeOf, type Collected } from "@/lib/model3d/collect";
import type { GenProject, GenResult } from "@/lib/model3d/store";
import { Icon } from "./icons";

const ModelViewer = lazy(() => import("./ModelViewer"));

type Engine = "auto" | "anthropic" | "openai" | "gemini" | "offline";
interface Doc { name: string; size: number; file?: File; text?: string; demo?: boolean }

const ENGINES: { id: Engine; label: string }[] = [{ id: "auto", label: "Auto" }, { id: "anthropic", label: "Claude" }, { id: "openai", label: "OpenAI" }, { id: "gemini", label: "Gemini" }, { id: "offline", label: "Offline" }];
const ENGINE_NAME: Record<string, string> = { anthropic: "Claude", openai: "OpenAI", gemini: "Gemini", offline: "Offline parser" };
const USE_LABEL: Record<string, string> = { residential: "Residential", office: "Office", hotel: "Hotel", retail: "Retail", townhouse: "Townhouse", amenity: "Amenity", parking: "Parking", school: "School", mosque: "Mosque", utility: "Utility" };
const STEPS = ["Reading the documents", "Matching the area schedule to the setting-out", "Reading the programme", "Placing roads, gates and cranes", "Building the 3D model"];
const MAX_FILES = 20, MAX_BYTES = 4_000_000;
const kb = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
const nice = (s: string) => new Date(s + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const kindOf = (n: string) => /\.(csv|tsv)$/i.test(n) ? "Table" : /\.pdf$/i.test(n) ? "PDF" : /\.(png|jpe?g|webp)$/i.test(n) ? "Drawing" : /\.(xer|xml)$/i.test(n) ? "Programme" : "Text";
const isText = (n: string) => /\.(csv|tsv|txt|md|json|xml|xer)$/i.test(n);
const yearSpan = (a: string, b: string) => `${a.slice(0, 4)}–${b.slice(0, 4)}`;

// ==================================================================== home
export function ProjectHome({ site, projects, onOpenSite, onOpen, onNew, onDelete }: {
  site: { name: string; code: string; client?: string }; projects: GenProject[];
  onOpenSite: () => void; onOpen: (id: string) => void; onNew: () => void; onDelete: (id: string) => void;
}) {
  const [confirm, setConfirm] = useState<string | null>(null);
  return (
    <div className="home">
      <div className="home-head">
        <div><h1>Projects</h1><p>{projects.length + 1} project{projects.length ? "s" : ""} · tap one to open it, or <b>+</b> to build a new one from its documents</p></div>
      </div>
      <ul className="home-grid">
        <li>
          <button className="pcard new" onClick={onNew} aria-label="New project from documents">
            <span className="pplus"><Icon name="plus" /></span>
            <b>New project</b>
            <em>Upload documents, a folder or a .zip: the programme, area schedule, setting-out and logistics plan become a 3D/4D model</em>
          </button>
        </li>
        <li>
          <button className="pcard site" onClick={onOpenSite}>
            <span className="pband"><Icon name="map" /><i>Live site</i></span>
            <b>{site.name}</b>
            <em>{site.code}{site.client ? ` · ${site.client}` : ""}</em>
            <span className="pmeta">Site map · 4D model · programme · procurement · documents · WhatsApp agent</span>
          </button>
        </li>
        {projects.map((p) => {
          const s = p.result.spec, tallest = Math.max(...s.buildings.map((b) => b.floors));
          return (
            <li key={p.id} className="pcard-wrap">
              <button className="pcard gen" onClick={() => onOpen(p.id)}>
                <span className="pband"><Icon name="cube" /><i>Generated · {ENGINE_NAME[p.result.engine] ?? p.result.engine}</i></span>
                <b>{s.name}</b>
                <em>{s.location ?? "Location not stated"}</em>
                <span className="pmeta">{s.buildings.length} buildings · up to {tallest} floors · programme {yearSpan(s.schedule.start, s.schedule.finish)} · from {p.docs.length || "?"} documents · {new Date(p.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
              </button>
              {confirm === p.id
                ? <span className="pdel-ask"><button onClick={() => { onDelete(p.id); setConfirm(null); }}>Delete</button><button onClick={() => setConfirm(null)}>Keep</button></span>
                : <button className="pdel" onClick={() => setConfirm(p.id)} aria-label={`Delete ${s.name}`}><Icon name="trash" /></button>}
            </li>
          );
        })}
      </ul>
      <button className="fab home-fab" onClick={onNew} aria-label="New project"><Icon name="plus" /><span>New project</span></button>
    </div>
  );
}

// ==================================================================== new project
export function NewProject({ onCancel, onCreated }: { onCancel: () => void; onCreated: (p: GenProject) => void }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [engine, setEngine] = useState<Engine>("auto");
  const [avail, setAvail] = useState<Record<string, string | null> | null>(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [peek, setPeek] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const files = useRef<HTMLInputElement>(null), folder = useRef<HTMLInputElement>(null), zip = useRef<HTMLInputElement>(null);
  const folderOk = useMemo(() => typeof document !== "undefined" && "webkitdirectory" in document.createElement("input"), []);

  useEffect(() => { fetch("/api/model3d").then((r) => r.json()).then((j) => setAvail(j.engines ?? null)).catch(() => setAvail(null)); }, []);
  useEffect(() => { if (!busy) return; setStep(0); const t = setInterval(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), 2600); return () => clearInterval(t); }, [busy]);

  const docsRef = useRef(docs); docsRef.current = docs;
  const take = (c: Collected) => {
    let added = 0, dup = 0, full = 0;
    const next = docsRef.current.filter((d) => !d.demo);
    for (const f of c.files) {
      if (next.some((d) => d.name === f.name)) { dup++; continue; }
      if (next.length >= MAX_FILES) { full++; continue; }
      next.push({ name: f.name, size: f.size, file: f }); added++;
    }
    setDocs(next);
    const parts = [`${added} document${added === 1 ? "" : "s"} added`];
    if (c.fromZip) parts.push(`${c.fromZip} unpacked from zip`);
    if (c.fromFolder) parts.push(`${c.fromFolder} from folders`);
    if (dup) parts.push(`${dup} already listed`);
    if (full) parts.push(`${full} left out (20 documents at most)`);
    if (c.skipped.length) parts.push(`skipped ${c.skipped.length} unsupported: ${c.skipped.slice(0, 3).map((s) => s.split("/").pop()).join(", ")}${c.skipped.length > 3 ? "…" : ""}`);
    setNote(parts.join(" · ")); setErr("");
  };
  const pick = async (list: FileList | null) => { if (!list?.length) return; setReading(true); try { take(await collectFromList(list)); } catch (e) { setErr(`Could not read the files: ${e instanceof Error ? e.message : e}`); } finally { setReading(false); } };
  const drop = async (e: DragEvent) => { e.preventDefault(); setOver(false); setReading(true); try { take(await collectFromDrop(e.dataTransfer)); } catch (er) { setErr(`Could not read the dropped items: ${er instanceof Error ? er.message : er}`); } finally { setReading(false); } };
  const loadDemo = () => { setDocs(mockDocs().map((d) => ({ name: d.name, size: new Blob([d.text]).size, text: d.text, demo: true }))); setNote(`${MOCK_PROJECT.name} demo pack: 7 documents`); setErr(""); };
  const preview = async (d: Doc) => {
    if (peek === d.name) { setPeek(null); return; }
    setPeek(d.name);
    if (d.text === undefined && d.file && isText(d.name)) { const t = await d.file.text(); setDocs((all) => all.map((x) => (x.name === d.name ? { ...x, text: t } : x))); }
  };
  const total = docs.reduce((a, d) => a + d.size, 0);

  const generate = async () => {
    if (!docs.length || busy) return;
    if (total > MAX_BYTES) { setErr(`The documents add up to ${kb(total)}; the limit per project is 4 MB. Remove the largest PDFs or images.`); return; }
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      for (const d of docs) fd.append("files", d.file ?? new File([d.text ?? ""], d.name, { type: mimeOf(d.name) }));
      fd.append("engine", engine);
      const r = await fetch("/api/model3d", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
      if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
      onCreated({ id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, createdAt: new Date().toISOString(), docs: docs.map((d) => d.name), result: j as GenResult });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const missing = (e: Engine) => e !== "auto" && e !== "offline" && avail !== null && !avail[e];
  return (
    <div className="studio studio-setup">
      <button className="crumb" onClick={onCancel}><Icon name="back" />Projects</button>
      <div className="studio-head">
        <span className="studio-ico"><Icon name="plus" /></span>
        <div><h2>New project</h2><p>Add the project&apos;s documents and programme. Claude, OpenAI or Gemini reads them and builds a 3D model you can play through the programme.</p></div>
      </div>

      <div className="studio-card">
        <div className="studio-l">1 · Documents</div>
        <div className={"studio-drop" + (over ? " over" : "")} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
          <div className="drop-btns">
            <button className="studio-add" onClick={() => files.current?.click()}><Icon name="file" />Files</button>
            {folderOk && <button className="studio-add" onClick={() => folder.current?.click()}><Icon name="folder" />Folder</button>}
            <button className="studio-add" onClick={() => zip.current?.click()}><Icon name="zip" />Zip</button>
          </div>
          <span>{reading ? "Reading…" : "or drop files, folders or .zip archives here. Area schedule, setting-out, P6 / MS Project export (CSV), logistics plan, brief, PDFs, plan images · up to 20 documents, 4 MB"}</span>
          <input ref={files} type="file" multiple hidden accept=".csv,.tsv,.txt,.md,.json,.xml,.xer,.pdf,.png,.jpg,.jpeg,.webp,.zip" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
          <input ref={folder} type="file" multiple hidden {...{ webkitdirectory: "", directory: "" }} onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
          <input ref={zip} type="file" multiple hidden accept=".zip,application/zip,application/x-zip-compressed" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
        </div>
        {note && <p className="studio-ok">{note}</p>}
        {!docs.length && <button className="studio-demo" onClick={loadDemo}><b>No documents to hand? Load the demo pack</b><em>{MOCK_PROJECT.name}, {MOCK_PROJECT.location} · 7 mock documents · 16 buildings · P6 programme</em></button>}
        {docs.length > 0 && (
          <>
            <div className="studio-sum"><b>{docs.length}</b> document{docs.length === 1 ? "" : "s"} · {kb(total)}{total > MAX_BYTES && <i> · over the 4 MB limit</i>}<button className="mini" onClick={() => { setDocs([]); setNote(""); }}>Clear</button></div>
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
          </>
        )}
      </div>

      <div className="studio-card">
        <div className="studio-l">2 · Engine</div>
        <div className="seg studio-eng" role="radiogroup" aria-label="Engine">
          {ENGINES.map((e) => <button key={e.id} role="radio" aria-checked={engine === e.id} className={engine === e.id ? "on" : ""} disabled={missing(e.id)} onClick={() => setEngine(e.id)}>{e.label}{missing(e.id) && <i>no key</i>}</button>)}
        </div>
        <p className="studio-note">
          {engine === "auto" ? `Uses the first AI engine available${avail ? ` (${["anthropic", "openai", "gemini"].filter((k) => avail[k]).map((k) => ENGINE_NAME[k]).join(", ") || "none set"})` : ""}, then falls back to the offline parser.`
            : engine === "offline" ? "Reads CSV, Markdown and text with fixed rules: no AI and no keys. Skips PDFs and images."
            : `Sends the documents to ${ENGINE_NAME[engine]}${avail?.[engine] ? ` (${avail[engine]})` : ""}. The model returns positions, floors, the programme mapped to each building, and what it had to assume.`}
        </p>
      </div>

      {err && <div className="studio-err">{err}</div>}
      <button className="studio-go" disabled={!docs.length || busy || reading} onClick={generate}>{busy ? "Building the model…" : "Create project"}</button>
      {busy && <ol className="studio-steps">{STEPS.map((s, i) => <li key={s} className={i < step ? "done" : i === step ? "now" : ""}>{s}</li>)}</ol>}
    </div>
  );
}

// ==================================================================== a generated project
export function ProjectView({ project, onBack }: { project: GenProject; onBack: () => void }) {
  const res = project.result, spec = res.spec;
  const [details, setDetails] = useState(false);
  const [sel, setSel] = useState<string | undefined>();
  const counts = useMemo(() => ({
    buildings: spec.buildings.length, floors: spec.buildings.reduce((a, b) => a + b.floors, 0),
    gfa: spec.buildings.reduce((a, b) => a + b.w * b.d * b.floors * 0.85, 0), acts: spec.schedule.activities.length,
  }), [spec]);
  const selB = spec.buildings.find((b) => b.id === sel);
  const selActs = sel ? spec.schedule.activities.filter((a) => a.building === sel).sort((a, b) => a.start.localeCompare(b.start)) : [];
  return (
    <div className="studio studio-model">
      <Suspense fallback={<div className="studio-empty"><p>Loading 3D…</p></div>}>
        <ModelViewer spec={spec} selectedId={sel} onSelect={(id) => { setSel(id); if (id) setDetails(false); }} />
      </Suspense>
      <div className="studio-bar">
        <button className="x back" onClick={onBack} aria-label="Back to projects"><Icon name="back" /></button>
        <div className="studio-title"><b>{spec.name}</b><em>{ENGINE_NAME[res.engine] ?? res.engine}{res.model && res.model.toLowerCase() !== (ENGINE_NAME[res.engine] ?? "").toLowerCase() ? ` · ${res.model}` : ""} · {spec.buildings.length} buildings · {project.docs.length || "?"} documents</em></div>
        <button className="mini" onClick={() => { setDetails((d) => !d); setSel(undefined); }} aria-expanded={details}>{details ? "Hide" : "What it read"}</button>
      </div>
      {selB && (
        <div className="studio-sheet small">
          <div className="studio-sh"><div><b>{selB.name}</b><em>{selB.id} · {USE_LABEL[selB.use]} · {selB.floors} floors × {selB.storeyHeight} m{selB.basements ? ` · ${selB.basements} basement${selB.basements > 1 ? "s" : ""}` : ""}</em></div><button className="x" onClick={() => setSel(undefined)} aria-label="Close">✕</button></div>
          <p className="studio-src">Footprint {selB.w} × {selB.d} m at E {selB.x} m, {selB.z} m from the north boundary{selB.source ? <> · from <i>{selB.source}</i></> : null}{selB.confidence ? <span className={"conf " + selB.confidence}>{selB.confidence}</span> : null}</p>
          <ul className="studio-acts">{selActs.map((a, i) => <li key={i}><span className={"ph " + a.phase}>{a.phase}</span><span className="an">{a.name ?? a.phase}</span><span className="ad">{nice(a.start)} – {nice(a.finish)}</span></li>)}</ul>
        </div>
      )}
      {details && (
        <div className="studio-sheet">
          <div className="studio-sh"><div><b>What the model read</b><em>{spec.location ?? ""}{spec.client ? ` · ${spec.client}` : ""}</em></div><button className="x" onClick={() => setDetails(false)} aria-label="Close">✕</button></div>
          <div className="studio-kpis">
            <div><b>{counts.buildings}</b><em>buildings</em></div>
            <div><b>{counts.floors}</b><em>floors</em></div>
            <div><b>{Math.round(counts.gfa / 1000)}k</b><em>m² GFA (est.)</em></div>
            <div><b>{counts.acts}</b><em>activities</em></div>
          </div>
          <p className="studio-src">Site {spec.site.width} × {spec.site.depth} m · {spec.roads.length} roads · {spec.gates.length} gates · {spec.cranes.length} tower cranes · programme {nice(spec.schedule.start)} – {nice(spec.schedule.finish)} · data date {nice(spec.schedule.dataDate)} · read in {res.ms < 1000 ? `${Math.max(1, res.ms)} ms` : `${(res.ms / 1000).toFixed(1)} s`}</p>
          <div className="studio-tablewrap">
            <table className="studio-table">
              <thead><tr><th>ID</th><th>Building</th><th>Use</th><th className="n">Floors</th><th className="n">Height</th><th>Source</th></tr></thead>
              <tbody>{spec.buildings.map((b) => <tr key={b.id} onClick={() => { setSel(b.id); setDetails(false); }}><td><b>{b.id}</b></td><td>{b.name}</td><td>{USE_LABEL[b.use]}</td><td className="n">{b.floors}</td><td className="n">{Math.round(b.floors * b.storeyHeight)} m</td><td className="s">{b.source ?? "—"}{b.confidence && <span className={"conf " + b.confidence}>{b.confidence}</span>}</td></tr>)}</tbody>
            </table>
          </div>
          {project.docs.length > 0 && <><h4>Documents uploaded</h4><ul className="studio-list">{project.docs.map((d) => <li key={d}>{d}</li>)}</ul></>}
          {res.log.length > 0 && <><h4>Steps</h4><ul className="studio-list">{res.log.map((l, i) => <li key={i}><b>{l.step}</b> {l.detail}</li>)}</ul></>}
          {spec.assumptions.length > 0 && <><h4>Assumptions</h4><ul className="studio-list">{spec.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul></>}
          {res.warnings.length > 0 && <><h4>Check these</h4><ul className="studio-list warn">{res.warnings.map((a, i) => <li key={i}>{a}</li>)}</ul></>}
          {res.tried.length > 0 && <><h4>Engines tried first</h4><ul className="studio-list">{res.tried.map((t, i) => <li key={i}><b>{ENGINE_NAME[t.engine] ?? t.engine}</b> {t.error}</li>)}</ul></>}
          {spec.sources.length > 0 && <><h4>How each document was used</h4><ul className="studio-list">{spec.sources.map((s, i) => <li key={i}><b>{s.file}</b> {s.used}</li>)}</ul></>}
        </div>
      )}
    </div>
  );
}
