import type { Doc, Note, UiAction } from "./types";
import {
  addNote, db, descendantIds, locationPath, readUpload, resolveLocation, searchDocs, updateNote,
} from "./store";

export interface ToolCtx {
  author: string;
  actions: UiAction[];
  /** What the user is looking at right now. */
  focus?: { docId?: string; locationId?: string };
}

const docBrief = (d: Doc) => ({
  id: d.id, title: d.title, category: d.category, discipline: d.discipline, revision: d.revision,
  location: locationPath(d.locationId), locationId: d.locationId, summary: d.summary,
  uploadedAt: d.uploadedAt.slice(0, 10),
  openNotes: db().notes.filter((n) => n.docId === d.id && n.status === "open").length,
});
const noteBrief = (n: Note) => ({
  id: n.id, kind: n.kind, status: n.status, text: n.text, author: n.author, date: n.createdAt.slice(0, 10),
  docId: n.docId, location: n.locationId ? locationPath(n.locationId) : undefined,
});

export const TOOL_DEFS = [
  {
    name: "search_documents",
    description:
      "Search project documents (drawings, specs, RFIs, inspections, method statements, permits, HSE, submittals, minutes, snag lists, variations, photos). Full-text over titles, tags, summaries and content. Filter by location to see what is attached to a place on the site.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keywords, e.g. 'PT slab thickness' or 'RFI façade'" },
        category: { type: "string", description: "Drawing | Specification | RFI | Inspection | Method Statement | Permit | HSE | Submittal | Minutes | Snag List | Variation | Photo | Other" },
        location: { type: "string", description: "Place name, e.g. 'Tower A level 12', 'gate 2', 'TC1', 'batching plant'. Includes everything beneath it (a building includes its levels)." },
        discipline: { type: "string", description: "ARC, STR, MEP, CIV, HSE, QA" },
      },
    },
  },
  {
    name: "get_document",
    description:
      "Read one document in full: metadata, extracted text, all notes left on it. For drawings/PDFs/photos the actual file is also shown to you so you can describe what is drawn. Call this before answering questions about a document's contents.",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "list_locations",
    description: "Find places on the site map (buildings, levels, yards, gates, cranes, utilities, temporary facilities). Returns ids usable with other tools.",
    input_schema: { type: "object", properties: { query: { type: "string" } } },
  },
  {
    name: "get_location_overview",
    description:
      "Everything known about a place: documents attached (including sub-locations), open notes/issues. Use for 'what's the status here?' and 'what do I need to know about X?'.",
    input_schema: { type: "object", properties: { location: { type: "string" } }, required: ["location"] },
  },
  {
    name: "add_note",
    description:
      "Leave a note on a document and/or a place. Use kind 'issue' for problems, 'instruction' for directions to the team, 'note' otherwise. Write the note text cleanly in the manager's voice (fix dictation errors) but do not invent facts. If the user says 'this drawing' / 'here', use the focus provided in the system prompt.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string" },
        document_id: { type: "string" },
        location: { type: "string", description: "Place name or id" },
        kind: { type: "string", enum: ["note", "issue", "instruction"] },
      },
      required: ["text"],
    },
  },
  {
    name: "list_notes",
    description: "List notes/issues left by the team, optionally for a document or place, optionally only open ones.",
    input_schema: {
      type: "object",
      properties: { document_id: { type: "string" }, location: { type: "string" }, status: { type: "string", enum: ["open", "closed"] } },
    },
  },
  {
    name: "resolve_note",
    description: "Close (or reopen) a note once the matter is dealt with.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" }, status: { type: "string", enum: ["open", "closed"] } },
      required: ["id"],
    },
  },
  {
    name: "show_on_map",
    description: "Pan and zoom the phone's site map to a place so the manager sees it. Use when asked 'where is…', 'show me…'.",
    input_schema: { type: "object", properties: { location: { type: "string" } }, required: ["location"] },
  },
  {
    name: "open_document",
    description: "Open a document (e.g. a drawing) in the phone's viewer so the manager can look at it, zoom and mark it up.",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
] as const;

type Block = { type: string; [k: string]: unknown };
export type ToolResult = string | Block[];

const json = (o: unknown) => JSON.stringify(o, null, 1);

