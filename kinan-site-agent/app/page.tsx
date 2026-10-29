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
import ScheduleAgent from "./_components/ScheduleAgent";
import { NewProject, ProjectHome, ProjectView } from "./_components/Projects";
import Reports from "./_components/Reports";
import Readiness from "./_components/Readiness";
import Chat from "./_components/Chat";
import { ControlRoom, DEMO_FACILITY, FacilityHome, useFacilities } from "./_components/fm/Operations";
import Today from "./_components/Today";
import People from "./_components/People";
import { SignInSheet, signOut, useMe } from "./_components/auth";
import { loadProjects, saveProjects, type GenProject } from "@/lib/model3d/store";
import { useAuthor, useSite } from "./_components/site";
import { Icon, Logo, Mark } from "./_components/icons";
import { TEXTURE } from "@/lib/brand";
import { BOHIO_LOOK, HAS_OPERATIONS } from "@/lib/edition";

// Optional official logo (e.g. /brand/kinan-logo.svg placed in public/) — set by Kinan's team.
const LOGO = process.env.NEXT_PUBLIC_BRAND_LOGO || "";

type Tab = "map" | "project" | "p6" | "docs";
/** home = project list · site = the live Kinan Heights app · new = create from documents · p:<id> = a generated project
 *  · reports = the scheduled daily status e-mail */
type Screen = "today" | "home" | "site" | "new" | "reports" | "ready" | "people" | "fm" | `p:${string}` | `fm:${string}`;
/** A tab label: the full wording on the desktop tab row, a short one under the icon on the phone's bottom bar. */
const Tl = ({ full, short }: { full: string; short: string }) => <><span className="tl">{full}</span><span className="ts">{short}</span></>;

