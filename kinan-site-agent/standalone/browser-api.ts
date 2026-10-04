/**
 * In-browser stand-in for the Next.js API routes, so the single-file HTML runs
 * the same UI with no server. Data lives in IndexedDB. The AI agent itself is
 * reached only through WhatsApp on the server deployment.
 */
import type { Db, Doc, Note } from "../lib/types";
import { CATEGORIES } from "../lib/types";
import { seedDb } from "../lib/seed";
import { buildProjectData } from "../lib/data";
import { renderDrawing } from "../lib/drawings";
import { describeUpload } from "../lib/core/describe";
import { configFrom } from "../lib/core/llm/router";
import type { Repo } from "../lib/core/tools";
import { runtime } from "../app/_components/runtime";
import { SYSTEM, extractModel, promptFor, type ExtractDoc } from "../lib/model3d/extract";
import { normalizeSpec } from "../lib/model3d/spec";

// ---------------------------------------------------------------- Claude inside the artifact (the `sample` capability)
type Sampler = { json: (input: string, o?: { modelTier?: string }) => Promise<unknown> };
let samplerP: Promise<Sampler | null> | null = null;
const sampler = () => (samplerP ??= (async () => {
  try { const c = (window as unknown as { claude?: { use(n: string): Promise<unknown> } }).claude; return c?.use ? ((await c.use("sample")) as Sampler | null) : null; } catch { return null; }
})());

