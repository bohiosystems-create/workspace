import type { Db, Doc, MaterialRequest, Note, UiAction } from "../types";
import { descendantIds, locationById, locationPath, resolveLocation, searchDocs } from "./query";
import * as P from "./project";

/** Storage the tools run against — implemented by the server (fs) and the browser (IndexedDB). */
export interface Repo {
  db: Db;
  save(): void | Promise<void>;
  loadFile?(doc: Doc): Promise<Uint8Array | null>;
  /** Push a material request to the purchasing system, if one is connected. */
  createRequisition?(mr: MaterialRequest): Promise<{ externalRef?: string; message?: string }>;
  /** Refresh procurement data from the purchasing system if stale (best effort). */
  syncProcurement?(): Promise<void>;
}

export interface Attachment { mime: string; base64: string; name?: string }
export interface ToolCtx {
  author: string;
  actions: UiAction[];
  focus?: { docId?: string; locationId?: string };
  channel?: "web" | "whatsapp";
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
const num = (description?: string) => ({ type: "number", ...(description ? { description } : {}) });
const bool = (description?: string) => ({ type: "boolean", ...(description ? { description } : {}) });
const LOC = str("Place on site, e.g. 'Tower A level 12', 'TC1', 'gate 2', 'batching plant'. Includes sub-locations.");

export interface ToolDef { name: string; description: string; input_schema: { type: string; properties: Record<string, unknown>; required: string[] } }
export const TOOL_DEFS: ToolDef[] = [
  { name: "search_project", description: "Universal keyword search across EVERYTHING: documents, schedule activities, drawing register, regulations, safety rules, purchase orders, procurement packages, NCRs and contacts. Good first step when unsure where information lives.", input_schema: obj({ query: str() }, ["query"]) },
  { name: "search_documents", description: "Search the document library (drawings, specs, design basis reports, RFIs, inspections, method statements, permits, HSE, minutes, snag lists, variations, photos).", input_schema: obj({ query: str(), category: str("Drawing | Specification | RFI | Inspection | Method Statement | Permit | HSE | Submittal | Minutes | Snag List | Variation | Photo | Other"), location: LOC, discipline: str("ARC, STR, MEP, CIV, HSE, QA, FIRE, FAC, PMO") }) },
  { name: "get_document", description: "Read one document in full: metadata, content text and notes. PDFs/photos are attached when the model can read them. Call before quoting a document.", input_schema: obj({ id: str() }, ["id"]) },
  { name: "list_locations", description: "Find places on the site map. Returns ids usable with other tools.", input_schema: obj({ query: str() }) },
  { name: "get_location_overview", description: "Everything about one place: documents, open notes, current & next schedule activities, active permits, open NCRs, upcoming deliveries.", input_schema: obj({ location: LOC }, ["location"]) },
  { name: "add_note", description: "Leave a note/issue/instruction on a document and/or place. Clean up dictation; do not invent facts. 'this'/'here' = the current focus.", input_schema: obj({ text: str(), document_id: str(), location: LOC, kind: str(undefined, { enum: ["note", "issue", "instruction"] }) }, ["text"]) },
  { name: "list_notes", description: "List notes/issues left by the team, optionally for a document or place, optionally only open ones.", input_schema: obj({ document_id: str(), location: LOC, status: str(undefined, { enum: ["open", "closed"] }) }) },
  { name: "resolve_note", description: "Close (or reopen) a note.", input_schema: obj({ id: str(), status: str(undefined, { enum: ["open", "closed"] }) }, ["id"]) },
  { name: "show_on_map", description: "Show a place on the site map (web: pans the map; WhatsApp: sends a map image).", input_schema: obj({ location: LOC }, ["location"]) },
  { name: "open_document", description: "Open a document/drawing for the user (web: viewer; WhatsApp: sends the file or image).", input_schema: obj({ id: str() }, ["id"]) },
  { name: "schedule_query", description: "Query the construction programme (P6-style activities with baseline vs forecast). Filter by place, keywords, status, date window, critical or late (slip > 3 days).", input_schema: obj({ location: LOC, query: str("e.g. 'slab', 'façade', 'lift', activity id"), status: str(undefined, { enum: ["completed", "in_progress", "not_started"] }), from: str("YYYY-MM-DD"), to: str("YYYY-MM-DD"), critical: bool(), late: bool(), trade: str(), limit: num() }) },
  { name: "lookahead", description: "Look-ahead programme from the data date: activities starting/finishing, milestones, critical work and deliveries in the next N weeks (default 2).", input_schema: obj({ weeks: num(), location: LOC }) },
  { name: "schedule_summary", description: "Overall programme health: % complete vs planned, SPI, upcoming milestones with variance, biggest slippages, completion forecast.", input_schema: obj({}) },
  { name: "get_activity", description: "Full detail of one activity incl. predecessors/successors and procurement needs.", input_schema: obj({ id: str() }, ["id"]) },
  { name: "drawing_register", description: "Drawing register (≈800 sheets): current revision, status (IFC/IFA/Under Review/As-Built), revision history. Filter by place, discipline (ARC/STR/HVAC/PLB/ELE/FIRE/CIV/FAC/LAN or MEP), sheet number, status.", input_schema: obj({ location: LOC, discipline: str(), sheet: str(), status: str(), query: str(), limit: num() }) },
  { name: "search_regulations", description: "Project compliance register: Saudi Building Code (SBC), Civil Defense, MHRSD labour/heat rules, MOMRAH permits, GACA, SEC/NWC, NCEC environment, etc., as applied to this project, with compliance status.", input_schema: obj({ query: str(), topic: str(), location: LOC, status: str() }) },
  { name: "safety_requirements", description: "Safety requirements for an activity and/or place: HSE rules, PPE, permits required, active permits there, risk assessments, recent incidents.", input_schema: obj({ activity: str("e.g. 'hot work', 'façade installation', 'excavation', 'concrete pour'"), location: LOC, query: str() }) },
  { name: "hse_overview", description: "HSE status: KPIs (LTI-free days, TRIR, manhours), active permits, open/recent incidents, PPE matrix.", input_schema: obj({}) },
  { name: "permits", description: "List permits-to-work (filter by status Active/Closed/Suspended/Requested, place, type).", input_schema: obj({ status: str(), location: LOC, type: str() }) },
  { name: "purchase_orders", description: "Purchase orders from the purchasing system (synced): search by keyword/supplier/status/package, or pass po for full detail incl. lines and deliveries.", input_schema: obj({ po: str("e.g. PO-4500123"), query: str(), supplier: str(), status: str(), package: str("e.g. PKG-06") }) },
  { name: "deliveries", description: "Material deliveries: scheduled/in-transit/delayed/received, by date window (default next 7 days from data date), place, PO or keyword.", input_schema: obj({ from: str(), to: str(), status: str(), location: LOC, po: str(), query: str() }) },
  { name: "procurement_packages", description: "Procurement packages: status, supplier, budget vs committed, required-on-site vs forecast (at risk when forecast is later).", input_schema: obj({ query: str(), atRisk: bool(), status: str() }) },
  { name: "stock_levels", description: "Material stock on site (yards, silos, stores) and items below minimum.", input_schema: obj({ query: str(), low: bool() }) },
  { name: "create_material_request", description: "Raise a material request (MR) from site. Creates a request for the procurement team and pushes it to the purchasing system if connected. It does NOT commit spend. Confirm item, quantity, unit, need-by date and place with the user if any is missing.", input_schema: obj({ item: str(), qty: num(), unit: str(), needed_by: str("YYYY-MM-DD"), location: LOC, notes: str() }, ["item", "qty", "unit", "needed_by"]) },
  { name: "ncrs", description: "Non-conformance reports (quality): filter by status, place, keyword.", input_schema: obj({ status: str(), location: LOC, query: str() }) },
  { name: "find_contact", description: "Find the right person/company/phone for a role, trade or area (e.g. 'lifting supervisor', 'façade', 'HSE').", input_schema: obj({ query: str() }, ["query"]) },
];

const MAX = 14_000;
const J = (o: unknown) => { const s = JSON.stringify(o); return s.length > MAX ? s.slice(0, MAX) + '…"(truncated — narrow the query)"' : s; };

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

export async function runTool(repo: Repo, name: string, input: Record<string, any>, ctx: ToolCtx): Promise<ToolResult> {
  const db = repo.db;
  try {
    if (PROCUREMENT_TOOLS.has(name) && repo.syncProcurement) await repo.syncProcurement().catch(() => undefined);
    switch (name) {
      case "search_project": return J(P.searchProject(db, String(input.query ?? "")));
      case "search_documents": {
        let locationId: string | undefined;
        if (input.location) { const l = resolveLocation(db, String(input.location)); if (!l) return J({ error: `No place matches "${input.location}".` }); locationId = l.id; }
        const found = searchDocs(db, { query: input.query, category: input.category, locationId, discipline: input.discipline });
        return J({ count: found.length, documents: found.map((d) => docBrief(db, d)) });
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
        const n = await addNoteTo(repo, { text, docId, locationId, kind: ["note", "issue", "instruction"].includes(input.kind) ? input.kind : "note", author: ctx.author, via: "agent" });
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
      case "get_activity": return J(P.getActivity(db, String(input.id ?? "")));
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
        const qty = Number(input.qty);
        if (!input.item || !Number.isFinite(qty) || qty <= 0 || !input.unit || !/^\d{4}-\d{2}-\d{2}$/.test(String(input.needed_by ?? "")))
          return J({ error: "Need item, positive qty, unit and needed_by (YYYY-MM-DD)." });
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
      default: return J({ error: `Unknown tool ${name}` });
    }
  } catch (e) {
    return J({ error: e instanceof Error ? e.message : String(e) });
  }
}

export { locationById };
