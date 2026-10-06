"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Note } from "@/lib/types";
import { locationAt } from "@/lib/siteplan";
import SiteMap, { type MapHandle } from "./_components/SiteMap";
import LocationSheet from "./_components/LocationSheet";
import UploadSheet from "./_components/UploadSheet";
import DocViewer from "./_components/DocViewer";
import DocsTab from "./_components/DocsTab";
import ProjectTab from "./_components/ProjectTab";
import { NewProject, ProjectHome, ProjectView } from "./_components/Projects";
import { loadProjects, saveProjects, type GenProject } from "@/lib/model3d/store";
import { useAuthor, useSite } from "./_components/site";
import { Icon, Logo, Mark } from "./_components/icons";
import { TEXTURE } from "@/lib/brand";

// Optional official logo (e.g. /brand/kinan-logo.svg placed in public/) — set by Kinan's team.
const LOGO = process.env.NEXT_PUBLIC_BRAND_LOGO || "";

type Tab = "map" | "project" | "docs";
/** home = project list · site = the live Kinan Heights app · new = create from documents · p:<id> = a generated project */
type Screen = "home" | "site" | "new" | `p:${string}`;

export default function Home() {
  const { state, error, refresh } = useSite();
  const [author, setAuthor] = useAuthor();
  const [tab, setTab] = useState<Tab>("map");
  const [screen, setScreenRaw] = useState<Screen>("home");
  const [projects, setProjects] = useState<GenProject[]>([]);
  const [storeErr, setStoreErr] = useState("");
  useEffect(() => { setProjects(loadProjects()); }, []);
  const setScreen = (s: Screen) => { setScreenRaw(s); setMeOpen(false); window.scrollTo?.(0, 0); };
  const putProjects = (list: GenProject[]) => { setProjects(list); setStoreErr(saveProjects(list) ? "" : "This browser would not save the project list (storage full or blocked). It stays until you close the page."); };
  const genId = screen.startsWith("p:") ? screen.slice(2) : null;
  const gen = genId ? projects.find((p) => p.id === genId) : undefined;
  const [selId, setSelId] = useState<string | undefined>();
  const [viewerId, setViewerId] = useState<string | undefined>();
  const [dropMode, setDropMode] = useState(false);
  const [upload, setUpload] = useState<{ locationId: string; pin?: { x: number; y: number } } | null>(null);
  const [, setGps] = useState<{ x: number; y: number; locationId?: string } | null>(null);
  const [search, setSearch] = useState("");
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  // Theme: Light by default, like the other Kinan agents; Dark, or Auto to follow the device.
  const [theme, setTheme] = useState<"auto" | "light" | "dark">("light");
  const [meOpen, setMeOpen] = useState(false);
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem("kinan.theme"); } catch { /* storage blocked */ }
    // Light by default (as the other Kinan agents); Dark or Auto only when chosen.
    const t = saved === "dark" || saved === "auto" ? saved : "light";
    if (t === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
    setTheme(t);
    // Kinan's faceted page texture behind the app (brand/kinan-texture.jpg, embedded at build time).
    if (TEXTURE) document.documentElement.style.setProperty("--texture", `url("${TEXTURE}")`);
  }, []);
  const pickTheme = (t: "auto" | "light" | "dark") => {
    if (t === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
    try { localStorage.setItem("kinan.theme", t); } catch { /* storage blocked */ }
    setTheme(t);
  };
  const initials = author.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
  const [projKey, setProjKey] = useState(0);
  const mapRef = useRef<MapHandle>(null);

  const locs = state?.locations ?? [];
  const docs = state?.docs ?? [];
  const notes = state?.notes ?? [];

  const selectLocation = useCallback((id: string) => {
    setSelId(id);
    setTab("map");
    setSearch("");
    requestAnimationFrame(() => mapRef.current?.focusLocation(id));
  }, []);

  const addNote = async (p: { docId?: string; locationId?: string; text: string; kind: Note["kind"]; at?: { x: number; y: number } }) => {
    await fetch("/api/notes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...p, author }) });
    await refresh();
  };
  const toggleNote = async (n: Note) => {
    await fetch("/api/notes", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: n.id, status: n.status === "open" ? "closed" : "open" }) });
    await refresh();
  };

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    // Every word must appear: "laydown 3" → "Laydown Area 3 — Precast", "tower a" → "Tower A".
    const words = q.split(/\s+/).filter(Boolean);
    return locs.filter((l) => {
      if (l.type === "level") return false;
      const hay = `${l.name} ${(l.aliases ?? []).join(" ")} ${l.id}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    }).sort((a, b) => a.name.length - b.name.length).slice(0, 7);
  }, [search, locs]);

  useEffect(() => { if (tab !== "map") setDropMode(false); }, [tab]);

  const viewerDoc = viewerId ? docs.find((d) => d.id === viewerId) : undefined;

  if (!state) {
    return <div className="boot"><Logo height={46} /><span>{error || "Onsite Agent"}</span><Mark /></div>;
  }

  return (
    <div className="app">
      {/* Kinan header, as in the other Kinan agents: charcoal band, white logo, product line in spaced caps,
          a square settings button and the orange chevron; the tab bar sits underneath on white. */}
      <header className="top">
        <button className="brand" onClick={() => setScreen("home")} aria-label="All projects">
          {LOGO ? <img className="logo-img" src={LOGO} alt={state.project.client} /> : <Logo />}
          <span className="brand-sub">AI onsite agent · site &amp; projects</span>
        </button>
        <div className="hbtns">
          <button className="avatar" onClick={() => { setMeOpen((o) => !o); setNameDraft(author); }} aria-label={`${author}: name and display settings`} aria-expanded={meOpen} title="Your name and display">{initials}</button>
          <span className="chev" aria-hidden="true"><Mark /></span>
        </div>
      </header>
      <nav className="tabs" aria-label="Sections">
        <button className={screen === "home" ? "on" : ""} onClick={() => setScreen("home")}>Projects</button>
        {screen === "site" && ([["map", "Site map"], ["project", "Programme & data"], ["docs", "Documents"]] as const).map(([id, label]) => (
          <button key={id} className={tab === id ? "on" : ""} onClick={() => { setTab(id); if (id === "project") setProjKey((k) => k + 1); }}>{label}</button>
        ))}
        {screen === "new" && <button className="on">New project</button>}
        {gen && <button className="on">{gen.result.spec.name}</button>}
      </nav>
      {meOpen && (
        <div className="me" role="dialog" aria-label="Your settings">
          <form onSubmit={(e) => { e.preventDefault(); if (nameDraft?.trim()) setAuthor(nameDraft.trim()); setMeOpen(false); }}>
            <label>Your name<span>Shown on the notes and uploads you leave</span>
              <input id="author-name" value={nameDraft ?? ""} onChange={(e) => setNameDraft(e.target.value)} onBlur={() => { if (nameDraft?.trim()) setAuthor(nameDraft.trim()); }} maxLength={60} autoComplete="name" />
            </label>
          </form>
          <div className="me-l">Appearance</div>
          <div className="seg3" role="group" aria-label="Appearance">
            {(["auto", "light", "dark"] as const).map((t) => <button key={t} className={theme === t ? "on" : ""} aria-pressed={theme === t} onClick={() => pickTheme(t)}><Icon name={t === "auto" ? "contrast" : t === "light" ? "sun" : "moon"} />{t === "auto" ? "Auto" : t === "light" ? "Light" : "Dark"}</button>)}
          </div>
          <button className="me-done" onClick={() => setMeOpen(false)}>Done</button>
        </div>
      )}

      {state.storage === "tmp" && <div className="tmpwarn">Demo storage: uploads and notes are temporary on this deployment. Connect Vercel Blob to keep them (see SETUP.md).</div>}
{screen !== "site" && (
        <main className="main-solo">
          {storeErr && <div className="tmpwarn">{storeErr}</div>}
          {screen === "home" && (
            <ProjectHome
              site={{ name: state.project.name, code: state.project.code, client: state.project.client }} projects={projects}
              onOpenSite={() => setScreen("site")} onOpen={(id) => setScreen(`p:${id}`)} onNew={() => setScreen("new")}
              onDelete={(id) => putProjects(projects.filter((p) => p.id !== id))}
            />
          )}
          {screen === "new" && <NewProject onCancel={() => setScreen("home")} onCreated={(p) => { putProjects([p, ...projects]); setScreen(`p:${p.id}`); }} />}
          {gen && <ProjectView key={gen.id} project={gen} onBack={() => setScreen("home")} />}
          {genId && !gen && <div className="studio-empty"><p>That project is no longer on this device.</p></div>}
        </main>
      )}
      {screen === "site" && (<>
      <main>
          <section className={"pane" + (tab === "map" ? "" : " off")}>
            <div className="mapsearch">
              <input type="search" placeholder="Find a place: Tower A, TC1, Gate 2, batching…" value={search} onChange={(e) => setSearch(e.target.value)} />
              {results.length > 0 && (
                <ul>{results.map((l) => <li key={l.id}><button onClick={() => selectLocation(l.id)}>{l.name}<em>{l.type}</em></button></li>)}</ul>
              )}
            </div>
            <SiteMap
              ref={mapRef} locations={locs} docs={docs} notes={notes} selectedId={selId} dropMode={dropMode}
              onSelect={(id) => { navigator.vibrate?.(8); setSelId(id); requestAnimationFrame(() => mapRef.current?.focusLocation(id)); }}
              onDrop={(x, y) => { setDropMode(false); setUpload({ locationId: locationAt(x, y), pin: { x, y } }); }}
              onGps={setGps}
            />
            {!selId && !dropMode && (
              <button className="fab" onClick={() => setDropMode(true)} aria-label="Pin a document to the plan"><Icon name="pin" /><span>Pin a document</span></button>
            )}
            {dropMode && <button className="fab cancel" onClick={() => setDropMode(false)}>✕<span>Cancel</span></button>}
            {selId && (
              <LocationSheet
                locations={locs} docs={docs} notes={notes} locationId={selId}
                onClose={() => setSelId(undefined)}
                onOpenDoc={setViewerId}
                onUpload={(id) => setUpload({ locationId: id })}
                onNote={(id, text, kind) => addNote({ locationId: id, text, kind })}
                onToggleNote={toggleNote}
                onSelect={(id) => { setSelId(id); mapRef.current?.focusLocation(id); }}
              />
            )}
          </section>
  
          <section className={"pane" + (tab === "project" ? "" : " off")}>
            <ProjectTab locations={locs} refreshKey={projKey} onSelectLocation={selectLocation} onOpenDoc={setViewerId} />
          </section>
  
          <section className={"pane" + (tab === "docs" ? "" : " off")}>
            <DocsTab docs={docs} locations={locs} notes={notes} onOpen={setViewerId} onToggleNote={toggleNote} onSelectLocation={selectLocation} />
          </section>
  
        </main>
  
      </>)}

      {error && <div className="toast">{error}</div>}

      {viewerDoc && (
        <DocViewer
          key={viewerDoc.id} doc={viewerDoc} locations={locs} notes={notes}
          onClose={() => setViewerId(undefined)}
          onAddNote={(p) => addNote(p)}
          onToggleNote={toggleNote}
          onShowOnMap={(id) => { setViewerId(undefined); selectLocation(id); }}
        />
      )}

      {upload && (
        <UploadSheet
          locations={locs} locationId={upload.locationId} pin={upload.pin} author={author} directPrefix={state.directUpload ?? null}
          onClose={() => setUpload(null)}
          onDone={async (docId) => { setUpload(null); await refresh(); setSelId((s) => s ?? undefined); setViewerId(docId); }}
        />
      )}
    </div>
  );
}
