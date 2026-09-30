import Anthropic from "@anthropic-ai/sdk";
import { db, locationPath, resolveLocation, searchDocs } from "./store";
import { TOOL_DEFS, runTool, type ToolCtx } from "./tools";
import type { UiAction } from "./types";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

export interface ChatMsg { role: "user" | "assistant"; content: string }
export interface AgentContext {
  author: string;
  focus?: { docId?: string; locationId?: string };
  /** Nearest named place to the phone's GPS fix, if any. */
  here?: { locationId: string };
}
export interface AgentReply { reply: string; actions: UiAction[]; mode: "claude" | "offline" }

function systemPrompt(c: AgentContext) {
  const d = db();
  const focusDoc = c.focus?.docId ? d.docs.find((x) => x.id === c.focus!.docId) : undefined;
  const focusLoc = c.focus?.locationId ? locationPath(c.focus.locationId) : undefined;
  const here = c.here ? locationPath(c.here.locationId) : undefined;
  return `You are the Site Agent for ${d.project.name} (${d.project.client}), speaking with the Development Manager while they walk the construction site on their phone.

Style: the reader is standing in the sun, reading a small screen, often hands-busy. Lead with the answer in one or two short sentences, then only the details that matter (numbers, revision, status, who/when). No preamble, no markdown tables, at most a short bullet list. Always name the document (title + revision) you relied on so they can trust it.

Rules:
- Use tools — never guess project facts. If search finds nothing, say so plainly and suggest what might exist.
- If documents disagree (different revisions, open RFIs against a drawing), call it out.
- When asked to leave a note, call add_note straight away, then confirm in one line what was saved and where. Clean up dictation but do not add facts. When the user says "this"/"here", use the current focus below.
- When asked to show a drawing or a place, call open_document / show_on_map so the phone displays it, and say what you opened.
- Flag anything safety-related (open permits, HSE findings, edge protection) prominently.
- You cannot approve, reject, or instruct subcontractors on the manager's behalf; you record notes and instructions for the team.

Current context:
- Project date: ${new Date().toISOString().slice(0, 10)}
- Manager's GPS position on site: ${here ?? "unknown"}
- Currently viewing document: ${focusDoc ? `${focusDoc.title} (id ${focusDoc.id}, rev ${focusDoc.revision ?? "-"})` : "none"}
- Currently selected place: ${focusLoc ?? "none"}`;
}

export async function runAgent(history: ChatMsg[], ctx: AgentContext): Promise<AgentReply> {
  if (!process.env.ANTHROPIC_API_KEY) return offlineAgent(history, ctx);
  const client = new Anthropic();
  const toolCtx: ToolCtx = { author: ctx.author, actions: [], focus: ctx.focus };
  if (!toolCtx.focus?.locationId && ctx.here) toolCtx.focus = { ...toolCtx.focus, locationId: ctx.here.locationId };
  const messages: Anthropic.MessageParam[] = history.slice(-20).map((m) => ({ role: m.role, content: m.content }));

  for (let turn = 0; turn < 10; turn++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: systemPrompt(ctx),
      tools: TOOL_DEFS as unknown as Anthropic.Tool[],
      messages,
    });
    if (res.stop_reason !== "tool_use") {
      const reply = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
      return { reply: reply || "Done.", actions: toolCtx.actions, mode: "claude" };
    }
    messages.push({ role: "assistant", content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const b of res.content) {
      if (b.type !== "tool_use") continue;
      const out = runTool(b.name, (b.input ?? {}) as Record<string, unknown>, toolCtx);
      results.push({ type: "tool_result", tool_use_id: b.id, content: out as Anthropic.ToolResultBlockParam["content"] });
    }
    messages.push({ role: "user", content: results });
  }
  return { reply: "That took too many steps — try a narrower question.", actions: toolCtx.actions, mode: "claude" };
}

