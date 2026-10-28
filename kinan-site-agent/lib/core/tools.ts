import type { Db, Doc, MaterialRequest, Note, UiAction } from "../types";
import { FM_TOOLS } from "../fm/tools";
import { HAS_OPERATIONS } from "../edition";
import { fitJson } from "./fit";
import { checkInput } from "./validate";
import { guard, shot } from "./invariants";
import { descendantIds, locationById, locationPath, resolveLocation, searchDocs } from "./query";
import * as P from "./project";
import { searchEmails, type InboxState } from "./emails";
import { completionDate, findActivity, recordUpdate, updatesFor } from "./updates";

/** Storage the tools run against — implemented by the server (fs) and the browser (IndexedDB). */
export interface Repo {
  db: Db;
  save(): void | Promise<void>;
  loadFile?(doc: Doc): Promise<Uint8Array | null>;
  /** Push a material request to the purchasing system, if one is connected. */
  createRequisition?(mr: MaterialRequest): Promise<{ externalRef?: string; message?: string }>;
  /** Refresh procurement data from the purchasing system if stale (best effort). */
  syncProcurement?(): Promise<void>;
  /** The project's Outlook inbox: emails from contractors (synced when stale). */
  emails?(force?: boolean): Promise<InboxState>;
}

export interface Attachment { mime: string; base64: string; name?: string }
export interface ToolCtx {
  author: string;
  actions: UiAction[];
  focus?: { docId?: string; locationId?: string };
  channel?: "web" | "whatsapp" | "field";
  /** facility management focus: the facility (control room) and, for a personal field agent, the technician */
  fm?: { facilityId?: string; techId?: string };
  /** The daily brief's layout (lib/reports/layout.ts), when the host provides the reports engine. */
  reports?: BriefLayoutApi;
  /** the person behind the conversation (signed in, or a known WhatsApp number): their approval limits apply */
  user?: import("../auth/people").Person | null;
}
export interface BriefLayoutApi {
  view(lang: "en" | "ar"): Promise<import("../reports/layout").LayoutView>;
  change(ops: import("../reports/layout").Op[], lang: "en" | "ar", by: string): Promise<{ view: import("../reports/layout").LayoutView; done: string[]; notes: string[]; message: string }>;
  undo(lang: "en" | "ar"): Promise<{ ok: boolean; message: string; view: import("../reports/layout").LayoutView }>;
}

export type Block = { type: string; [k: string]: unknown };
export type ToolResult = string | Block[];

export function toBase64(bytes: Uint8Array): string {
  const B = (globalThis as { Buffer?: { from(b: Uint8Array): { toString(enc: string): string } } }).Buffer;
  if (B) return B.from(bytes).toString("base64");
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const obj = (props: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties: props, required });
const str = (description?: string, extra: Record<string, unknown> = {}) => ({ type: "string", ...(description ? { description } : {}), ...extra });
const num = (description?: string, extra: Record<string, unknown> = {}) => ({ type: "number", ...(description ? { description } : {}), ...extra });
const int = (description: string | undefined, minimum: number, maximum: number) => ({ type: "integer", ...(description ? { description } : {}), minimum, maximum });
const date = (description = "YYYY-MM-DD") => str(description, { format: "date" });
const oneOf = (values: string[], description?: string) => str(description, { enum: values });
const bool = (description?: string) => ({ type: "boolean", ...(description ? { description } : {}) });
const LOC = str("Place on site, e.g. 'Tower A level 12', 'TC1', 'gate 2', 'batching plant'. Includes sub-locations.");

