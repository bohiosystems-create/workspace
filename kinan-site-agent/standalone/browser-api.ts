/**
 * In-browser stand-in for the Next.js API routes, so the single-file HTML runs
 * the same UI with no server. Data lives in IndexedDB. The AI agent itself is
 * reached only through WhatsApp on the server deployment.
 */
import type { Db, Doc, Note } from "../lib/types";
import { CATEGORIES } from "../lib/types";
import { seedDb } from "../lib/seed";
import { buildProjectData, rollToToday } from "../lib/data";
import { renderDrawing } from "../lib/drawings";
import { describeUpload } from "../lib/core/describe";
import { configFrom } from "../lib/core/llm/router";
import { demoEmails } from "../lib/core/emails";
import { AiUnavailable, runAgent as coreAgent } from "../lib/core/agent";
import type { Repo } from "../lib/core/tools";
import { runtime } from "../app/_components/runtime";
import { SYSTEM, extractModel, promptFor, type ExtractDoc } from "../lib/model3d/extract";
import { normalizeSpec } from "../lib/model3d/spec";
import { loadProjects } from "../lib/model3d/store";
import { reports } from "../lib/reports/engine";

// Daily reports in this page: kept in IndexedDB; e-mail is always simulated (no Outlook here).
let rep: ReturnType<typeof reports> | null = null;
const pageReports = () => (rep ??= reports({
  get: async <T,>(k: string) => ((await get<T>("rep:" + k)) ?? null),
  put: (k, v) => put("rep:" + k, JSON.parse(JSON.stringify(v))),
  lock: async (_n, fn) => fn(),
  db: async () => repo.db,
  projects: async () => loadProjects(),
  emails: async () => demoEmails(repo.db.data),
  send: async () => ({ delivery: "mock", providerRef: `mock-${Date.now().toString(36)}` }),
  env: { mode: "mock", creds: false, sender: "onsite@kinan.com.sa", senderSet: false, cron: false, allowedRecipients: "" },
}));

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
  { const fresh = rollToToday(db.data); if (fresh) db.data = fresh; } // the demo data follows the calendar
  for (const d of db.docs) if (!d.generated) { const f = await get<Blob>("file:" + d.id); if (f) files.set(d.id, f); }
  repo = {
    db,
    save: () => { clearTimeout(saveT); saveT = setTimeout(() => put("db", JSON.parse(JSON.stringify(repo.db))), 120); },
    loadFile: async (d: Doc) => { const f = files.get(d.id); return f ? new Uint8Array(await f.arrayBuffer()) : null; },
    // the standalone build has no mailbox: the demo inbox
    emails: async () => ({ mode: "demo" as const, mailbox: "projectupdates@kinan.example", lastSync: null, error: null, emails: demoEmails(repo.db.data) }),
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
  if (p === "/api/state/stamp") return json({ v: "standalone", last: null });
  if (p === "/api/state") {
    return json({ project: db.project, locations: db.locations, docs: db.docs.map(({ text: _t, ...d }) => d), notes: db.notes, dataDate: db.data.meta.dataDate, agentMode: "offline", providers: [] });
  }
  if (p === "/api/project") return json(db.data);
  // signing in: this page has no WhatsApp, so only the demo list (remembered on this device)
  const Pp = await import("../lib/auth/people");
  const me = (() => { try { const ph = localStorage.getItem("kinan.sa.me"); return ph ? Pp.findByPhone(db, ph) ?? null : null; } catch { return null; } })();
  if (p === "/api/auth") {
    if (method === "GET") return json({ me: me ? Pp.publicPerson(me) : null, demo: true, whatsapp: false, people: Pp.directory(db, {}).map(Pp.publicPerson) });
    const b = await body();
    if (b.op === "logout") { try { localStorage.removeItem("kinan.sa.me"); } catch { /* storage blocked */ } return json({ me: null }); }
    if (b.op === "demo") { const x = Pp.findById(db, String(b.id)); if (!x) return json({ error: "Unknown person." }, 400); try { localStorage.setItem("kinan.sa.me", x.phone); } catch { /* storage blocked */ } return json({ me: Pp.publicPerson(x) }); }
    return json({ error: "Sign-in by WhatsApp needs the server. Pick a person from the demo list." }, 400);
  }
  if (p === "/api/people") return method === "GET" && me && ["manager", "director", "admin"].includes(me.role) ? json({ people: Pp.directory(db, {}), canEdit: false, roles: Object.entries(Pp.LIMITS).map(([id, l]) => ({ id, label: Pp.ROLE_LABEL[id as keyof typeof Pp.LIMITS], limits: l.label })) }) : json({ error: "Managers and admins only." }, 403);
  if (p === "/api/approvals" || p === "/api/today") {
    const A = await import("../lib/approvals");
    try {
      if (method === "GET") {
        if (p === "/api/approvals") return json({ items: A.approvals(db, me) });
        const O = await import("../lib/outcomes");
        return json(url.searchParams.has("outcomes") ? O.outcomes(db, url.searchParams.get("outcomes") === "all" ? undefined : url.searchParams.get("outcomes") || undefined) : A.today(db, me));
      }
      const r = A.decideApproval(db, await body(), me, "web");
      repo.save();
      return json({ ok: true, message: r.message });
    } catch (e) { return json({ error: (e as Error).message }, 400); }
  }
  // facility management: the same engine and orchestrator, over this page's own copy of the data
  if (p === "/api/fm") {
    const F = await import("../lib/fm/api");
    try {
      if (method === "GET") { const q = url.searchParams; return json(q.get("tech") ? F.myDay(db, q.get("tech")!) : q.get("facility") ? F.facilityStateFor(db, q.get("facility")!, me) : F.overview(db)); }
      const b = await body();
      const r = F.act(db, b, me?.name ?? String(b.by || "Control room"), b.channel === "field" ? "field" : "web", me);
      repo.save();
      return json({ ok: true, message: r.message });
    } catch (e) { return json({ error: (e as Error).message }, 400); }
  }
  if (p === "/api/ready") return method === "GET"
    ? json({ at: new Date().toISOString(), deep: false, standalone: true, checks: [{ id: "standalone", label: "Standalone page", status: "warn", detail: "No server: AI keys and voices come from this device's settings; WhatsApp, e-mail and the scheduler are not available here." }], score: { ok: 0, warn: 1, fail: 0, total: 1 } })
    : json({ error: "Not available in the standalone page." }, 400);
  // ▶ Play in the standalone page: no server, so the player speaks with the browser's own voice and live words come from
  // the browser's speech recognition; questions get a short honest line.
  if (p === "/api/voice") return method === "GET" ? json({ enabled: false, provider: "browser", model: null }) : json({ error: "Voice is not configured." }, 501);
  if (p.startsWith("/api/transcribe")) return json({ error: "Voice is not configured." }, 501);
  if (p === "/api/deck-ask" && method === "POST") {
    const b = (await body().catch(() => ({}))) as { lang?: string };
    return json({ answer: b.lang === "ar" ? "لا أستطيع الإجابة عن الأسئلة في هذه النسخة المستقلة؛ تجدون التفاصيل في صفحات التطبيق. لنتابع العرض." : "I can't take questions in this standalone page; the detail is in the app's pages. Let's carry on." });
  }
  if (p === "/api/inbox") return json(await repo.emails!());
  if (p === "/api/chat" && method === "POST") {
    // the chat answers only through the AI API, with the keys set on this device
    const b = (await body().catch(() => ({}))) as { messages?: { role: "user" | "assistant"; content: string }[]; author?: string; focus?: { docId?: string; locationId?: string } };
    try { const r = await coreAgent(repo, (b.messages ?? []).slice(-20), { author: me?.name ?? (b.author || "Site team"), user: me, channel: "web", focus: b.focus, aiOnly: true, deadline: Date.now() + 90_000, reports: { view: async (l) => (await pageReports().layoutState(l)).view, change: (ops, l, by) => pageReports().layoutChange(ops, l, by, "chat"), undo: (l) => pageReports().layoutUndo(l) } }, llm()); return json(r); }
    catch (e) { return json({ error: e instanceof AiUnavailable ? e.message.replace("set ANTHROPIC_API_KEY or OPENAI_API_KEY", "add a Claude or OpenAI key in settings") : "The AI service did not answer. Try again in a moment." }, 503); }
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
    const ai = await describeUpload(llm(), bytes, mime, file.name, { db, hint: s("title") ?? s("summary"), locationId });
    let category = (s("category") ?? ai?.category) as Doc["category"] | undefined;
    if (!category || !CATEGORIES.includes(category)) category = mime.startsWith("image/") ? "Photo" : "Other";
    text ||= ai?.text ?? "";
    const x = Number(fd.get("x")), y = Number(fd.get("y"));
    const doc: Doc = {
      id: rid("d"), title: s("title") ?? ai?.title ?? file.name.replace(/\.[^.]+$/, ""), category, discipline: ai?.discipline, revision: s("revision") ?? ai?.revision,
      locationId, pin: fd.get("x") !== null && Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined,
      filename: file.name, mime, size: bytes.length, summary: s("summary") ?? ai?.summary ?? "", text, tags: [], uploadedAt: new Date().toISOString(), uploadedBy: s("author") ?? "Dev Manager",
      ...(ai?.photo ? { photo: ai.photo } : {}),
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
  if (p === "/api/reports/layout") {
    try { return json(method === "GET" ? await pageReports().layoutState(url.searchParams.get("lang") === "ar" ? "ar" : "en") : await pageReports().layoutAction(JSON.parse(String(init?.body ?? "{}")))); }
    catch (e) { return json({ error: (e as Error)?.message ?? "Failed." }, 400); }
  }
  if (p === "/api/reports") {
    try {
      if (method === "GET") { const id = url.searchParams.get("id"); return json(id ? await pageReports().getReport(id) : await pageReports().state(url.searchParams.get("lang") === "ar" ? "ar" : "en")); }
      return json(await pageReports().action(JSON.parse(String(init?.body ?? "{}"))));
    } catch (e) { return json({ error: (e as Error)?.message ?? "Failed." }, 400); }
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
