"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Note, UiAction } from "@/lib/types";
import { locationAt } from "@/lib/siteplan";
import SiteMap, { type MapHandle } from "./_components/SiteMap";
import LocationSheet from "./_components/LocationSheet";
import UploadSheet from "./_components/UploadSheet";
import DocViewer from "./_components/DocViewer";
import AgentChat from "./_components/AgentChat";
import DocsTab from "./_components/DocsTab";
import { pathOf, useAgent, useAuthor, useSite } from "./_components/site";

type Tab = "map" | "agent" | "docs";

export default function Home() {
  const { state, error, refresh } = useSite();
  const [author, setAuthor] = useAuthor();
  const [tab, setTab] = useState<Tab>("map");
  const [selId, setSelId] = useState<string | undefined>();
  const [viewerId, setViewerId] = useState<string | undefined>();
  const [dropMode, setDropMode] = useState(false);
  const [upload, setUpload] = useState<{ locationId: string; pin?: { x: number; y: number } } | null>(null);
  const [gps, setGps] = useState<{ x: number; y: number; locationId?: string } | null>(null);
  const [search, setSearch] = useState("");
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

  const runAction = useCallback((a: UiAction) => {
    if (a.type === "open_doc") setViewerId(a.docId);
    else selectLocation(a.locationId);
  }, [selectLocation]);

  const ctx = useCallback(() => ({
    author,
    focus: { docId: viewerId, locationId: selId },
    here: gps?.locationId ? { locationId: gps.locationId } : undefined,
  }), [author, viewerId, selId, gps?.locationId]);

  const agent = useAgent(ctx, useCallback(() => { refresh(); }, [refresh]));

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
    return locs.filter((l) => l.type !== "level" && `${l.name} ${(l.aliases ?? []).join(" ")}`.toLowerCase().includes(q)).slice(0, 7);
  }, [search, locs]);

  useEffect(() => { if (tab !== "map") setDropMode(false); }, [tab]);

  const viewerDoc = viewerId ? docs.find((d) => d.id === viewerId) : undefined;
  const lastReply = [...agent.items].reverse().find((m) => m.role === "assistant");
  const hereName = gps?.locationId ? pathOf(locs, gps.locationId).split(" › ").pop() : undefined;

  if (!state) {
    return <div className="boot">{error || "Loading site…"}</div>;
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><span className="logo">▟</span><div><b>{state.project.name}</b><em>{state.project.client} · {state.project.code}</em></div></div>
        <button className="who" onClick={() => { const n = window.prompt("Your name (shown on notes you leave)", author); if (n?.trim()) setAuthor(n.trim()); }}>{author} ✎</button>
      </header>

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
            <button className="fab" onClick={() => setDropMode(true)}>📌 Pin a document to the plan</button>
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

        <section className={"pane" + (tab === "agent" ? "" : " off")}>
          <AgentChat items={agent.items} busy={agent.busy} mode={state.agentMode} docs={docs} hereName={hereName}
            onSend={agent.send} onClear={agent.clear} onAction={runAction} />
        </section>

        <section className={"pane" + (tab === "docs" ? "" : " off")}>
          <DocsTab docs={docs} locations={locs} notes={notes} onOpen={setViewerId} onToggleNote={toggleNote} onSelectLocation={selectLocation} />
        </section>
      </main>

      <nav className="tabs">
        {([["map", "🗺", "Site map"], ["agent", "💬", "Agent"], ["docs", "📁", "Documents"]] as const).map(([id, ico, label]) => (
          <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}><span>{ico}</span>{label}</button>
        ))}
      </nav>

      {error && <div className="toast">{error}</div>}

      {viewerDoc && (
        <DocViewer
          key={viewerDoc.id} doc={viewerDoc} locations={locs} notes={notes} lastReply={lastReply} agentBusy={agent.busy}
          onClose={() => setViewerId(undefined)}
          onAsk={agent.send}
          onAddNote={(p) => addNote(p)}
          onToggleNote={toggleNote}
          onShowOnMap={(id) => { setViewerId(undefined); selectLocation(id); }}
        />
      )}

      {upload && (
        <UploadSheet
          locations={locs} locationId={upload.locationId} pin={upload.pin} author={author}
          onClose={() => setUpload(null)}
          onDone={async (docId) => { setUpload(null); await refresh(); setSelId((s) => s ?? undefined); setViewerId(docId); }}
        />
      )}
    </div>
  );
}