export interface ToolDef { name: string; description: string; input_schema: { type: string; properties: Record<string, unknown>; required: string[] } }
export const TOOL_DEFS: ToolDef[] = [
  { name: "search_project", description: "Universal keyword search across EVERYTHING: documents, schedule activities, drawing register, regulations, safety rules, purchase orders, procurement packages, NCRs and contacts. Good first step when unsure where information lives.", input_schema: obj({ query: str() }, ["query"]) },
  { name: "search_documents", description: "Search the document library (drawings, specs, design basis reports, RFIs, inspections, method statements, permits, HSE, minutes, snag lists, variations, photos).", input_schema: obj({ query: str(), category: str("Drawing | Specification | RFI | Inspection | Method Statement | Permit | HSE | Submittal | Minutes | Snag List | Variation | NCR | Report | Delivery Note | Photo | Other"), location: LOC, discipline: str("ARC, STR, MEP, CIV, HSE, QA, FIRE, FAC, PMO") }) },
  { name: "get_document", description: "Read one document in full: metadata, content text and notes. PDFs/photos are attached when the model can read them. Call before quoting a document.", input_schema: obj({ id: str() }, ["id"]) },
  { name: "list_locations", description: "Find places on the site map. Returns ids usable with other tools.", input_schema: obj({ query: str() }) },
  { name: "get_location_overview", description: "Everything about one place: documents, open notes, current & next schedule activities, active permits, open NCRs, upcoming deliveries.", input_schema: obj({ location: LOC }, ["location"]) },
  { name: "add_note", description: "Leave a note/issue/instruction on a document and/or place. Clean up dictation; do not invent facts. 'this'/'here' = the current focus.", input_schema: obj({ text: str(undefined, { maxLength: 2000 }), document_id: str(), location: LOC, kind: str(undefined, { enum: ["note", "issue", "instruction"] }) }, ["text"]) },
  { name: "list_notes", description: "List notes/issues left by the team, optionally for a document or place, optionally only open ones.", input_schema: obj({ document_id: str(), location: LOC, status: str(undefined, { enum: ["open", "closed"] }) }) },
  { name: "resolve_note", description: "Close (or reopen) a note.", input_schema: obj({ id: str(), status: str(undefined, { enum: ["open", "closed"] }) }, ["id"]) },
  { name: "show_on_map", description: "Show a place on the site map (web: pans the map; WhatsApp: sends a map image).", input_schema: obj({ location: LOC }, ["location"]) },
  { name: "open_document", description: "Open a document/drawing for the user (web: viewer; WhatsApp: sends the file or image).", input_schema: obj({ id: str() }, ["id"]) },
  { name: "schedule_query", description: "Query the construction programme (P6-style activities with baseline vs forecast). Filter by place, keywords, status, date window, critical or late (slip > 3 days).", input_schema: obj({ location: LOC, query: str("e.g. 'slab', 'façade', 'lift', activity id"), status: str(undefined, { enum: ["completed", "in_progress", "not_started"] }), from: date(), to: date(), critical: bool(), late: bool(), trade: str(), limit: int(undefined, 1, 100) }) },
  { name: "lookahead", description: "Look-ahead programme from the data date: activities starting/finishing, milestones, critical work and deliveries in the next N weeks (default 2).", input_schema: obj({ weeks: int("1–8", 1, 8), location: LOC }) },
  { name: "schedule_summary", description: "Overall programme health: % complete vs planned, SPI, upcoming milestones with variance, biggest slippages, completion forecast.", input_schema: obj({}) },
  { name: "update_activity", description: "Record progress reported from site on a programme activity: mark it completed, set % complete, or report it pending/blocked. Updates the project schedule immediately. Attach evidence photos/PDFs already filed (document ids, e.g. from a WhatsApp photo). Pass the activity id when known, else describe it (e.g. 'Tower A L14 columns core walls PT slab'); if several activities match, the tool returns candidates — ask the user which one. Never invent progress the user didn't report.", input_schema: obj({ activity: str("activity id (e.g. TA-STR-L14) or a description"), state: str(undefined, { enum: ["completed", "in_progress", "pending"] }), percent: num("0-100, for in_progress (or the real % when pending)", { minimum: 0, maximum: 100 }), note: str("what the user reported, cleaned up", { maxLength: 1000 }), evidence_doc_ids: { type: "array", items: { type: "string" }, description: "documents filed as evidence" } }, ["activity", "state"]) },
  { name: "get_activity", description: "Full detail of one activity incl. predecessors/successors and procurement needs.", input_schema: obj({ id: str() }, ["id"]) },
  { name: "drawing_register", description: "Drawing register (≈800 sheets): current revision, status (IFC/IFA/Under Review/As-Built), revision history. Filter by place, discipline (ARC/STR/HVAC/PLB/ELE/FIRE/CIV/FAC/LAN or MEP), sheet number, status.", input_schema: obj({ location: LOC, discipline: str(), sheet: str(), status: oneOf(["IFC", "IFA", "Under Review", "For Information", "As-Built"]), query: str(), limit: int(undefined, 1, 100) }) },
  { name: "search_regulations", description: "Project compliance register: Saudi Building Code (SBC), Civil Defense, MHRSD labour/heat rules, MOMRAH permits, GACA, SEC/NWC, NCEC environment, etc., as applied to this project, with compliance status.", input_schema: obj({ query: str(), topic: str(), location: LOC, status: oneOf(["Compliant", "In Progress", "Action Required", "Not Yet Applicable"]) }) },
  { name: "safety_requirements", description: "Safety requirements for an activity and/or place: HSE rules, PPE, permits required, active permits there, risk assessments, recent incidents.", input_schema: obj({ activity: str("e.g. 'hot work', 'façade installation', 'excavation', 'concrete pour'"), location: LOC, query: str() }) },
  { name: "hse_overview", description: "HSE status: KPIs (LTI-free days, TRIR, manhours), active permits, open/recent incidents, PPE matrix.", input_schema: obj({}) },
  { name: "permits", description: "List permits-to-work (filter by status Active/Closed/Suspended/Requested, place, type).", input_schema: obj({ status: oneOf(["Active", "Expired", "Closed", "Suspended", "Requested"], "Active = live now; Expired = active permit past its end time"), location: LOC, type: str() }) },
  { name: "purchase_orders", description: "Purchase orders from the purchasing system (synced): search by keyword/supplier/status/package, or pass po for full detail incl. lines and deliveries.", input_schema: obj({ po: str("e.g. PO-4500123"), query: str(), supplier: str(), status: oneOf(["Open", "Partially Delivered", "Delivered", "Closed", "Cancelled"]), package: str("e.g. PKG-06") }) },
  { name: "deliveries", description: "Material deliveries: scheduled/in-transit/delayed/received, by date window (default next 7 days from data date), place, PO or keyword.", input_schema: obj({ from: date(), to: date(), status: oneOf(["Scheduled", "In Transit", "Received", "Delayed", "Rejected"]), location: LOC, po: str(), query: str() }) },
  { name: "procurement_packages", description: "Procurement packages: status, supplier, budget vs committed, required-on-site vs forecast (at risk when forecast is later).", input_schema: obj({ query: str(), atRisk: bool(), status: oneOf(["Planning", "RFQ", "Evaluation", "Awarded", "Manufacturing", "Delivering", "Complete"]) }) },
  { name: "stock_levels", description: "Material stock on site (yards, silos, stores) and items below minimum.", input_schema: obj({ query: str(), low: bool() }) },
  { name: "create_material_request", description: "Raise a material request (MR) from site. Creates a request for the procurement team and pushes it to the purchasing system if connected. It does NOT commit spend. Confirm item, quantity, unit, need-by date and place with the user if any is missing.", input_schema: obj({ item: str(), qty: num(undefined, { exclusiveMinimum: 0 }), unit: str(), needed_by: date("YYYY-MM-DD, today or later"), location: LOC, notes: str(undefined, { maxLength: 1000 }) }, ["item", "qty", "unit", "needed_by"]) },
  { name: "ncrs", description: "Non-conformance reports (quality): filter by status, place, keyword.", input_schema: obj({ status: oneOf(["Open", "Closed"]), location: LOC, query: str() }) },
  { name: "contractor_emails", description: "Emails from contractors and consultants in the project's Outlook inbox (project updates, delays, RFIs, HSE reports, inspections). Search by keywords, sender/company and date window; newest first. Use it for anything a contractor may have written about: delays, revised dates, requests, confirmations.", input_schema: obj({ query: str("keywords, e.g. 'façade delay', 'L13 pour', 'SEC inspection', 'PO-4500136'"), from: str("sender name, address or company, e.g. 'Skyline', 'Al-Bunyan'"), since: date(), until: date(), limit: int(undefined, 1, 40) }) },
  { name: "get_email", description: "Read one email in full (body text, sender, date, attachment names). Call before quoting an email.", input_schema: obj({ id: str() }, ["id"]) },
  { name: "find_contact", description: "Find the right person/company/phone for a role, trade or area (e.g. 'lifting supervisor', 'façade', 'HSE').", input_schema: obj({ query: str() }, ["query"]) },
  { name: "get_brief_layout", description: "The daily brief's current layout: sections in order (on/off), item limit, project focus, notes. Use when asked what is in the daily brief / report.", input_schema: obj({ lang: oneOf(["en", "ar"]) }) },
  { name: "change_brief_layout", description: "Change the daily brief (the scheduled morning e-mail and ▶ Play): hide/show/move a section, limit lists to N items, focus on one project, add or clear a note, undo the last change, or reset to the standard brief. Sections: headline (always first), since, today, next48, critical, milestones, procurement, safety, projects. Use for 'remove the procurement section', 'move safety to the top', 'only Kinan Heights', 'top 3 items', 'add a note to the brief: …', 'undo'.",
    input_schema: obj({ ops: { type: "array", items: obj({ op: oneOf(["hide", "show", "move", "limit", "focus", "add_note", "clear_notes", "reset"]), section: str("for hide/show/move"), to: str("move: top | bottom | before | after"), ref: str("move before/after: the other section"), n: { type: "integer", description: "limit: 1–10, or omit to lift the limit", minimum: 1, maximum: 10 }, project: str("focus: project name, or omit for all projects"), text: str("add_note: the note", { maxLength: 500 }) }, ["op"]) }, undo: { type: "boolean", description: "true: undo the last change instead" }, lang: oneOf(["en", "ar"]) }) },
  { name: "site_proposals", description: "The construction orchestrator: what it proposes for the site right now — expedite late packages, resequence work around a late delivery, night shifts to recover slipping work, material requests to raise or approve, expired permits to close, permits and overdue NCRs to chase — each with its reasons, risk, cost and who carries it out. Or approve / reject one (with the reason: not_now, already_handled, wrong_person, too_costly, disagree). Approving changes the programme/procurement records and leaves the instruction on the site plan. The user's approval limits apply.",
    input_schema: obj({ kind: oneOf(["expedite", "resequence", "recover", "stock_mr", "approve_mr", "permit_close", "permit_chase", "ncr_escalate"], "filter"), approve: str("proposal id, or 'low_risk' for every low-risk one the user may approve"), reject: str("proposal id"), reason: oneOf(["not_now", "already_handled", "wrong_person", "too_costly", "disagree"], "for reject") }) },
  // facility management: the operations layer (lib/fm/tools.ts)
  ...(HAS_OPERATIONS ? (FM_TOOLS as ToolDef[]) : []),
];