// ---------------------------------------------------------------------------
// Offline fallback: same tools, simple intent rules. Lets the app work without
// an API key (demo / no signal) — far less capable than the Claude agent.
// ---------------------------------------------------------------------------
function offlineAgent(history: ChatMsg[], ctx: AgentContext): AgentReply {
  const q = history[history.length - 1]?.content.trim() ?? "";
  const lq = q.toLowerCase();
  const toolCtx: ToolCtx = { author: ctx.author, actions: [], focus: ctx.focus ?? (ctx.here ? { locationId: ctx.here.locationId } : undefined) };
  const parse = (s: string) => JSON.parse(runTool(s.split("|")[0], JSON.parse(s.split("|").slice(1).join("|")), toolCtx) as string);
  const done = (reply: string): AgentReply => ({ reply, actions: toolCtx.actions, mode: "offline" });

  // "note ... : text" / "add note to <place|this>: text"
  const nm = q.match(/^(?:add |leave |make |log )?(?:a )?(note|issue|instruction)\b(?: (?:on|to|for|at) ([^:,-]+?))?\s*[:,-]\s*(.+)$/i);
  if (nm) {
    const target = (nm[2] ?? "").trim();
    const input: Record<string, unknown> = { text: nm[3], kind: nm[1].toLowerCase() };
    if (/^(this|here|this drawing|this document)$/i.test(target) || !target) {
      if (ctx.focus?.docId) input.document_id = ctx.focus.docId;
    } else input.location = target;
    const r = parse(`add_note|${JSON.stringify(input)}`);
    return done(r.saved ? `Saved ${r.note.kind}: “${r.note.text}”` : `Couldn't save: ${r.error}`);
  }
  const wantsDoc = /\b(drawings?|documents?|docs?|rfis?|specs?|specifications?|inspections?|permits?|minutes|submittals?|snags?|variations?|plans?|sections?)\b/.test(lq);
  if (/^(show|where is|where's|locate|take me to|go to)\b/.test(lq) && !wantsDoc) {
    const place = q.replace(/^(show( me)?|where is|where's|locate|take me to|go to)\s+(the\s+)?/i, "");
    const l = resolveLocation(place);
    if (l) { toolCtx.actions.push({ type: "focus_location", locationId: l.id }); return done(`Showing ${locationPath(l.id)} on the map.`); }
  }
  if (/\b(open issues|open notes|issues|outstanding)\b/.test(lq)) {
    const place = q.match(/\b(?:at|on|for|in)\s+(.+?)\??$/i)?.[1];
    const r = parse(`list_notes|${JSON.stringify({ status: "open", location: place })}`);
    if (!r.error) return done(r.count ? `${r.count} open:\n` + r.notes.map((n: any) => `• [${n.kind}] ${n.text}`).join("\n") : "Nothing open there.");
  }
  const ov = lq.match(/^(?:what(?:'s| is) (?:at|in|on|here at)|overview of|status (?:of|at)|what do i need to know about)\s+(.+?)\??$/);
  if (ov) {
    const r = parse(`get_location_overview|${JSON.stringify({ location: ov[1] })}`);
    if (!r.error) return done(`${r.location.path}: ${r.documents.length} documents, ${r.openNotes.length} open notes.\n` +
      r.documents.slice(0, 6).map((d: any) => `• ${d.title}`).join("\n"));
  }
  const cat = /\brfis?\b/.test(lq) ? "RFI" : /\bdrawings?\b/.test(lq) ? "Drawing" : /\binspections?\b/.test(lq) ? "Inspection" : undefined;
  const place = q.match(/\b(?:at|on|in|for)\s+((?:tower|hotel|podium|villa|gate|tc|laydown|batching|rebar|substation|stp|basement|club)[\w \-]*?)\??$/i)?.[1];
  const loc = place ? resolveLocation(place) : undefined;
  const query = q.replace(/\b(show|open|find|me|the|latest|all|any|documents?|drawings?|rfis?|inspections?|for|at|on|in|of|what|is|are|about)\b/gi, " ").trim();
  let found = searchDocs({ query: loc ? "" : query, category: cat, locationId: loc?.id });
  if (!found.length && query) found = searchDocs({ query });
  if (!found.length) return done("I couldn't find a matching document. Try a place (“Tower A level 12”) or keywords (“slab thickness”).");
  const top = found[0];
  if (/^(show|open|pull up|display)\b/.test(lq) || found.length === 1) toolCtx.actions.push({ type: "open_doc", docId: top.id });
  return done(
    `${found.length} match${found.length > 1 ? "es" : ""} — top: ${top.title}${top.revision ? ` (rev ${top.revision})` : ""}.\n${top.summary}\n` +
      found.slice(1, 5).map((d) => `• ${d.title}`).join("\n") +
      "\n\n(Offline assistant — add ANTHROPIC_API_KEY for full answers.)",
  );
}
