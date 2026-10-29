import type { RouteInfo, UiAction } from "../types";
import { locationPath, resolveLocation, searchDocs } from "./query";
import * as P from "./project";
import { TOOL_DEFS, runTool, type Attachment, type Repo, type ToolCtx } from "./tools";
import { availableProviders, routeAndRun } from "./llm/router";
import type { ChatTurn, LlmConfig } from "./llm/types";

export interface AgentContext {
  author: string;
  channel?: "web" | "whatsapp" | "field";
  /** facility management: answer as the operations agent of this facility, or as this technician's personal agent */
  fm?: { facilityId?: string; techId?: string };
  focus?: { docId?: string; locationId?: string };
  here?: { locationId: string };
  attachments?: Attachment[];
  /** Absolute deadline (ms since epoch) for the whole answer. */
  deadline?: number;
  /** Answer only through the AI API: no keyword fallback when no provider is set or every provider fails
   *  (the in-app chat; WhatsApp keeps the offline fallback for poor signal on site). */
  aiOnly?: boolean;
  /** the daily brief's layout, when the host has the reports engine (server and standalone page) */
  reports?: ToolCtx["reports"];
  /** the person behind the conversation: their role and approval limits apply to decisions */
  user?: ToolCtx["user"];
  /** called for every tool the agent uses (the eval runner records them) */
  onTool?: (name: string, input: unknown, result: string) => void;
}
/** Thrown when an AI-only answer cannot be produced: no provider configured, or every provider failed. */
export class AiUnavailable extends Error {
  constructor(message: string, public failed?: RouteInfo["fallbackFrom"]) { super(message); }
}
export interface AgentReply { reply: string; actions: UiAction[]; route: RouteInfo }

export function systemPrompt(repo: Repo, c: AgentContext): string {
  const db = repo.db;
  const focusDoc = c.focus?.docId ? db.docs.find((x) => x.id === c.focus!.docId) : undefined;
  const wa = c.channel === "whatsapp";
  return `You are the Onsite Agent for ${db.project.name} (${db.project.client}), a mixed-use development in Riyadh. You help the Development Manager and site team while they walk the construction site.

You can reach: the document library (drawings, design basis reports, specifications, RFIs, inspections, method statements, minutes), the drawing register (~800 sheets, current revisions), the construction programme (~600 activities, baseline vs forecast, critical path), the regulations/compliance register, safety requirements/permits/incidents, procurement (packages, purchase orders, deliveries, stock, material requests — synced from the purchasing system), quality NCRs, the project directory, and the contractors' emails in the project's Outlook inbox (contractor_emails / get_email — read-only).

Style: the reader is on site, on a phone. Lead with the answer in 1–2 short sentences, then only the details that matter (numbers, dates, revision, status, who). No preamble. ${wa ? "This is WhatsApp: use *bold* sparingly, '•' bullets, no markdown headings, tables or links; keep it under ~900 characters unless asked for detail." : "No markdown tables; at most a short bullet list."}
Always name your source (document title + revision, activity id, PO number, regulation code, sheet number).

Rules:
- When a contractor's email bears on the question (a delay, revised dates, a request), check contractor_emails and say what the email says, who sent it and when — and whether the programme already reflects it.
- Use tools; never guess project facts. If nothing is found, say so plainly. Use search_project when unsure where something lives.
- Dates: today's data date is ${db.data.meta.dataDate}. "Late" means forecast finish after baseline finish; say by how many days.
- Flag safety-critical items first (active permits, open HSE findings, edge protection, lifting, heat stress).
- Regulations: the register paraphrases requirements as applied to this project — when it matters, tell the user to check the official text.
- Notes: when asked to note/log something, call add_note immediately and confirm in one line. "here"/"this" = current focus below.
- Progress from site: when the user reports work done, started, at a %, or still pending ("L14 slab done", "mark as completed", "façade zone 4 pending", a voice note, a photo as evidence), call update_activity straight away — the activity id if you know it, else a description — and confirm in one line what changed in the programme (status, %, finish vs baseline) and how many evidence files are attached. If it returns candidates, ask which one (list them briefly). A message marked [Evidence …] carries document ids of photos just filed: pass them as evidence_doc_ids.
- Photos: every uploaded site photo carries an AI reading in its document text (what it shows, the stage of work, the likely activity, safety/quality issues). Use it; when the user asks about a photo in detail, call get_document to look at the image itself. Treat the suggested activity as a suggestion, never as reported progress.
- Material requests: call create_material_request only when item, quantity, unit and need-by date are known — otherwise ask. Never claim an order was placed; MRs go to procurement for approval.
- Showing things: call open_document / show_on_map so ${wa ? "the file or map image is sent in the chat" : "the phone displays it"}.
- The programme is a Primavera P6 schedule and you are its schedule agent: for when it finishes, whether the programme can be trusted, what changed in the last update, how to recover the contract date or whether P6 matches the site, use schedule_agent; for "what if X slips", schedule_whatif (it tries the change on the logic). Give the numbers (days, dates, float) and say which date you mean — P6's, the logic's, or earned schedule's. Recovery options and putting site progress in P6 are proposals (site_proposals kinds recovery_option, p6_progress): approving queues the change for P6; nothing reaches P6 without a person.
- Proposals: when an answer shows a problem the site orchestrator acts on (a late package, slipping critical work, expired permits, an overdue NCR, low stock, a material request waiting), check site_proposals and end with the matching proposal: what it would do, why, and its cost. Approve or reject only when the user asks you to — never on your own initiative; the tool applies their approval limits (if they may not, say who can). When they reject without a reason, ask for one in a word (not now, already handled, wrong person, too costly, disagree): the orchestrator learns from it.
- Apart from approved proposals, you record information; you do not instruct subcontractors on the manager's behalf.

Current context:
- User: ${c.author}${c.user ? ` — signed in as ${c.user.name}, ${c.user.title} (${c.user.role})` : " — not signed in (can't approve proposals)"}
- Phone position on site: ${c.here ? locationPath(db, c.here.locationId) : "unknown"}
- Viewing document: ${focusDoc ? `${focusDoc.title} (id ${focusDoc.id}, rev ${focusDoc.revision ?? "-"})` : "none"}
- Selected place: ${c.focus?.locationId ? locationPath(db, c.focus.locationId) : "none"}`;
}