// every answer reaches the model as valid JSON; long lists are shortened, and the answer says so (lib/core/fit.ts)
const J = (o: unknown) => fitJson(o);

export function docBrief(db: Db, d: Doc) {
  return {
    id: d.id, title: d.title, category: d.category, discipline: d.discipline, revision: d.revision,
    location: locationPath(db, d.locationId), summary: d.summary, uploadedAt: d.uploadedAt.slice(0, 10),
    openNotes: db.notes.filter((n) => n.docId === d.id && n.status === "open").length,
  };
}
export const noteBrief = (db: Db, n: Note) => ({ id: n.id, kind: n.kind, status: n.status, text: n.text, author: n.author, date: n.createdAt.slice(0, 10), docId: n.docId, location: n.locationId ? locationPath(db, n.locationId) : undefined });

export function newId(p: string) { return `${p}_${Math.random().toString(16).slice(2, 12)}`; }

export async function addNoteTo(repo: Repo, n: Omit<Note, "id" | "createdAt" | "status"> & { status?: Note["status"] }): Promise<Note> {
  const note: Note = { id: newId("n"), createdAt: new Date().toISOString(), status: "open", ...n };
  repo.db.notes.unshift(note);
  await repo.save();
  return note;
}

const PROCUREMENT_TOOLS = new Set(["purchase_orders", "deliveries", "procurement_packages", "stock_levels"]);