export default function Home() {
  const { state, error, refresh, live } = useSite();
  const [typedName, setAuthor] = useAuthor();
  // signed in with a phone number: that person's name, role and approval limits (lib/auth)
  const { me, auth } = useMe();
  const author = me?.name ?? typedName;
  const [signIn, setSignIn] = useState(false);
  const [tab, setTab] = useState<Tab>("map");
  // the first screen is Today: the day in a few lines and the decisions waiting
  const [screen, setScreenRaw] = useState<Screen>("today");
  // a brief link from the e-mail (/?brief=<id>&play=1) opens the Briefs page
  useEffect(() => { if (new URLSearchParams(window.location.search).has("brief")) setScreenRaw("reports"); }, []);
  const [projects, setProjects] = useState<GenProject[]>([]);
  const [storeErr, setStoreErr] = useState("");
  // Generated projects live on this device and are synced to the server, so the daily report covers them too.
  const sync = useCallback(async (list: GenProject[], deleted: string[] = []) => {
    try {
      const r = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projects: list, deleted }) });
      if (!r.ok) return;
      const j = (await r.json()) as { projects?: GenProject[] };
      if (Array.isArray(j.projects)) { setProjects(j.projects); saveProjects(j.projects); }
    } catch { /* offline or standalone: the device copy stays */ }
  }, []);
  useEffect(() => { const local = loadProjects(); setProjects(local); sync(local); }, [sync]);
  const setScreen = (s: Screen) => { setScreenRaw(s); setMeOpen(false); window.scrollTo?.(0, 0); };
  const putProjects = (list: GenProject[], deleted: string[] = []) => {
    setProjects(list);
    setStoreErr(saveProjects(list) ? "" : "This browser would not save the project list (storage full or blocked). It stays until you close the page.");
    sync(list, deleted);
  };
  const genId = screen.startsWith("p:") ? screen.slice(2) : null;
  const fmId = HAS_OPERATIONS && screen.startsWith("fm:") ? screen.slice(3) : null;
  const gen = genId ? projects.find((p) => p.id === genId) : undefined;
  // two modules, chosen in the side menu: facility management (its home: the airport demo) and project management
  const mod: "fm" | "pm" = HAS_OPERATIONS && (screen === "fm" || !!fmId) ? "fm" : "pm";
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
  const initials = author.replace(/\(.*?\)/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
  const [projKey, setProjKey] = useState(0);
  // a change from WhatsApp, the field app or another user: the schedule tab reloads too
  useEffect(() => { const f = () => setProjKey((k) => k + 1); window.addEventListener("kinan:changed", f); return () => window.removeEventListener("kinan:changed", f); }, []);
  const mapRef = useRef<MapHandle>(null);

  const locs = useMemo(() => state?.locations ?? [], [state?.locations]);
  const docs = useMemo(() => state?.docs ?? [], [state?.docs]);
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
    // floors only when a number was typed ("Tower A level 12", "L12") — otherwise 42 levels would bury the buildings
    const wantsLevel = /\d/.test(q);
    return locs.filter((l) => {
      if (l.type === "level" && !wantsLevel) return false;
      const hay = `${l.name} ${(l.aliases ?? []).join(" ")} ${l.id} ${l.id.replace(/-/g, " ")}`.toLowerCase().replace(/\blevel\s*(\d+)/g, "level $1 l$1");
      return words.every((w) => hay.includes(w));
    }).sort((a, b) => a.name.length - b.name.length).slice(0, 7);
  }, [search, locs]);

  useEffect(() => { if (tab !== "map") setDropMode(false); }, [tab]);

  const viewerDoc = viewerId ? docs.find((d) => d.id === viewerId) : undefined;

  if (!state) {
    return <div className="boot" data-kloading={error ? undefined : ""}><Logo height={46} /><span>{error || "Onsite Agent"}</span><Mark /></div>;
  }

  return (
    <div className={HAS_OPERATIONS ? "app has-side" : "app"}>
      {/* Kinan header, as in the other Kinan agents: charcoal band, white logo, product line in spaced caps,
          a square settings button and the orange chevron; the tab bar sits underneath on white. */}
      <header className="top">
        <button className="brand" onClick={() => setScreen("home")} aria-label="All projects">
          {LOGO ? <img className="logo-img" src={LOGO} alt={state.project.client} /> : <Logo height={34} />}
          <span className="brand-sub">AI onsite agent · site &amp; projects</span>
        </button>
        <div className="hbtns">
          <button className="avatar" onClick={() => { setMeOpen((o) => !o); setNameDraft(typedName); }} aria-label={`${author}: name and display settings`} aria-expanded={meOpen} title="Your name and display">{initials}</button>
          <span className="chev" aria-hidden="true"><Mark /></span>
        </div>
      </header>
      {HAS_OPERATIONS && <SideMenu mod={mod} fmId={fmId} onModule={(m) => setScreen(m === "fm" ? "fm" : "today")} onFacility={(id) => setScreen(`fm:${id}`)} />}
      <nav className="tabs" aria-label="Sections">
        {mod === "fm" ? <>
          <button className={screen === "fm" ? "on" : ""} onClick={() => setScreen("fm")}><Icon name="grid" /><Tl full="Facilities" short="Facilities" /></button>
          {fmId && <button className="on"><Icon name="layers" /><Tl full={fmId === DEMO_FACILITY ? "Airport control room" : "Control room"} short="Control" /></button>}
        </> : <>
        <button className={screen === "today" ? "on" : ""} onClick={() => setScreen("today")}><Icon name="check" /><Tl full="Today" short="Today" /></button>
        <button className={screen === "home" ? "on" : ""} onClick={() => setScreen("home")}><Icon name="grid" /><Tl full="Projects" short="Projects" /></button>
        {screen === "site" && ([["map", "Site map", "Map", "map"], ["project", "Project schedule", "Schedule", "chart"], ["p6", "Schedule agent", "Agent", "layers"], ["docs", "Documents", "Docs", "folder"]] as const).map(([id, label, short, icon]) => (
          <button key={id} className={tab === id ? "on" : ""} onClick={() => { setTab(id); if (id === "project" || id === "p6") setProjKey((k) => k + 1); }}><Icon name={icon} /><Tl full={label} short={short} /></button>
        ))}
        {screen === "new" && <button className="on"><Icon name="plus" /><Tl full="New project" short="New" /></button>}
        {gen && <button className="on"><Icon name="cube" /><Tl full={gen.result.spec.name} short={gen.result.spec.name.replace(/^Kinan\s+/i, "")} /></button>}
        {!HAS_OPERATIONS && fmId && <button className="on"><Icon name="layers" /><Tl full="Operations" short="Ops" /></button>}
        <button className={screen === "reports" ? "on" : ""} onClick={() => setScreen("reports")}><Icon name="notes" /><Tl full="Briefs" short="Briefs" /></button>
        </>}
      </nav>
      {meOpen && (
        <div className="me" role="dialog" aria-label="Your settings">
          {me ? (
            <div className="me-who"><b>{me.name}</b><span>{me.title} · {me.org}</span><span><span className={`role-pill ${me.role}`}>{me.roleLabel}</span> {me.limits}</span>
              <div className="me-who-acts">
                {(me.role === "manager" || me.role === "director" || me.role === "admin") && <button className="mini" onClick={() => setScreen("people")}>People &amp; permissions</button>}
                <button className="mini" onClick={() => { signOut(); setMeOpen(false); }}>Sign out</button>
              </div>
            </div>
          ) : (<>
            <div className="me-who"><b>Not signed in</b><span>You can look at everything and report. Sign in with your phone number to approve.</span>
              <div className="me-who-acts"><button className="studio-add" onClick={() => { setMeOpen(false); setSignIn(true); }}>Sign in</button></div>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); if (nameDraft?.trim()) setAuthor(nameDraft.trim()); setMeOpen(false); }}>
              <label>Your name<span>Shown on the notes and uploads you leave</span>
                <input id="author-name" value={nameDraft ?? ""} onChange={(e) => setNameDraft(e.target.value)} onBlur={() => { if (nameDraft?.trim()) setAuthor(nameDraft.trim()); }} maxLength={60} autoComplete="name" />
              </label>
            </form>
          </>)}
          {!BOHIO_LOOK && <>
            <div className="me-l">Appearance</div>
            <div className="seg3" role="group" aria-label="Appearance">
              {(["auto", "light", "dark"] as const).map((t) => <button key={t} className={theme === t ? "on" : ""} aria-pressed={theme === t} onClick={() => pickTheme(t)}><Icon name={t === "auto" ? "contrast" : t === "light" ? "sun" : "moon"} />{t === "auto" ? "Auto" : t === "light" ? "Light" : "Dark"}</button>)}
            </div>
          </>}
          <div className="me-l">Before a demo</div>
          <button className="mini me-check" onClick={() => { setMeOpen(false); setScreen("ready"); }}>System check · prepare the brief · reset data</button>
          <button className="me-done" onClick={() => setMeOpen(false)}>Done</button>
        </div>
      )}

      {state.storage === "tmp" && <div className="tmpwarn">Demo storage: uploads and notes are temporary on this deployment. Connect Vercel Blob to keep them (see SETUP.md).</div>}
{screen !== "site" && (
        <main className="main-solo">
          {storeErr && <div className="tmpwarn">{storeErr}</div>}
          {screen === "today" && <Today onSignIn={() => setSignIn(true)} onGo={(g) => setScreen(g === "site" || g === "reports" || g === "home" || g.startsWith("fm:") ? g as Screen : "home")} />}
          {screen === "people" && <People onBack={() => setScreen("today")} />}
          {screen === "home" && (
            <ProjectHome
              site={{ name: state.project.name, code: state.project.code, client: state.project.client }} projects={projects}
              onOpenSite={() => setScreen("site")} onOpen={(id) => setScreen(`p:${id}`)} onNew={() => setScreen("new")}
              onDelete={(id) => putProjects(projects.filter((p) => p.id !== id), [id])}
            />
          )}
          {screen === "fm" && <FacilityHome onOpen={(id) => setScreen(`fm:${id}`)} />}
          {fmId && <ControlRoom key={fmId} facilityId={fmId} author={author} onBack={() => setScreen(HAS_OPERATIONS ? "fm" : "home")} onSignIn={() => setSignIn(true)} />}
          {screen === "new" && <NewProject onCancel={() => setScreen("home")} onCreated={(p) => { putProjects([p, ...projects]); setScreen(`p:${p.id}`); }} />}
          {gen && <ProjectView key={gen.id} project={gen} onBack={() => setScreen("home")} />}
          {screen === "reports" && <Reports author={author} />}
          {screen === "ready" && <Readiness onBack={() => setScreen("home")} onReset={refresh} onProject={(p) => putProjects([p, ...projects])} />}
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
  
          <section className={"pane" + (tab === "p6" ? "" : " off")}>
            {tab === "p6" && <ScheduleAgent refreshKey={projKey} />}
          </section>

          <section className={"pane" + (tab === "docs" ? "" : " off")}>
            <DocsTab docs={docs} locations={locs} notes={notes} onOpen={setViewerId} onToggleNote={toggleNote} onSelectLocation={selectLocation} />
          </section>
  
        </main>
  
      </>)}

      {error && <div className="toast">{error}</div>}
      {live && !error && <div className="toast live" role="status"><span className="live-dot" aria-hidden="true" />{live.via === "whatsapp" ? "WhatsApp · " : live.via === "field" ? "Field app · " : "Updated · "}{live.text}</div>}

      {/* the AI chat, on every screen; tool actions open the document or show the place on the map */}
      <Chat author={author} place={screen === "site" ? tab : screen.startsWith("p:") ? "project" : screen} fm={fmId ? { facilityId: fmId } : screen === "fm" ? { facilityId: DEMO_FACILITY } : undefined}
        focus={{ docId: viewerId, locationId: selId }}
        onAction={(a) => { if (a.type === "open_doc") { setScreen("site"); setViewerId(a.docId); } else if (a.type === "focus_location") { setScreen("site"); selectLocation(a.locationId); } }} />

      {viewerDoc && (
        <DocViewer
          key={viewerDoc.id} doc={viewerDoc} locations={locs} notes={notes}
          onClose={() => setViewerId(undefined)}
          onAddNote={(p) => addNote(p)}
          onToggleNote={toggleNote}
          onShowOnMap={(id) => { setViewerId(undefined); selectLocation(id); }}
        />
      )}

      {signIn && <SignInSheet auth={auth} onClose={() => setSignIn(false)} />}

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