export async function runAgent(repo: Repo, history: ChatTurn[], ctx: AgentContext, cfg: LlmConfig): Promise<AgentReply> {
  const toolCtx: ToolCtx = { author: ctx.author, actions: [], focus: { ...ctx.focus }, channel: ctx.channel ?? "web", reports: ctx.reports, fm: ctx.fm, user: ctx.user };
  if (!toolCtx.focus?.locationId && ctx.here) toolCtx.focus = { ...toolCtx.focus, locationId: ctx.here.locationId };
  if (!availableProviders(cfg).length) {
    if (ctx.aiOnly) throw new AiUnavailable("No AI provider is configured — set ANTHROPIC_API_KEY or OPENAI_API_KEY.");
    return offlineAgent(repo, history, toolCtx);
  }
  try {
    const { out, route } = await routeAndRun(cfg, {
      system: ctx.fm ? (await import("../fm/tools")).fmSystemPrompt(repo.db, ctx.fm, ctx.channel ?? "web", ctx.author) : systemPrompt(repo, ctx),
      history: history.slice(-20),
      attachments: ctx.attachments,
      // a facility conversation keeps to the operations tools (and the document library for manuals and photos)
      tools: ctx.fm ? TOOL_DEFS.filter((t) => t.name.startsWith("fm_") || t.name === "search_documents" || t.name === "get_document") : TOOL_DEFS,
      exec: async (name, input) => {
        const r = await runTool(repo, name, input as Record<string, any>, toolCtx);
        ctx.onTool?.(name, input, typeof r === "string" ? r : JSON.stringify(r).slice(0, 4000));
        return r;
      },
      maxTokens: 2000,
      deadline: ctx.deadline,
    });
    return { reply: out.text || "Done.", actions: toolCtx.actions, route };
  } catch (e) {
    if (ctx.aiOnly) { const failed = (e as { failed?: RouteInfo["fallbackFrom"] }).failed; throw new AiUnavailable(`The AI service did not answer (${failed?.map((f) => f.provider).join(", ") || (e as Error).message || "error"}). Try again in a moment.`, failed); }
    // Every provider failed: answer what we can offline so the user isn't stuck on site.
    const off = await offlineAgent(repo, history, toolCtx);
    const failed = (e as { failed?: RouteInfo["fallbackFrom"] }).failed;
    return { ...off, reply: `⚠️ AI providers unavailable (${failed?.map((f) => f.provider).join(", ") || "error"}) — offline answer:\n\n${off.reply}`, route: { ...off.route, fallbackFrom: failed } };
  }
}

