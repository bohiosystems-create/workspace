/**
 * In-browser stand-in for the Next.js API routes, so the single-file HTML runs
 * the exact same UI + agent core with no server. Data lives in IndexedDB;
 * AI keys are entered in Settings and kept in localStorage.
 */
import type { Db, Doc, Note } from "../lib/types";
import { CATEGORIES } from "../lib/types";
import { seedDb } from "../lib/seed";
import { buildProjectData } from "../lib/data";
import { renderDrawing } from "../lib/drawings";
import { offlineAgent, runAgent, systemPrompt } from "../lib/core/agent";
import { describeUpload } from "../lib/core/describe";
import { availableProviders, classify, configFrom } from "../lib/core/llm/router";
import { TOOL_DEFS, runTool, type Repo, type ToolCtx } from "../lib/core/tools";
import type { ChatTurn } from "../lib/core/llm/types";
import type { RouteInfo } from "../lib/types";
import { runtime } from "../app/_components/runtime";

// ---------------------------------------------------------------- IndexedDB
let idb: IDBDatabase | null = null;
const open = () => new Promise<void>((res) => {
  try { const r = indexedDB.open("kinan-site-agent-v2", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => { idb = r.result; res(); }; r.onerror = () => res(); } catch { res(); }
});
const get = <T,>(k: string) => new Promise<T | undefined>((res) => { if (!idb) return res(undefined); const q = idb.transaction("kv").objectStore("kv").get(k); q.onsuccess = () => res(q.result as T); q.onerror = () => res(undefined); });
const put = (k: string, v: unknown) => new Promise<void>((res) => { if (!idb) return res(); const t = idb.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = () => res(); t.onerror = () => res(); });

// ---------------------------------------------------------------- settings
const LS = (k: string, d = "") => { try { return localStorage.getItem("kinan." + k) ?? d; } catch { return d; } };
const setLS = (k: string, v: string) => { try { localStorage.setItem("kinan." + k, v); } catch { /* private mode */ } };
function llm() {
  return configFrom({
    ANTHROPIC_API_KEY: LS("anthropicKey") || undefined, OPENAI_API_KEY: LS("openaiKey") || undefined,
    LLM_MODE: LS("mode", "auto"), LLM_FALLBACK: LS("fallback", "true"),
    LLM_ROUTE_FAST: LS("routeFast") || undefined, LLM_ROUTE_MAIN: LS("routeMain") || undefined, LLM_ROUTE_DEEP: LS("routeDeep") || undefined,
  }, true);
}

// ---------------------------------------------------------------- Claude via the artifact runtime
// When this page is opened as a claude.ai Artifact, `window.claude.use("sample")` lets it ask
// Claude on the viewer's own account — no API keys. Page tools = the agent's project tools.
type SampleFn = ((input: unknown, opts?: Record<string, unknown>) => Promise<{ text: string; truncated: boolean; modelTierApplied: string }>) & {
  limits(): Promise<{ tools?: { maxCount: number } }>;
};
let sampleFn: SampleFn | null = null;
let sampleOff = ""; // set once the viewer declines / Claude is unavailable in this view
let toolLimit = 0;

async function initSample() {
  const w = window as unknown as { claude?: { use(n: string): Promise<unknown> } };
  if (!w.claude?.use) return;
  try {
    const s = (await w.claude.use("sample")) as SampleFn | null;
    if (!s) return;
    const lim = await s.limits().catch(() => null);
    toolLimit = lim?.tools?.maxCount ?? 0;
    sampleFn = s;
  } catch { /* absent */ }
}
const builtinOn = () => !!sampleFn && !sampleOff;

// Most useful first, in case the view allows fewer tools than we have.
const TOOL_PRIORITY = ["search_project", "get_location_overview", "schedule_query", "lookahead", "search_documents", "get_document",
  "safety_requirements", "deliveries", "purchase_orders", "procurement_packages", "search_regulations", "add_note", "open_document",
  "show_on_map", "drawing_register", "schedule_summary", "permits", "hse_overview", "list_notes", "find_contact", "ncrs",
  "get_activity", "stock_levels", "create_material_request", "resolve_note", "list_locations"];

async function runBuiltin(history: ChatTurn[], ctx: { author: string; focus?: { docId?: string; locationId?: string }; here?: { locationId: string } }) {
  const toolCtx: ToolCtx = { author: ctx.author, actions: [], focus: { ...ctx.focus, locationId: ctx.focus?.locationId ?? ctx.here?.locationId }, channel: "web" };
  const last = history[history.length - 1]?.content ?? "";
  const c = classify(last);
  const tier = c.tier === "fast" ? "quick" : c.tier === "deep" ? "complex" : "default";
  const defs = [...TOOL_DEFS].sort((a, b) => (TOOL_PRIORITY.indexOf(a.name) + 99) % 99 - (TOOL_PRIORITY.indexOf(b.name) + 99) % 99).slice(0, toolLimit || 0);
  const tools = defs.map((t) => ({
    name: t.name, description: t.description.slice(0, 1000), inputSchema: t.input_schema,
    execute: async (input: Record<string, unknown>) => {
      const out = await runTool(repo, t.name, input as Record<string, any>, toolCtx);
      return typeof out === "string" ? out : out.filter((b) => b.type === "text").map((b) => String(b.text)).join("\n");
    },
  }));
  const turns = [{ role: "user", content: systemPrompt(repo, { ...ctx, channel: "web" }) + "\n\n(Use the provided tools to look things up.)" }, ...history.slice(-16)];
  const t0 = Date.now();
  const r = await sampleFn!(turns, { modelTier: tier, ...(tools.length ? { tools } : { cache: false }) });
  const route: RouteInfo = { provider: "anthropic", model: `${r.modelTierApplied} tier, via Claude.ai`, tier: c.tier, reason: c.reason + " · viewer's Claude account", ms: Date.now() - t0 };
  return { reply: r.text + (r.truncated ? "\n\n(Answer cut short — ask for less at a time.)" : ""), actions: toolCtx.actions, route };
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
  await Promise.race([initSample(), new Promise((r) => setTimeout(r, 4000))]);
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
    const prov = builtinOn() ? ["anthropic"] : availableProviders(llm());
    return json({ project: db.project, locations: db.locations, docs: db.docs.map(({ text: _t, ...d }) => d), notes: db.notes, dataDate: db.data.meta.dataDate, agentMode: prov.length ? "ai" : "offline", providers: prov });
  }
  if (p === "/api/project") return json(db.data);
  if (p === "/api/agent" && method === "POST") {
    const b = await body();
    const msgs = (b.messages ?? []).filter((m: { role: string; content: string }) => (m.role === "user" || m.role === "assistant") && m.content?.trim()).slice(-20);
    const ctx = { author: b.author || "Dev Manager", focus: b.focus, here: b.here };
    if (builtinOn()) {
      try { return json(await runBuiltin(msgs, ctx)); }
      catch (e) {
        const code = (e as { code?: string }).code ?? "upstream_error";
        if (["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"].includes(code)) sampleOff = code;
        const toolCtx: ToolCtx = { author: ctx.author, actions: [], focus: ctx.focus, channel: "web" };
        const off = await offlineAgent(repo, msgs, toolCtx);
        const why = code === "not_granted" ? "Claude wasn't allowed for this page" : code === "rate_limited" ? "Claude usage limit reached — try again later" : code === "cancelled" ? "stopped" : "Claude is unavailable right now";
        return json({ ...off, reply: `⚠️ ${why} — offline answer:\n\n${off.reply}` });
      }
    }
    try { return json(await runAgent(repo, msgs, { ...ctx, channel: "web" }, llm())); }
    catch (e) { return json({ reply: `Agent error: ${e instanceof Error ? e.message : e}`, actions: [], route: { provider: "offline", model: "-", tier: "offline", reason: "error" } }); }
  }
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
  if (p === "/api/llm") {
    if (method === "POST") {
      const b = await body();
      setLS("anthropicKey", b.anthropic ?? ""); setLS("openaiKey", b.openai ?? ""); setLS("mode", b.mode ?? "auto"); setLS("fallback", String(b.fallback !== false));
      setLS("routeFast", b.fast ?? ""); setLS("routeMain", b.main ?? ""); setLS("routeDeep", b.deep ?? "");
      return json({ ok: true });
    }
    const c = llm();
    if (builtinOn()) return json({ editable: false, builtin: true, providers: { anthropic: true, openai: false }, available: ["anthropic"], mode: "auto", fallback: true,
      routes: { fast: [{ provider: "anthropic", model: "quick tier" }], main: [{ provider: "anthropic", model: "default tier" }], deep: [{ provider: "anthropic", model: "complex tier" }] }, transcription: null });
    return json({ editable: true, providers: { anthropic: !!c.anthropic, openai: !!c.openai }, available: availableProviders(c), mode: c.mode, fallback: c.fallback, routes: c.routes, transcription: null, keys: { anthropic: LS("anthropicKey"), openai: LS("openaiKey") } });
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