/** The side menu (editions with facility operations): two modules, and under facility management its facilities, the
 *  airport demo first. On phones it is a two-way switch under the header. */
function SideMenu({ mod, fmId, onModule, onFacility }: { mod: "fm" | "pm"; fmId: string | null; onModule: (m: "fm" | "pm") => void; onFacility: (id: string) => void }) {
  const o = useFacilities();
  const facs = [...(o?.facilities ?? [])].sort((a, b) => (a.facility.id === DEMO_FACILITY ? -1 : b.facility.id === DEMO_FACILITY ? 1 : 0));
  return (
    <aside className="side" aria-label="Modules">
      <div className="side-l">Modules</div>
      <button className={`side-mod${mod === "fm" ? " on" : ""}`} aria-current={mod === "fm" ? "page" : undefined} onClick={() => onModule("fm")}><Icon name="layers" /><span>Facility management</span></button>
      {mod === "fm" && facs.length > 0 && (
        <ul className="side-sub">
          {facs.map(({ facility: f }) => (
            <li key={f.id}><button className={fmId === f.id ? "on" : ""} onClick={() => onFacility(f.id)}>{f.id === DEMO_FACILITY ? <><span>Airport</span><i>demo</i></> : <span>{f.name.replace(/^(Meridian|Kinan)\s+/, "").replace(/\s+—.*$/, "")}</span>}</button></li>
          ))}
        </ul>
      )}
      <button className={`side-mod${mod === "pm" ? " on" : ""}`} aria-current={mod === "pm" ? "page" : undefined} onClick={() => onModule("pm")}><Icon name="grid" /><span>Project management</span></button>
    </aside>
  );
}
