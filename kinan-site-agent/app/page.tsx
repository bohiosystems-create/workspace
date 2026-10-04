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
import { useAuthor, useSite } from "./_components/site";
import { Icon, Logo, Mark } from "./_components/icons";
import { TEXTURE } from "@/lib/brand";

// Optional official logo (e.g. /brand/kinan-logo.svg placed in public/) — set by Kinan's team.
const LOGO = process.env.NEXT_PUBLIC_BRAND_LOGO || "";

type Tab = "map" | "project" | "docs";

export default function Home() {
  const { state, error, refresh } = useSite();
  const [author, setAuthor] = useAuthor();
  const [tab, setTab] = useState<Tab>("map");
  const [selId, setSelId] = useState<string | undefined>();
  const [viewerId, setViewerId] = useState<string | undefined>();
  const [dropMode, setDropMode] = useState(false);
  const [upload, setUpload] = useState<{ locationId: string; pin?: { x: number; y: number } } | null>(null);
  const [, setGps] = useState<{ x: number; y: number; locationId?: string } | null>(null);
  const [search, setSearch] = useState("");
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  // Theme: follow the device until the user picks one (like the Dark Mode switch on kinan.com.sa).
  const [dark, setDark] = useState(false);
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem("kinan.theme"); } catch { /* storage blocked */ }
    if (saved === "dark" || saved === "light") document.documentElement.dataset.theme = saved;
    const attr = document.documentElement.dataset.theme;
    setDark(attr ? attr === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);
    // Kinan's faceted page texture behind the app (brand/kinan-texture.jpg, embedded at build time).
    if (TEXTURE) document.documentElement.style.setProperty("--texture", `url("${TEXTURE}")`);
  }, []);
  const toggleTheme = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("kinan.theme", next); } catch { /* storage blocked */ }
    setDark(!dark);
  };
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
    return <div className="boot"><Logo height={46} /><span>{error || "Site Agent"}</span><Mark /></div>;
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          {LOGO ? <img className="logo-img" src={LOGO} alt={state.project.client} /> : <Logo />}
          <div><b>Site Agent</b><em>{state.project.name} · {state.project.code}</em></div>
        </div>
        <div className="hbtns">
          <button className="who icon" onClick={toggleTheme} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"}><Icon name={dark ? "sun" : "moon"} /></button>
          {nameDraft === null ? (
            <button className="who" onClick={() => setNameDraft(author)} aria-label="Change your name">{author} ✎</button>
          ) : (
            <form className="whoedit" onSubmit={(e) => { e.preventDefault(); if (nameDraft.trim()) setAuthor(nameDraft.trim()); setNameDraft(null); }}>
              <input id="author-name" autoFocus value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} onBlur={() => setNameDraft(null)} aria-label="Your name (shown on notes you leave)" maxLength={60} />
            </form>
          )}
          <span className="chev" aria-hidden="true"><Mark /></span>
        </div>
      </header>

      {state.storage === "tmp" && <div className="tmpwarn">Demo storage: uploads and notes are temporary on this deployment. Connect Vercel Blob to keep them (see SETUP.md).</div>}
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
            onSelect={(id) => { setSelId(id); requestAnimationFrame(() => mapRef.current?.focusLocation(id)); }}
            onDrop={(x, y) => { setDropMode(false); setUpload({ locationId: locationAt(x, y), pin: { x, y } }); }}
            onGps={setGps}
          />
          {!selId && !dropMode && (
            <button className="fab" onClick={() => setDropMode(true)}><Icon name="pin" />Pin a document to the plan</button>
          )}
          {dropMode && <button className="fab cancel" onClick={() => setDropMode(false)}>Cancel</button>}
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

      <nav className="tabs">
        {([["map", "map", "Site map"], ["project", "chart", "Project"], ["docs", "folder", "Docs"]] as const).map(([id, ico, label]) => (
          <button key={id} className={tab === id ? "on" : ""} onClick={() => { setTab(id); if (id === "project") setProjKey((k) => k + 1); }}><Icon name={ico} />{label}</button>
        ))}
      </nav>

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