function fileBlocks(d: Doc): Block[] {
  const MAX = 4.5 * 1024 * 1024;
  let buf: Buffer | null = null;
  let mime = d.mime;
  if (d.generated) {
    // Claude can't read SVG as an image; the drawing text already carries its content.
    return [];
  }
  buf = readUpload(d.id);
  if (!buf || buf.length > MAX) return [];
  if (mime === "application/pdf")
    return [{ type: "document", source: { type: "base64", media_type: mime, data: buf.toString("base64") } }];
  if (["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mime))
    return [{ type: "image", source: { type: "base64", media_type: mime, data: buf.toString("base64") } }];
  return [];
}

export function runTool(name: string, input: Record<string, any>, ctx: ToolCtx): ToolResult {
  try {
    switch (name) {
      case "search_documents": {
        let locationId: string | undefined;
        if (input.location) {
          const l = resolveLocation(String(input.location));
          if (!l) return json({ error: `No place matches "${input.location}". Use list_locations.` });
          locationId = l.id;
        }
        const found = searchDocs({ query: input.query, category: input.category, locationId, discipline: input.discipline });
        return json({ count: found.length, documents: found.map(docBrief) });
      }
      case "get_document": {
        const d = db().docs.find((x) => x.id === input.id);
        if (!d) return json({ error: "Document not found" });
        const meta = {
          ...docBrief(d), filename: d.filename, tags: d.tags, uploadedBy: d.uploadedBy,
          text: d.text || "(no extracted text — see attached file if any)",
          notes: db().notes.filter((n) => n.docId === d.id).map(noteBrief),
        };
        const files = fileBlocks(d);
        return files.length ? [{ type: "text", text: json(meta) }, ...files] : json(meta);
      }
      case "list_locations": {
        const q = String(input.query ?? "").toLowerCase();
        const hits = db().locations
          .filter((l) => l.type !== "level" || q)
          .filter((l) => !q || `${l.name} ${(l.aliases ?? []).join(" ")} ${l.id}`.toLowerCase().includes(q))
          .slice(0, 40)
          .map((l) => ({ id: l.id, name: l.name, type: l.type, path: locationPath(l.id) }));
        return json({ count: hits.length, locations: hits });
      }
      case "get_location_overview": {
        const l = resolveLocation(String(input.location));
        if (!l) return json({ error: `No place matches "${input.location}".` });
        const ids = descendantIds(l.id);
        const docs = db().docs.filter((d) => ids.has(d.locationId));
        const notes = db().notes.filter((n) => (n.locationId && ids.has(n.locationId)) || docs.some((d) => d.id === n.docId));
        return json({
          location: { id: l.id, name: l.name, type: l.type, path: locationPath(l.id) },
          documents: docs.map(docBrief),
          openNotes: notes.filter((n) => n.status === "open").map(noteBrief),
          closedNotes: notes.filter((n) => n.status === "closed").length,
        });
      }
      case "add_note": {
        const text = String(input.text ?? "").trim();
        if (!text) return json({ error: "Note text is empty" });
        let locationId: string | undefined;
        if (input.location) {
          const l = resolveLocation(String(input.location));
          if (!l) return json({ error: `No place matches "${input.location}".` });
          locationId = l.id;
        }
        const docId: string | undefined = input.document_id || undefined;
        if (docId && !db().docs.find((d) => d.id === docId)) return json({ error: "Document not found" });
        if (!docId && !locationId) {
          locationId = ctx.focus?.locationId;
          if (!locationId) return json({ error: "Specify a document or place — nothing is currently in focus." });
        }
        const n = addNote({ text, docId, locationId, kind: input.kind ?? "note", author: ctx.author, via: "agent" });
        return json({ saved: true, note: noteBrief(n) });
      }
      case "list_notes": {
        let ids: Set<string> | null = null;
        if (input.location) {
          const l = resolveLocation(String(input.location));
          if (!l) return json({ error: `No place matches "${input.location}".` });
          ids = descendantIds(l.id);
        }
        const notes = db().notes
          .filter((n) => (!input.document_id || n.docId === input.document_id) && (!input.status || n.status === input.status) &&
            (!ids || (n.locationId && ids.has(n.locationId)) || (n.docId && ids.has(db().docs.find((d) => d.id === n.docId)?.locationId ?? ""))))
          .slice(0, 40);
        return json({ count: notes.length, notes: notes.map(noteBrief) });
      }
      case "resolve_note": {
        const n = updateNote(String(input.id), { status: input.status ?? "closed" });
        return json(n ? { updated: noteBrief(n) } : { error: "Note not found" });
      }
      case "show_on_map": {
        const l = resolveLocation(String(input.location));
        if (!l) return json({ error: `No place matches "${input.location}".` });
        ctx.actions.push({ type: "focus_location", locationId: l.id });
        return json({ shown: l.name, path: locationPath(l.id) });
      }
      case "open_document": {
        const d = db().docs.find((x) => x.id === input.id);
        if (!d) return json({ error: "Document not found" });
        ctx.actions.push({ type: "open_doc", docId: d.id });
        return json({ opened: d.title });
      }
      default:
        return json({ error: `Unknown tool ${name}` });
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) });
  }
}