export async function runTool(repo: Repo, name: string, raw: Record<string, any>, ctx: ToolCtx): Promise<ToolResult> {
  // every call is checked against the tool's own description first (lib/core/validate.ts): wrong types, values out of
  // range, unknown states and impossible dates come back as a refusal to take to the user, never as recorded data
  const def = TOOL_DEFS.find((t) => t.name === name) ?? (FM_TOOLS as ToolDef[]).find((t) => t.name === name);
  if (!def) return J({ error: `Unknown tool ${name}` });
  const checked = checkInput(def.input_schema, raw, { today: repo.db.data.meta.dataDate, tool: name });
  if ("error" in checked) return J(checked);
  const input = checked.input as Record<string, any>;
  if (name.startsWith("fm_")) return (await import("../fm/tools")).runFmTool(repo, name, input, ctx);
  const db = repo.db;
  try {
    if (PROCUREMENT_TOOLS.has(name) && repo.syncProcurement) await repo.syncProcurement().catch(() => undefined);
    switch (name) {
      case "search_project": return J(P.searchProject(db, String(input.query ?? "")));
      case "site_proposals": {
        const { siteActions, decideSite } = await import("../site/api");
        const { canApprove } = await import("../auth/people");
        const via = ctx.channel === "whatsapp" ? "whatsapp" : ctx.channel === "field" ? "field" : "web";
        if (input.approve === "low_risk") {
          // "approve all the low-risk ones": each within the user's limits; the rest are listed, not approved
          const done: string[] = [], skipped: string[] = [];
          for (const a of siteActions(db).filter((x) => x.risk === "low")) {
            try { done.push(decideSite(db, { actionId: a.id, decision: "approved" }, ctx.user, via).message); } catch (e) { skipped.push((e as Error).message); }
          }
          await repo.save();
          return J({ approved: done.length, done, notApproved: skipped, stillProposed: siteActions(db).map((a) => ({ id: a.id, title: a.title, risk: a.risk })) });
        }
        if (input.approve || input.reject) {
          const r = decideSite(db, { actionId: String(input.approve ?? input.reject), decision: input.approve ? "approved" : "rejected", reason: input.reason }, ctx.user, via);
          await repo.save();
          return J({ ok: true, message: r.message });
        }
        const xs = siteActions(db).filter((a) => !input.kind || a.kind === input.kind);
        return J({ user: ctx.user ? `${ctx.user.name} (${ctx.user.role})` : "not signed in — can't approve", count: xs.length,
          proposals: xs.map((a) => ({ id: a.id, kind: a.kind, title: a.title, why: a.why, risk: a.risk, cost: a.cost, costNote: a.costNote, owner: a.owner, userMayApprove: canApprove(ctx.user, { domain: "site", risk: a.risk, cost: a.cost, kind: a.kind, party: a.party }) })) });
      }
      case "search_documents": {
        let locationId: string | undefined;
        if (input.location) { const l = resolveLocation(db, String(input.location)); if (!l) return J({ error: `No place matches "${input.location}".` }); locationId = l.id; }
        const found = searchDocs(db, { query: input.query, category: input.category, locationId, discipline: input.discipline });
        // a short window of the document text around the first query term, so the answer can be quoted without a second call
        const words = String(input.query ?? "").toLowerCase().split(/[^a-z0-9\u0600-\u06ff-]+/).filter((w) => w.length > 2);
        const excerpt = (t?: string) => { if (!t) return undefined; const low = t.toLowerCase(); let i = -1; for (const w of words) { i = low.indexOf(w); if (i >= 0) break; } if (i < 0) i = 0; const a = Math.max(0, i - 120); return `${a ? "…" : ""}${t.slice(a, a + 360).replace(/\s+/g, " ")}${a + 360 < t.length ? "…" : ""}`; };
        return J({ count: found.length, documents: found.map((d) => ({ ...docBrief(db, d), excerpt: excerpt(d.text) })) });
      }
      case "get_document": {
        const d = db.docs.find((x) => x.id === input.id);
        if (!d) return J({ error: "Document not found" });
        const meta = J({ ...docBrief(db, d), filename: d.filename, tags: d.tags, uploadedBy: d.uploadedBy, text: d.text || "(no extracted text — see attached file if any)", notes: db.notes.filter((n) => n.docId === d.id).map((n) => noteBrief(db, n)) });
        if (!d.generated && repo.loadFile && (d.mime === "application/pdf" || /^image\/(jpeg|png|gif|webp)$/.test(d.mime))) {
          const bytes = await repo.loadFile(d);
          if (bytes && bytes.length < 4.5 * 1024 * 1024) {
            const src = { type: "base64", media_type: d.mime, data: toBase64(bytes) };
            return [{ type: "text", text: meta }, d.mime === "application/pdf" ? { type: "document", source: src } : { type: "image", source: src }];
          }
        }
        return meta;
      }
      case "list_locations": {
        const q = String(input.query ?? "").toLowerCase();
        const hits = db.locations.filter((l) => l.type !== "level" || q).filter((l) => !q || `${l.name} ${(l.aliases ?? []).join(" ")} ${l.id}`.toLowerCase().includes(q)).slice(0, 40)
          .map((l) => ({ id: l.id, name: l.name, type: l.type, path: locationPath(db, l.id) }));
        return J({ count: hits.length, locations: hits });
      }
      case "get_location_overview": {
        const l = resolveLocation(db, String(input.location));
        if (!l) return J({ error: `No place matches "${input.location}".` });
        const ids = descendantIds(db, l.id), d0 = P.today(db);
        const docs = db.docs.filter((d) => ids.has(d.locationId));
        const notes = db.notes.filter((n) => (n.locationId && ids.has(n.locationId)) || docs.some((d) => d.id === n.docId));
        const acts = db.data.schedule.filter((a) => ids.has(a.locationId));
        return J({
          location: { id: l.id, name: l.name, type: l.type, path: locationPath(db, l.id) }, dataDate: d0,
          documents: docs.slice(0, 20).map((d) => docBrief(db, d)), documentCount: docs.length,
          openNotes: notes.filter((n) => n.status === "open").map((n) => noteBrief(db, n)),
          activitiesInProgress: acts.filter((a) => a.status === "in_progress").slice(0, 10).map((a) => ({ id: a.id, name: a.name, percent: a.percent, finish: a.finish, baselineFinish: a.baselineFinish })),
          nextActivities: acts.filter((a) => a.status === "not_started").sort((a, b) => a.start.localeCompare(b.start)).slice(0, 6).map((a) => ({ id: a.id, name: a.name, start: a.start })),
          activePermits: db.data.safety.permits.filter((p) => p.status === "Active" && ids.has(p.locationId)).map((p) => ({ id: p.id, type: p.type, description: p.description })),
          openNcrs: db.data.quality.ncrs.filter((n) => n.status === "Open" && ids.has(n.locationId)).map((n) => ({ id: n.id, title: n.title })),
          upcomingDeliveries: db.data.procurement.deliveries.filter((x) => x.date >= d0 && ids.has(x.locationId)).slice(0, 6),
        });
      }
      case "add_note": {
        const text = String(input.text ?? "").trim();
        if (!text) return J({ error: "Note text is empty" });
        let locationId: string | undefined;
        if (input.location) { const l = resolveLocation(db, String(input.location)); if (!l) return J({ error: `No place matches "${input.location}".` }); locationId = l.id; }
        const docId: string | undefined = input.document_id || undefined;
        if (docId && !db.docs.find((d) => d.id === docId)) return J({ error: "Document not found" });
        if (!docId && !locationId) { locationId = ctx.focus?.locationId; if (!locationId) return J({ error: "Specify a document or place — nothing is currently in focus." }); }
        const n = await addNoteTo(repo, { text, docId, locationId, kind: input.kind ?? "note", author: ctx.author, via: "agent" });
        return J({ saved: true, note: noteBrief(db, n) });
      }
      case "list_notes": {
        let ids: Set<string> | null = null;
        if (input.location) { const l = resolveLocation(db, String(input.location)); if (!l) return J({ error: `No place matches "${input.location}".` }); ids = descendantIds(db, l.id); }
        const notes = db.notes.filter((n) => (!input.document_id || n.docId === input.document_id) && (!input.status || n.status === input.status) &&
          (!ids || (n.locationId && ids.has(n.locationId)) || (n.docId && ids.has(db.docs.find((d) => d.id === n.docId)?.locationId ?? "")))).slice(0, 40);
        return J({ count: notes.length, notes: notes.map((n) => noteBrief(db, n)) });
      }
      case "resolve_note": {
        const n = db.notes.find((x) => x.id === input.id);
        if (!n) return J({ error: "Note not found" });
        n.status = input.status === "open" ? "open" : "closed";
        await repo.save();
        return J({ updated: noteBrief(db, n) });
      }
      case "show_on_map": {
        const l = resolveLocation(db, String(input.location));
        if (!l) return J({ error: `No place matches "${input.location}".` });
        ctx.actions.push({ type: "focus_location", locationId: l.id });
        return J({ shown: l.name, path: locationPath(db, l.id) });
      }
      case "open_document": {
        const d = db.docs.find((x) => x.id === input.id);
        if (!d) return J({ error: "Document not found" });
        ctx.actions.push({ type: "open_doc", docId: d.id });
        return J({ opened: d.title, note: ctx.channel === "whatsapp" ? "The file/image will be sent to the user after your reply." : undefined });
      }
      case "schedule_query": return J(P.scheduleQuery(db, input));
      case "lookahead": return J(P.lookahead(db, input));
      case "schedule_summary": return J(P.scheduleSummary(db));
      case "get_activity": { const r = P.getActivity(db, String(input.id ?? "")); return J("error" in r ? r : { ...r, siteUpdates: updatesFor(db, r.id) }); }
      case "update_activity": {
        const state = input.state as "completed" | "in_progress" | "pending";
        const f = findActivity(db, String(input.activity ?? ""));
        if (!f.activity)
          return J({ error: f.candidates.length ? "Several activities match — ask the user which one, then call again with its id." : `No activity matches "${input.activity}".`, candidates: f.candidates.map((a) => ({ id: a.id, name: a.name, location: locationPath(db, a.locationId), status: a.status, percent: a.percent })) });
        const ev: string[] = Array.isArray(input.evidence_doc_ids) ? input.evidence_doc_ids.map(String).filter((id: string) => db.docs.some((d) => d.id === id)) : [];
        const pct = input.percent as number | undefined; // 0–100, checked at the boundary
        const a = f.activity;
        const st = state === "in_progress" && pct === 100 ? "completed" : state;
        const pcBefore = completionDate(db.data), rules = shot(db.data);
        const u = recordUpdate(db, a, { id: `U-${Date.now().toString(36)}`, state: st, percent: pct, note: input.note ? String(input.note) : undefined, evidence: ev, by: ctx.author, channel: ctx.channel === "whatsapp" ? "whatsapp" : "web" });
        guard(`progress on ${a.id}`, db.data, rules);
        await addNoteTo(repo, { text: `Progress: ${a.id} ${a.name} — ${state === "completed" ? "completed" : state === "pending" ? "pending" : `${a.percent}% complete`}${u.note ? `. ${u.note}` : ""}${ev.length ? ` (${ev.length} evidence file${ev.length > 1 ? "s" : ""})` : ""}`, locationId: a.locationId, docId: ev[0], kind: state === "pending" ? "issue" : "note", author: ctx.author, via: "agent" });
        await repo.save();
        // work reported ahead of what it depends on is worth a question (a wrong activity, or work out of sequence)
        const behind = st !== "pending" ? a.predecessors.map((id) => db.data.schedule.find((x) => x.id === id)).filter((p): p is NonNullable<typeof p> => !!p && p.status !== "completed") : [];
        const pcAfter = completionDate(db.data);
        return J({ updated: { id: a.id, name: a.name, location: locationPath(db, a.locationId), was: u.before, now: { status: a.status, percent: a.percent, start: a.start, finish: a.finish, baselineFinish: a.baselineFinish, critical: a.critical }, evidence: ev.length },
          ...(pcAfter !== pcBefore ? { practicalCompletion: { was: pcBefore, now: pcAfter, note: "The work that follows moved with it." } } : {}),
          ...(behind.length ? { warning: `Reported ahead of what it depends on: ${behind.map((p) => `${p.id} is ${p.status === "in_progress" ? `${p.percent}%` : "not started"}`).join(", ")}. Check with the user that this is the right activity, or note the work is out of sequence.` } : {}) });
      }
      case "drawing_register": return J(P.registerQuery(db, input));
      case "search_regulations": return J(P.regulationsQuery(db, input));
      case "safety_requirements": return J(P.safetyFor(db, input));
      case "hse_overview": return J(P.hseOverview(db));
      case "permits": return J(P.permitsQuery(db, input));
      case "purchase_orders": return J(input.po ? P.getPo(db, String(input.po)) : P.poQuery(db, input));
      case "deliveries": return J(P.deliveriesQuery(db, input));
      case "procurement_packages": return J(P.packagesQuery(db, input));
      case "stock_levels": return J(P.stockQuery(db, input));
      case "create_material_request": {
        const qty = input.qty as number; // item, qty > 0, unit and a need-by from today on: checked at the boundary
        let locationId = ctx.focus?.locationId ?? "site";
        if (input.location) { const l = resolveLocation(db, String(input.location)); if (!l) return J({ error: `No place matches "${input.location}".` }); locationId = l.id; }
        const reqs = db.data.procurement.requests;
        const mr: MaterialRequest = {
          id: `MR-${reqs.reduce((m, r) => Math.max(m, Number(r.id.replace(/\D/g, "")) || 0), 300) + 1}`,
          item: String(input.item), qty, unit: String(input.unit), neededBy: String(input.needed_by), locationId,
          requestedBy: ctx.author, created: new Date().toISOString().slice(0, 10), status: "Submitted", notes: input.notes ? String(input.notes) : undefined,
        };
        let pushed: { externalRef?: string; message?: string } = { message: "Recorded locally (no purchasing system connected)." };
        if (repo.createRequisition) {
          try { pushed = await repo.createRequisition(mr); mr.externalRef = pushed.externalRef; }
          catch (e) { mr.status = "Draft"; pushed = { message: `Purchasing system rejected/unreachable — saved as Draft: ${e instanceof Error ? e.message : e}` }; }
        }
        reqs.unshift(mr);
        await repo.save();
        return J({ created: { ...mr, location: locationPath(db, mr.locationId) }, purchasingSystem: pushed });
      }
      case "ncrs": return J(P.ncrQuery(db, input));
      case "find_contact": return J(P.contactsQuery(db, input));
      case "contractor_emails": case "get_email": {
        if (!repo.emails) return J({ error: "No inbox is connected." });
        const inbox = await repo.emails();
        const status = { mailbox: inbox.mailbox, mode: inbox.mode, lastSync: inbox.lastSync, ...(inbox.error ? { syncError: inbox.error } : {}) };
        if (name === "get_email") {
          const e = inbox.emails.find((x) => x.id === String(input.id));
          return J(e ? { ...e, received: e.received.slice(0, 16).replace("T", " ") } : { error: `No email ${input.id}`, ...status });
        }
        return J({ ...status, ...searchEmails(inbox.emails, { query: input.query, from: input.from, since: input.since, until: input.until, limit: input.limit }) });
      }
      case "get_brief_layout": {
        if (!ctx.reports) return J({ error: "The brief layout is not available here." });
        const view = await ctx.reports.view(input.lang === "ar" ? "ar" : "en");
        ctx.actions.push({ type: "brief_layout", view });
        return J({ layout: view, note: "Shown to the user as a card; summarise in one line." });
      }
      case "change_brief_layout": {
        if (!ctx.reports) return J({ error: "The brief layout cannot be changed here." });
        const lang = input.lang === "ar" ? "ar" : "en";
        if (input.undo) { const u = await ctx.reports.undo(lang); ctx.actions.push({ type: "brief_layout", view: u.view, message: u.message }); return J({ ok: u.ok, message: u.message, layout: u.view }); }
        const ops = (Array.isArray(input.ops) ? input.ops : []).map((o: Record<string, unknown>) => ({ ...o, n: o.n === undefined ? null : Number(o.n), project: o.project === undefined || o.project === "" ? null : String(o.project) }));
        const r = await ctx.reports.change(ops as never, lang, ctx.author);
        ctx.actions.push({ type: "brief_layout", view: r.view, message: r.message });
        return J({ changed: r.done, notes: r.notes, layout: r.view, note: "Applies from the next brief (Preview today's brief to see it). Shown to the user as a card; confirm in one line." });
      }
      default: return J({ error: `Unknown tool ${name}` });
    }
  } catch (e) {
    return J({ error: e instanceof Error ? e.message : String(e) });
  }
}

export { locationById };