// ---------------------------------------------------------------------------
// Offline fallback: keyword intents over the same tools. Works with no key/signal.
// ---------------------------------------------------------------------------
export async function offlineAgent(repo: Repo, history: ChatTurn[], toolCtx: ToolCtx): Promise<AgentReply> {
  const db = repo.db;
  const q = history[history.length - 1]?.content.trim() ?? "";
  const lq = q.toLowerCase();
  const route: RouteInfo = { provider: "offline", model: "keyword", tier: "offline", reason: "no AI provider configured" };
  const T = async (name: string, input: Record<string, unknown>) => JSON.parse(await runTool(repo, name, input, toolCtx) as string);
  const done = (reply: string): AgentReply => ({ reply, actions: toolCtx.actions, route });
  const placeIn = (s: string) => s.match(/\b(?:at|on|in|for)\s+((?:tower|hotel|podium|villa|gate|tc|laydown|batching|rebar|substation|stp|basement|club|mosque|site office|labour|water|ramp)[\w \-]*?)\??$/i)?.[1];

  const nm = q.match(/^(?:add |leave |make |log )?(?:a )?(note|issue|instruction)\b(?: (?:on|to|for|at) ([^:,-]+?))?\s*[:,-]\s*(.+)$/i);
  if (nm) {
    const target = (nm[2] ?? "").trim();
    const input: Record<string, unknown> = { text: nm[3], kind: nm[1].toLowerCase() };
    if (/^(this|here|this drawing|this document)$/i.test(target) || !target) { if (toolCtx.focus?.docId) input.document_id = toolCtx.focus.docId; }
    else input.location = target;
    const r = await T("add_note", input);
    return done(r.saved ? `Saved ${r.note.kind}: “${r.note.text}”` : `Couldn't save: ${r.error}`);
  }
  const po = q.match(/\bPO[- ]?(\d{5,})/i);
  if (po) {
    const r = await T("purchase_orders", { po: `PO-${po[1]}` });
    if (r.error) return done(r.error);
    return done(`${r.po} — ${r.supplier} · ${r.status} · SAR ${r.value.toLocaleString("en")}\n` + r.lines.map((l: any) => `• ${l.item}: ${l.delivered}/${l.qty} ${l.unit}`).join("\n") + (r.deliveries.length ? `\nDeliveries: ${r.deliveries.map((d: any) => `${d.date} ${d.status}`).join(", ")}` : ""));
  }
  if (/\b(deliver(y|ies)|arriving|trucks?)\b/.test(lq)) {
    const r = await T("deliveries", { location: placeIn(q) });
    return done(r.count ? `${r.count} deliveries ${r.window}:\n` + r.deliveries.slice(0, 10).map((d: any) => `• ${d.date} ${d.slot} — ${d.items} (${d.supplier}) → ${d.location} [${d.status}]`).join("\n") : `No deliveries ${r.window}.`);
  }
  if (/\b(look ?ahead|next (two|2|three|3) weeks|this week|next week)\b/.test(lq)) {
    const r = await T("lookahead", { weeks: /three|3/.test(lq) ? 3 : 2, location: placeIn(q) });
    return done(`Look-ahead ${r.window}: ${r.counts.starting} starting, ${r.counts.finishing} finishing, ${r.counts.deliveries} deliveries.\n` +
      [...r.milestones, ...r.starting].slice(0, 8).map((a: any) => `• ${a.start} ${a.name}${a.critical ? " (critical)" : ""}`).join("\n"));
  }
  if (/\b(behind|late|delay(ed)?|slipp?(ing|age)|critical path|programme|schedule|progress)\b/.test(lq)) {
    const place = placeIn(q);
    if (place || /\b(late|behind|delay)/.test(lq)) {
      const r = await T("schedule_query", { location: place, late: true, limit: 8 });
      if (!r.error) return done(r.count ? `${r.count} activities late${r.location ? ` at ${r.location}` : ""} (data date ${r.dataDate}):\n` + r.activities.map((a: any) => `• ${a.id} ${a.name}: +${a.slipDays} d (forecast ${a.finish})`).join("\n") : "Nothing late there.");
    }
    const s = await T("schedule_summary", {});
    return done(`Progress ${s.progressPercent}% vs ${s.plannedPercent}% planned (SPI ${s.spi}). Completion forecast ${s.practicalCompletion?.forecast} vs ${s.practicalCompletion?.baseline}.\nNext milestones:\n` + s.upcomingMilestones.slice(0, 5).map((m: any) => `• ${m.forecast} ${m.name} (${m.varianceDays >= 0 ? "+" : ""}${m.varianceDays} d)`).join("\n"));
  }
  if (/\b(ppe|safety|permit|hazard|risk assessment|hot work|harness|edge protection)\b/.test(lq)) {
    if (/\bpermits?\b/.test(lq) && /\b(active|today|open|current)\b/.test(lq)) {
      const r = await T("permits", { status: "Active", location: placeIn(q) });
      return done(`${r.count} active permits:\n` + r.permits.map((p: any) => `• ${p.id} ${p.type} — ${p.location}: ${p.description}`).join("\n"));
    }
    const r = await T("safety_requirements", { location: placeIn(q), query: q });
    return done((r.requirements.slice(0, 5).map((x: any) => `• ${x.topic}: ${x.requirement}`).join("\n") || "No specific rules found.") + (r.ppeRequired.length ? `\nPPE: ${r.ppeRequired.join(", ")}` : "") + (r.permitsRequired.length ? `\nPermits: ${r.permitsRequired.join(", ")}` : ""));
  }
  if (/\b(sbc|code|regulation|civil defen[cs]e|compliance|momrah|gaca|ministry)\b/.test(lq)) {
    const r = await T("search_regulations", { query: q.replace(/\b(what|does|the|say|about|regulation|code|requirements?)\b/gi, " ") });
    return done(r.count ? r.regulations.slice(0, 4).map((x: any) => `• ${x.code} — ${x.title} [${x.status}]: ${x.requirement.slice(0, 220)}`).join("\n") + "\n(Verify against the official text.)" : "No matching regulation in the register.");
  }
  if (/\b(who is|who's|contact|phone|call)\b/.test(lq)) {
    const r = await T("find_contact", { query: q.replace(/\b(who is|who's|the|contact|phone|number|for|call)\b/gi, " ") });
    return done(r.contacts.length ? r.contacts.slice(0, 4).map((c: any) => `• ${c.name} — ${c.role}, ${c.company}: ${c.phone}`).join("\n") : "No contact found.");
  }
  const wantsDoc = /\b(drawings?|documents?|docs?|rfis?|specs?|specifications?|inspections?|permits?|minutes|submittals?|snags?|variations?|plans?|sections?)\b/.test(lq);
  if (/^(show|where is|where's|locate|take me to|go to)\b/.test(lq) && !wantsDoc) {
    const place = q.replace(/^(show( me)?|where is|where's|locate|take me to|go to)\s+(the\s+)?/i, "");
    const l = resolveLocation(db, place);
    if (l) { toolCtx.actions.push({ type: "focus_location", locationId: l.id }); return done(`Showing ${locationPath(db, l.id)} on the map.`); }
  }
  if (/\b(open issues|open notes|issues|outstanding)\b/.test(lq)) {
    const r = await T("list_notes", { status: "open", location: q.match(/\b(?:at|on|for|in)\s+(.+?)\??$/i)?.[1] });
    if (!r.error) return done(r.count ? `${r.count} open:\n` + r.notes.map((n: any) => `• [${n.kind}] ${n.text}`).join("\n") : "Nothing open there.");
  }
  const ov = lq.match(/^(?:what(?:'s| is) (?:at|in|on|here at)|overview of|status (?:of|at)|what do i need to know about)\s+(.+?)\??$/);
  if (ov) {
    const r = await T("get_location_overview", { location: ov[1] });
    if (!r.error) return done(`${r.location.path}: ${r.documentCount} documents, ${r.openNotes.length} open notes, ${r.activitiesInProgress.length} activities in progress, ${r.activePermits.length} active permits.\n` +
      r.activitiesInProgress.slice(0, 4).map((a: any) => `• ${a.name} — ${a.percent}%`).join("\n"));
  }
  const cat = /\brfis?\b/.test(lq) ? "RFI" : /\bdrawings?\b/.test(lq) ? "Drawing" : /\binspections?\b/.test(lq) ? "Inspection" : /\bspecs?\b|specification/.test(lq) ? "Specification" : undefined;
  const place = placeIn(q);
  const loc = place ? resolveLocation(db, place) : undefined;
  const query = q.replace(/\b(show|open|find|me|the|latest|all|any|documents?|drawings?|rfis?|inspections?|for|at|on|in|of|what|is|are|about|spec|specs)\b/gi, " ").trim();
  let found = searchDocs(db, { query: loc ? "" : query, category: cat, locationId: loc?.id });
  if (!found.length && query) found = searchDocs(db, { query });
  if (found.length) {
    const top = found[0];
    if (/^(show|open|pull up|display)\b/.test(lq) || found.length === 1) toolCtx.actions.push({ type: "open_doc", docId: top.id });
    return done(`${found.length} match${found.length > 1 ? "es" : ""} — top: ${top.title}${top.revision ? ` (rev ${top.revision})` : ""}.\n${top.summary}\n` + found.slice(1, 5).map((d) => `• ${d.title}`).join("\n") + "\n\n(Offline assistant — add an AI key for full answers.)");
  }
  const s = P.searchProject(db, q, 6);
  if (s.hits.length) return done("Closest matches:\n" + s.hits.map((h) => `• [${h.type}] ${h.title} — ${h.detail}`).join("\n"));
  return done("I couldn't find that. Try a place (“Tower A level 12”), a PO number, “deliveries this week”, “what's late”, or keywords.");
}