// ---------------------------------------------------------------- IndexedDB
let idb: IDBDatabase | null = null;
const open = () => new Promise<void>((res) => {
  try { const r = indexedDB.open("kinan-site-agent-v2", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => { idb = r.result; res(); }; r.onerror = () => res(); } catch { res(); }
});
const get = <T,>(k: string) => new Promise<T | undefined>((res) => { if (!idb) return res(undefined); const q = idb.transaction("kv").objectStore("kv").get(k); q.onsuccess = () => res(q.result as T); q.onerror = () => res(undefined); });
const put = (k: string, v: unknown) => new Promise<void>((res) => { if (!idb) return res(); const t = idb.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = () => res(); t.onerror = () => res(); });

// ---------------------------------------------------------------- settings
const LS = (k: string, d = "") => { try { return localStorage.getItem("kinan." + k) ?? d; } catch { return d; } };
function llm() {
  return configFrom({
    ANTHROPIC_API_KEY: LS("anthropicKey") || undefined, OPENAI_API_KEY: LS("openaiKey") || undefined,
    LLM_MODE: LS("mode", "auto"), LLM_FALLBACK: LS("fallback", "true"),
    LLM_ROUTE_FAST: LS("routeFast") || undefined, LLM_ROUTE_MAIN: LS("routeMain") || undefined, LLM_ROUTE_DEEP: LS("routeDeep") || undefined,
  }, true);
}

// ---------------------------------------------------------------- repo
const files = new Map<string, Blob>();
const urls = new Map<string, string>();
let repo: Repo;
let saveT: ReturnType<typeof setTimeout> | undefined;

export async function boot() {
  await open();
  let db = await get<Db>("db");
  if (!db) db = seedDb();
  if (!db.data) db.data = buildProjectData();
  for (const d of db.docs) if (!d.generated) { const f = await get<Blob>("file:" + d.id); if (f) files.set(d.id, f); }
  repo = {
    db,
    save: () => { clearTimeout(saveT); saveT = setTimeout(() => put("db", JSON.parse(JSON.stringify(repo.db))), 120); },
    loadFile: async (d: Doc) => { const f = files.get(d.id); return f ? new Uint8Array(await f.arrayBuffer()) : null; },
  };
  runtime.mode = "standalone";
  runtime.fileUrl = (doc) => {
    const d = repo.db.docs.find((x) => x.id === doc.id);
    if (!d) return "";
    const key = d.id + "@" + (d.revision ?? "");
    if (urls.has(key)) return urls.get(key)!;
    let u: string;
    if (d.generated) u = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(renderDrawing(d.generated.kind, d.generated.label, d.revision));
    else if (files.has(d.id)) u = URL.createObjectURL(files.get(d.id)!);
    else u = "data:text/plain;charset=utf-8," + encodeURIComponent(d.text || d.summary);
    urls.set(key, u);
    return u;
  };
  installFetch();
}

// ---------------------------------------------------------------- handlers
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const rid = (p: string) => `${p}_${Math.random().toString(16).slice(2, 12)}`;

async function handle(method: string, url: URL, init?: RequestInit): Promise<Response> {
  const db = repo.db, p = url.pathname.replace(/^.*\/api\//, "/api/");
  const body = async () => (typeof init?.body === "string" ? JSON.parse(init.body) : {});
  if (p === "/api/state") {
    return json({ project: db.project, locations: db.locations, docs: db.docs.map(({ text: _t, ...d }) => d), notes: db.notes, dataDate: db.data.meta.dataDate, agentMode: "offline", providers: [] });
  }
  if (p === "/api/project") return json(db.data);
  if (p === "/api/notes") {
    const b = await body();
    if (method === "PATCH") { const n = db.notes.find((x) => x.id === b.id); if (!n) return json({ error: "Not found" }, 404); n.status = b.status === "closed" ? "closed" : "open"; repo.save(); return json({ note: n }); }
    if (!String(b.text ?? "").trim() || (!b.docId && !b.locationId)) return json({ error: "Empty note" }, 400);
    const note: Note = { id: rid("n"), createdAt: new Date().toISOString(), status: "open", text: String(b.text).trim(), docId: b.docId, locationId: b.locationId, kind: ["note", "issue", "instruction"].includes(b.kind) ? b.kind : "note", author: b.author || "Dev Manager", via: "manual", at: b.at };
    db.notes.unshift(note); repo.save(); return json({ note });
  }
  if (p === "/api/locations" && method === "POST") {
    const b = await body();
    const loc = { id: rid("pin"), name: String(b.name), type: "pin" as const, parentId: b.parentId, x: Number(b.x), y: Number(b.y) };
    db.locations.push(loc); repo.save(); return json({ location: loc });
  }
  if (p === "/api/upload" && method === "POST") {
    const fd = init?.body as FormData;
    const file = fd.get("file") as File | null;
    const locationId = String(fd.get("locationId") ?? "");
    if (!file) return json({ error: "No file" }, 400);
    if (!db.locations.some((l) => l.id === locationId)) return json({ error: "Pick a location" }, 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = file.type || (/\.pdf$/i.test(file.name) ? "application/pdf" : "application/octet-stream");
    const s = (k: string) => { const v = String(fd.get(k) ?? "").trim(); return v || undefined; };
    let text = /\.(txt|md|csv|json)$/i.test(file.name) ? (await file.text()).slice(0, 20000) : "";
    const ai = await describeUpload(llm(), bytes, mime, file.name);
    let category = (s("category") ?? ai?.category) as Doc["category"] | undefined;
    if (!category || !CATEGORIES.includes(category)) category = mime.startsWith("image/") ? "Photo" : "Other";
    text ||= ai?.text ?? "";
    const x = Number(fd.get("x")), y = Number(fd.get("y"));
    const doc: Doc = {
      id: rid("d"), title: s("title") ?? ai?.title ?? file.name.replace(/\.[^.]+$/, ""), category, discipline: ai?.discipline, revision: s("revision") ?? ai?.revision,
      locationId, pin: fd.get("x") !== null && Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined,
      filename: file.name, mime, size: bytes.length, summary: s("summary") ?? ai?.summary ?? "", text, tags: [], uploadedAt: new Date().toISOString(), uploadedBy: s("author") ?? "Dev Manager",
    };
    files.set(doc.id, file); await put("file:" + doc.id, file);
    db.docs.unshift(doc); repo.save();
    return json({ doc: { ...doc, text: undefined }, indexed: !!ai });
  }
  if (p === "/api/model3d") {
    const sm = await sampler();
    if (method === "GET") return json({ engines: { anthropic: sm ? "Claude (in this page)" : null, openai: null, gemini: null, offline: "offline parser" } });
    const fd = init?.body as FormData, engine = String(fd.get("engine") ?? "auto");
    const docs: ExtractDoc[] = [];
    for (const f of fd.getAll("files") as File[]) if (/\.(csv|tsv|txt|md|json|xml|xer)$/i.test(f.name) || f.type.startsWith("text/")) docs.push({ name: f.name, mime: f.type || "text/plain", text: await f.text() });
    if (!docs.length) return json({ error: "The standalone page reads CSV, Markdown and text documents" }, 400);
    const t0 = Date.now(), tried: { engine: string; error: string }[] = [];
    if (sm && (engine === "auto" || engine === "anthropic")) {
      try {
        const raw = await sm.json(`${SYSTEM}\n\n${promptFor(docs)}`, { modelTier: "default" });
        const { spec, warnings } = normalizeSpec(raw);
        if (!spec.buildings.length) throw new Error("no buildings in Claude's answer");
        return json({ spec, warnings, engine: "anthropic", model: "Claude", route: "routed to Claude in this page", ms: Date.now() - t0, log: [{ step: "AI", detail: `${spec.buildings.length} buildings, ${spec.schedule.activities.length} activities read by Claude` }], tried });
      } catch (e) {
        const msg = (e as { message?: string; code?: string })?.message ?? String(e);
        if (engine === "anthropic") return json({ error: msg }, 502);
        tried.push({ engine: "anthropic", error: msg.slice(0, 240) });
      }
    } else if (engine === "anthropic" || engine === "openai" || engine === "gemini") return json({ error: "Only the offline parser (and Claude, when this page runs on claude.ai) is available in the standalone page" }, 400);
    const out = await extractModel({}, docs, "offline");
    return json({ ...out, tried: [...tried, ...out.tried], ms: Date.now() - t0, route: sm ? "Claude did not return a usable model, so the offline parser took over" : "no AI engine available in this page" });
  }
  return json({ error: "Not available in the standalone version" }, 404);
}

function installFetch() {
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, "http://local/");
    if (raw.startsWith("/api/") || (url.host === "local" && url.pathname.startsWith("/api/")))
      return handle((init?.method ?? "GET").toUpperCase(), url, init);
    return real(input as RequestInfo, init);
  };
}
