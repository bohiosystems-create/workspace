import crypto from "node:crypto";
import type { Db, Doc, UiAction } from "../types";
import { CATEGORIES } from "../types";
import { agentBudgetMs, runAgent } from "../agent";
import { describeUpload } from "../ingest";
import { renderDrawing } from "../drawings";
import { gpsToPlan, PLAN } from "../siteplan";
import { locationPath, resolveLocation } from "../core/query";
import { speechToText } from "../core/stt";
import { runTool, toBase64 } from "../core/tools";
import { serverLlm } from "../llmConfig";
import { getRepo, newId, readBytes, readUpload, removeKey, saveUpload, writeBytes, writeJson } from "../store";
import { getMedia, markRead, sendDocument, sendImage, sendList, sendText, uploadMedia, waConfig, type WaConfig } from "./graph";
import { readGenerated } from "../generated";
import { runSpecAgent } from "../core/specAgent";
import { allowed, firstTime, loadSession, saveSession, type WaSession } from "./sessions";
import { planSvg, svgToPng } from "./render";

/** Verify Meta's X-Hub-Signature-256 over the raw body. */
export function signatureOk(raw: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return (process.env.WHATSAPP_SKIP_SIGNATURE ?? "").toLowerCase() === "true";
  if (!header?.startsWith("sha256=")) return false;
  const want = crypto.createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  const a = Buffer.from(header.slice(7)), b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const HELP = `*Kinan Onsite Agent* — ask anything about the project, e.g.
• _Slab thickness on Tower A level 12?_
• _What's late on Tower A?_ / _Look-ahead next 2 weeks_
• _Deliveries today_ / _Status of PO-4500123_
• _PPE and permits for hot work at the podium_
• _What does SBC 801 require for refuge floors?_
• _Show me the Tower A L12 slab drawing_ / _Where is TC1?_
• _Note: edge protection missing L31 east_ (or _issue: …_)
• _Order 20 t rebar Ø16 for Tower A L14 by 10 Oct_

📍 Share your *location* and I'll know where you are.
✅ Report progress: _Tower A L14 slab — done_ / _L31 façade zone 4 at 60%_ / _lift 2 pending_. The project schedule is updated straight away.
📷 Send a *photo or PDF* as evidence — caption it with the task (_L14 slab done_) or tell me afterwards. It's filed to the activity's place. Put a question in the caption to get it analysed instead.
🎙 Voice notes work for everything above.
Commands: *projects* (switch project), *help*, *where am I*, *here <place>*, *reset*`;

// Serialise processing per sender so replies stay in order.
const queues = new Map<string, Promise<void>>();
function enqueue(key: string, job: () => Promise<void>) {
  const prev = queues.get(key) ?? Promise.resolve();
  const next = prev.then(job, job).catch((e) => console.error("[whatsapp]", e));
  queues.set(key, next);
  next.finally(() => { if (queues.get(key) === next) queues.delete(key); });
  return next;
}

/** Entry point for the webhook body. Returns promises so tests can await them. */
export function handleWebhook(body: any): Promise<void>[] {
  const c = waConfig();
  const jobs: Promise<void>[] = [];
  if (!c) { console.warn("[whatsapp] WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID not set"); return jobs; }
  for (const entry of body?.entry ?? []) for (const ch of entry?.changes ?? []) {
    const v = ch?.value;
    if (!v?.messages) continue; // delivery/read statuses
    const names: Record<string, string> = Object.fromEntries((v.contacts ?? []).map((k: any) => [k.wa_id, k.profile?.name ?? ""]));
    for (const m of v.messages) {
      if (!m?.id || !m.from) continue;
      jobs.push(enqueue(m.from, () => handleMessage(c, m, names[m.from] ?? "")));
    }
  }
  return jobs;
}

// ---------------------------------------------------------------- which project the conversation is about
const LIVE = "kinan-heights";
interface ProjectChoice { id: string; title: string; description: string }
async function projectChoices(): Promise<ProjectChoice[]> {
  const db = (await getRepo()).db;
  const live: ProjectChoice = { id: LIVE, title: db.project.name, description: `Live site · ${db.project.code} · programme, procurement, safety, documents` };
  const gen = (await readGenerated()).projects.slice(0, 9).map((p) => {
    const sp = p.result.spec;
    return { id: p.id, title: sp.name, description: `${sp.buildings.length} buildings · ${sp.schedule.start.slice(0, 7)} → ${sp.schedule.finish.slice(0, 7)}${sp.location ? ` · ${sp.location}` : ""}` };
  });
  return [live, ...gen];
}
async function projectName(id?: string) { return id ? (await projectChoices()).find((p) => p.id === id)?.title : undefined; }

/** "Which project do you want to talk about?" as a tappable list (numbered text if the list can't be sent). */
async function askProject(c: WaConfig, from: string, s: WaSession, intro?: string) {
  const list = await projectChoices();
  const cur = await projectName(s.projectId);
  const body = `${intro ? intro + "\n\n" : ""}Which project do you want to talk about?${cur ? `\nNow: *${cur}*` : ""}`;
  try {
    await sendList(c, from, { header: "Kinan Onsite Agent", body, footer: "Type *projects* any time to switch", button: "Choose project", section: "Projects", rows: list.map((p) => ({ id: `proj:${p.id}`, title: p.title, description: p.description })) });
  } catch (e) {
    console.warn("[whatsapp] list message failed, sending text", e);
    await sendText(c, from, `${body}\n\n${list.map((p, i) => `*${i + 1}.* ${p.title} — ${p.description}`).join("\n")}\n\nReply with the number.`);
  }
}
async function pickProject(c: WaConfig, from: string, s: WaSession, id: string, msgId?: string) {
  const list = await projectChoices();
  const p = list.find((x) => x.id === id);
  if (!p) return askProject(c, from, s, "That project is no longer available.");
  if (s.projectId !== p.id) { s.history = []; s.focusDocId = undefined; }
  s.projectId = p.id;
  const q = s.queued; s.queued = undefined;
  await sendText(c, from, `✅ *${p.title}*. ${q ? "Answering your question…" : p.id === LIVE ? "Ask anything about the site — type *help* for examples." : "Ask about its buildings, programme, critical path and progress."}`);
  if (q) await ask(c, from, s, q, undefined, msgId);
}

/** Last WhatsApp activity, readable at /api/whatsapp/health — so a silent failure (expired token, storage) can be seen. */
async function noteStatus(ok: boolean, what: string, err?: unknown) {
  const msg = err instanceof Error ? err.message : err ? String(err) : undefined;
  if (!ok) console.error("[whatsapp]", what, err);
  await writeJson("whatsapp/status.json", { at: new Date().toISOString(), ok, what, ...(msg ? { error: msg.slice(0, 400) } : {}) }).catch(() => undefined);
}

async function handleMessage(c: WaConfig, m: any, profileName: string) {
  try {
    if (await handleMessageInner(c, m, profileName)) await noteStatus(true, `message ${m.type}`);
  } catch (e) {
    // anything outside the reply path (session storage, read receipt, the token itself): record it, try to tell the sender
    await noteStatus(false, `message ${m.type}`, e);
    await sendText(c, m.from, `Sorry — I couldn't process that message (${e instanceof Error ? e.message.slice(0, 160) : "error"}). Please send it again.`).catch(() => undefined);
  }
}

async function handleMessageInner(c: WaConfig, m: any, profileName: string): Promise<boolean> {
  const from: string = m.from;
  const acl = allowed(from);
  if (!acl.ok) {
    console.warn(`[whatsapp] rejected message from unlisted number ${from}`);
    await sendText(c, from, "This number isn't authorised for the Kinan Onsite Agent. Ask the project admin to add you.");
    return true;
  }
  const s = await loadSession(from, acl.name || profileName || "Site user");
  if (!firstTime(s, m.id)) return true; // duplicate delivery
  await saveSession(from, s);      // record the id early so a retry on another instance is skipped
  await markRead(c, m.id).catch((e) => console.warn("[whatsapp] read receipt failed", e)); // never block the reply on it
  try {
    switch (m.type) {
      case "text": await onText(c, from, s, String(m.text?.body ?? ""), m.id); break;
      case "audio": await onAudio(c, from, s, m); break;
      case "image": case "document": await onMedia(c, from, s, m); break;
      case "location": await onLocation(c, from, s, m.location); break;
      case "interactive": {
        const id = String(m.interactive?.list_reply?.id ?? m.interactive?.button_reply?.id ?? "");
        if (id.startsWith("proj:")) await pickProject(c, from, s, id.slice(5), m.id);
        else await onText(c, from, s, String(m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? ""), m.id);
        break;
      }
      default: await sendText(c, from, "I can read text, voice notes, photos, PDFs and shared locations. Type *help* for examples.");
    }
  } catch (e) {
    await noteStatus(false, `handling ${m.type}`, e);
    await sendText(c, from, `Sorry — something went wrong: ${e instanceof Error ? e.message.slice(0, 200) : "error"}`).catch(() => undefined);
    return false;
  } finally {
    await saveSession(from, s).catch((e) => console.error("[whatsapp] session save", e));
  }
  return true;
}

async function onText(c: WaConfig, from: string, s: WaSession, text: string, msgId?: string) {
  const t = text.trim();
  const lt = t.toLowerCase();
  const db = (await getRepo()).db;
  if (!t) return;
  if (/^(help|\?)$/i.test(t)) return sendText(c, from, HELP);
  // opening the chat: a greeting, "projects", or the first message of a new conversation → choose the project
  if (/^(menu|start|hi|hello|hey|salam|السلام عليكم|مرحبا|projects?|switch( project)?|change project)[.!]?$/i.test(t)) { s.queued = undefined; return askProject(c, from, s); }
  if (!s.projectId || s.fresh) {
    // a reply to the numbered fallback list
    const list = await projectChoices();
    const n = Number(t);
    if (!s.projectId && Number.isInteger(n) && n >= 1 && n <= list.length) return pickProject(c, from, s, list[n - 1].id, msgId);
    const byName = list.find((p) => p.title.toLowerCase() === lt);
    if (byName) return pickProject(c, from, s, byName.id, msgId);
    s.queued = t; s.projectId = undefined;
    return askProject(c, from, s, `Hi ${s.name.split(" ")[0]} 👋`);
  }
  if (/^(reset|clear|new chat)$/i.test(t)) { if (s.pending) await removeKey(s.pending.key); s.history = []; s.focusDocId = undefined; s.pending = undefined; return sendText(c, from, "Conversation cleared."); }
  if (/^where am i\??$/i.test(t)) return sendText(c, from, s.here ? `📍 ${locationPath(db, s.here.locationId)} (from ${s.here.source}, ${new Date(s.here.at).toISOString().slice(11, 16)} UTC)` : "I don't know yet — share your location 📍 or type *here Tower A L12*.");
  // "here Tower A L12" / "I'm at gate 2" — short statements only, never questions.
  const hm = t.match(/^(?:here|i'?m at|i am at|i'?m in|i am in)\s+(.+)$/i);
  if (hm && !s.pending && !t.includes("?") && t.split(/\s+/).length <= 7) {
    const l = resolveLocation(db, hm[1]);
    if (!l) return sendText(c, from, `I couldn't find "${hm[1]}" on the site plan.`);
    s.here = { locationId: l.id, at: new Date().toISOString(), source: "text" };
    return sendText(c, from, `📍 Got it — ${locationPath(db, l.id)}. Questions and photos will default to this place.`);
  }
  // Photos just filed: the next message says what they're evidence of (or where they belong)
  if (s.evidence && Date.now() - Date.parse(s.evidence.at) > 30 * 60_000) s.evidence = undefined;
  if (s.evidence && !s.pending) {
    const sug = s.evidence.suggest;
    const yes = /^(yes|yep|yeah|y|ok|okay|correct|confirm|right|exactly|نعم|صح|تمام)[.!]?$/i.test(t);
    const st = /^(done|completed?|finished)[.!]?$/i.test(t) ? "completed" : /^(pending|blocked|not done)[.!]?$/i.test(t) ? "pending" : /^\d{1,3}\s*%$/.test(t) ? "in_progress" : null;
    if (sug && (yes || st)) {
      const pct = st === "in_progress" ? Number(t.replace(/\D/g, "")) : st ? undefined : sug.percent;
      const r = await runTool(await getRepo(), "update_activity", { activity: sug.activityId, state: st ?? sug.state, percent: pct, note: `Confirmed from a WhatsApp photo${st ? ` (${t})` : ""}`, evidence_doc_ids: s.evidence.docIds },
        { author: s.name, actions: [], channel: "whatsapp", focus: {} });
      const j = JSON.parse(typeof r === "string" ? r : String((r[0] as { text?: string }).text ?? "{}"));
      if (j.error) return sendText(c, from, `Couldn't update it: ${j.error}`);
      s.evidence = undefined;
      const u = j.updated, slip = Math.round((Date.parse(u.now.finish) - Date.parse(u.now.baselineFinish)) / 86400000);
      return sendText(c, from, `✅ *${u.name}* (${u.id}) → ${u.now.status === "completed" ? "completed" : `${u.now.percent}%`}${u.now.status === "completed" ? `, finished ${u.now.finish}` : `, forecast finish ${u.now.finish}`} (${slip > 0 ? `${slip} d after` : slip < 0 ? `${-slip} d before` : "on"} baseline). ${u.evidence} photo${u.evidence === 1 ? "" : "s"} attached as evidence.`, msgId);
    }
    if (/^log (the )?safety( issue)?[.!]?$/i.test(t)) {
      const repo = await getRepo();
      const ds = s.evidence.docIds.map((id) => repo.db.docs.find((d) => d.id === id)).filter((d) => d?.photo?.safety.length);
      if (!ds.length) return sendText(c, from, "The photo reader didn't flag a safety issue in those photos. Describe it and I'll log it, e.g. _issue: no edge protection L31 east_.");
      for (const d of ds) await runTool(repo, "add_note", { text: `Safety (from photo): ${d!.photo!.safety.join("; ")}`, kind: "issue", document_id: d!.id }, { author: s.name, actions: [], channel: "whatsapp", focus: { locationId: d!.locationId } });
      return sendText(c, from, `⚠️ Logged ${ds.length > 1 ? `${ds.length} safety issues` : "the safety issue"} at ${locationPath(repo.db, ds[0]!.locationId)}. It shows in the open issues and the next daily brief.`);
    }
    const placeOnly = t.split(/\s+/).length <= 5 && !/[?]|\b(done|complete|completed|finished|pending|started|progress|%|blocked|waiting)\b/i.test(t) && !/^(what|why|how|when|who|is|are|any|show|where)\b/i.test(t);
    const l = placeOnly ? resolveLocation(db, t.replace(/^(upload|file|save|attach|put|move)( it| them)?( to| at| in| on)?\s*/i, "")) : undefined;
    if (l) {
      const repo = await getRepo();
      for (const id of s.evidence.docIds) { const d = repo.db.docs.find((x) => x.id === id); if (d) d.locationId = l.id; }
      await repo.save();
      const n = s.evidence.docIds.length;
      return sendText(c, from, `📍 Moved ${n > 1 ? `${n} files` : "it"} to ${locationPath(db, l.id)}. If ${n > 1 ? "they show" : "it shows"} a task done or pending, just tell me which.`);
    }
    return askWithEvidence(c, from, s, t, msgId);
  }
  // A filing instruction for a photo/PDF we're holding: an explicit command, or a short reply that is just a place.
  if (s.pending && Date.now() - Date.parse(s.pending.at) > 30 * 60_000) { await removeKey(s.pending.key); s.pending = undefined; }
  if (s.pending) {
    if (/^(cancel|no|discard)$/i.test(t)) { await removeKey(s.pending.key); s.pending = undefined; return sendText(c, from, "Discarded."); }
    const command = /^(upload|file|save|attach|put)\b/i.test(lt);
    const bare = /^(save|upload|file|yes|ok|here)( it)?( here)?$/i.test(t);
    const placeOnly = !command && !bare && t.split(/\s+/).length <= 5 && !/[?]|^(what|why|how|when|who|is|are|any|show|where)\b/i.test(t);
    if (bare) {
      if (s.here) return fileMedia(c, from, s, s.here.locationId);
      return sendText(c, from, "Where should I file it? Reply with a place or share your 📍 location.");
    }
    if (command || placeOnly) {
      const target = t.replace(/^(upload|file|save|attach|put)( it)?( to| at| in| on)?\s*/i, "");
      const l = resolveLocation(db, target);
      if (l) return fileMedia(c, from, s, l.id);
      if (command) return sendText(c, from, `I couldn't match "${target}" to a place. Try e.g. "Tower A L12", "Laydown 2", "Gate 2".`);
    }
  }
  await ask(c, from, s, t, undefined, msgId);
}

async function ask(c: WaConfig, from: string, s: WaSession, text: string, attachment?: { mime: string; bytes: Uint8Array; name: string }, msgId?: string) {
  s.history.push({ role: "user", content: text });
  if (s.projectId && s.projectId !== LIVE) {
    // a project created from documents: answered from its model spec
    const gp = (await readGenerated()).projects.find((p) => p.id === s.projectId);
    if (!gp) { s.history.pop(); s.projectId = undefined; s.queued = text; return askProject(c, from, s, "That project is no longer available."); }
    const out = await runSpecAgent(gp.result.spec, s.history.slice(-16), { author: s.name, channel: "whatsapp", deadline: Date.now() + Math.min(agentBudgetMs(), process.env.VERCEL ? 38_000 : 110_000) }, serverLlm());
    s.history.push({ role: "assistant", content: out.reply });
    s.history = s.history.slice(-24);
    return sendText(c, from, out.reply, msgId);
  }
  const out = await runAgent(s.history.slice(-16), {
    author: s.name, channel: "whatsapp",
    // Leave time inside the function limit to render and send images afterwards.
    deadline: Date.now() + Math.min(agentBudgetMs(), process.env.VERCEL ? 38_000 : 110_000),
    focus: { docId: s.focusDocId, locationId: s.here?.locationId },
    here: s.here ? { locationId: s.here.locationId } : undefined,
    attachments: attachment ? [{ mime: attachment.mime, base64: toBase64(attachment.bytes), name: attachment.name }] : undefined,
  });
  s.history.push({ role: "assistant", content: out.reply });
  s.history = s.history.slice(-24);
  const via = (process.env.WHATSAPP_SHOW_MODEL ?? "false") === "true" ? `\n\n_${out.route.provider} · ${out.route.model} · ${out.route.tier}_` : "";
  await sendText(c, from, out.reply + via, msgId);
  await deliverActions(c, from, s, out.actions);
}

async function deliverActions(c: WaConfig, from: string, s: WaSession, actions: UiAction[]) {
  const db = (await getRepo()).db;
  for (const a of actions.slice(0, 3)) {
    if (a.type === "open_doc") {
      const d = db.docs.find((x) => x.id === a.docId);
      if (d) { s.focusDocId = d.id; await sendDoc(c, from, d); }
    } else {
      const png = await svgToPng(planSvg(db, a.locationId, locationPath(db, a.locationId)), 1600);
      if (png) await sendImage(c, from, await uploadMedia(c, png, "image/png", "site-map.png"), `📍 ${locationPath(db, a.locationId)}`);
    }
  }
}

async function sendDoc(c: WaConfig, to: string, d: Doc) {
  const cap = `${d.title}${d.revision ? ` · Rev ${d.revision}` : ""}`;
  if (d.generated) {
    const png = await svgToPng(renderDrawing(d.generated.kind, d.generated.label, d.revision), 2400);
    if (png) return sendImage(c, to, await uploadMedia(c, png, "image/png", `${d.id}.png`), cap);
  }
  const bytes = await readUpload(d);
  if (!bytes) return sendText(c, to, `📄 *${cap}*\n\n${(d.text || d.summary).slice(0, 3000)}`);
  if (d.mime === "image/jpeg" || d.mime === "image/png") return sendImage(c, to, await uploadMedia(c, bytes, d.mime, d.filename), cap);
  return sendDocument(c, to, await uploadMedia(c, bytes, d.mime, d.filename), d.filename, cap);
}

/** Ask the agent with the photos just filed attached as evidence; clear them once an update used them. */
async function askWithEvidence(c: WaConfig, from: string, s: WaSession, text: string, msgId?: string) {
  const ev = s.evidence!;
  const docs = (await getRepo()).db.docs;
  const readings = ev.docIds.map((id) => docs.find((d) => d.id === id)).filter((d) => d?.photo).map((d) => `${d!.id}: ${d!.text.replace(/\n/g, " · ")}`);
  await ask(c, from, s, `${text}\n\n[Evidence: ${ev.docIds.length} photo/file(s) just sent on WhatsApp and filed as documents ${ev.docIds.join(", ")}. If this message reports progress or a pending item on an activity, call update_activity with evidence_doc_ids=${JSON.stringify(ev.docIds)}.${readings.length ? ` What the photo reader saw — ${readings.join(" | ")}. If that contradicts what the user says (e.g. "done" but the photo shows work still open), record what the user reported and point out the difference in one line.` : ""}]`, undefined, msgId);
  const used = ((await getRepo()).db.data.updates ?? []).some((u) => u.evidence.some((id) => ev.docIds.includes(id)));
  if (used) s.evidence = undefined;
}

async function onAudio(c: WaConfig, from: string, s: WaSession, m: any) {
  const { bytes, mime } = await getMedia(c, m.audio.id);
  let text: string;
  try { text = (await speechToText(serverLlm(), bytes, mime, mime.includes("ogg") ? "voice.ogg" : mime.includes("mpeg") ? "voice.mp3" : "voice.m4a")).text; }
  catch (e) { return sendText(c, from, `🎙 I couldn't transcribe that: ${e instanceof Error ? e.message : e}`); }
  if (!text) return sendText(c, from, "🎙 I couldn't hear anything in that voice note.");
  await sendText(c, from, `🎙 _“${text}”_`);
  await onText(c, from, s, text, m.id);
}

async function onLocation(c: WaConfig, from: string, s: WaSession, loc: { latitude: number; longitude: number; name?: string }) {
  if (s.projectId && s.projectId !== LIVE) return sendText(c, from, `Locations work on ${(await getRepo()).db.project.name}'s site plan. Type *projects* and choose it first.`);
  const db = (await getRepo()).db;
  const p = gpsToPlan(Number(loc.latitude), Number(loc.longitude));
  if (p.x < -100 || p.y < -100 || p.x > PLAN.w + 100 || p.y > PLAN.h + 100)
    return sendText(c, from, "📍 That location is outside the Kinan Heights site boundary. Type *here <place>* to set it manually.");
  const near = db.locations.filter((l) => !["level", "site", "zone", "road"].includes(l.type) && l.x !== undefined)
    .sort((a, b) => Math.hypot(p.x - a.x!, p.y - a.y!) - Math.hypot(p.x - b.x!, p.y - b.y!))[0];
  if (!near) return;
  s.here = { locationId: near.id, at: new Date().toISOString(), source: "gps" };
  const png = await svgToPng(planSvg(db, near.id, `You are near ${near.name}`), 1600);
  if (png) await sendImage(c, from, await uploadMedia(c, png, "image/png", "you-are-here.png"), `📍 Near ${locationPath(db, near.id)}`);
  else await sendText(c, from, `📍 Near ${locationPath(db, near.id)}`);
  if (s.pending) await sendText(c, from, `Reply *save* to file your ${s.pending.mime.startsWith("image") ? "photo" : "document"} here.`);
}

async function onMedia(c: WaConfig, from: string, s: WaSession, m: any) {
  if (s.projectId && s.projectId !== LIVE) return sendText(c, from, `Photos and PDFs are filed on ${(await getRepo()).db.project.name}'s site plan. Type *projects* and choose it to file this one.`);
  const media = m.type === "image" ? m.image : m.document;
  const caption = String(media?.caption ?? "").trim();
  const { bytes, mime } = await getMedia(c, media.id);
  const filename = String(media.filename ?? (mime === "application/pdf" ? "document.pdf" : `photo-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}.jpg`));
  const db = (await getRepo()).db;

  // A question in the caption: analyse it first, file on request
  const isQuestion = /\?|^(what|why|is |are |check|analy|review|explain|does|can you)/i.test(caption);
  if (isQuestion && (mime === "application/pdf" || /^image\/(jpeg|png|webp|gif)$/.test(mime))) {
    if (s.pending) await removeKey(s.pending.key); // only one held file at a time
    const key = `whatsapp/inbox/${m.id.replace(/\W/g, "")}`;
    await writeBytes(key, bytes, mime);
    s.pending = { key, mime, filename, caption, at: new Date().toISOString() };
    await ask(c, from, s, `${caption}\n\n(Attached ${mime === "application/pdf" ? "PDF" : "photo"}: ${filename}.)`, { mime, bytes, name: filename }, m.id);
    return sendText(c, from, "Want me to file it? Reply *save* (to your current place) or *upload to <place>*.");
  }

  // Otherwise it's a record from site: file it now (caption place, else where you are, else the site), then link it as evidence
  const filingOnly = /^(upload|file|save|attach|put)\b/i.test(caption);
  const target = caption.replace(/^(upload|file|save|attach|put)( it)?( to| at| in| on)?\s*/i, "");
  const placeL = target && (filingOnly || target.split(/\s+/).length <= 5) ? resolveLocation(db, target) : undefined;
  const locationId = placeL?.id ?? s.here?.locationId ?? "site";
  const doc = await fileBytes(s, { bytes, mime, filename, caption: filingOnly || placeL ? "" : caption }, locationId);
  const fresh = s.evidence && Date.now() - Date.parse(s.evidence.at) < 10 * 60_000;
  s.evidence = { docIds: [...(fresh ? s.evidence!.docIds : []), doc.id].slice(-10), at: new Date().toISOString() };

  if (caption && !filingOnly && !placeL) return askWithEvidence(c, from, s, caption, m.id); // "L14 slab done", "façade zone 4 pending"
  const n = s.evidence.docIds.length;
  const sug = doc.photo?.activity;
  if (!fresh || !s.evidence.suggest) s.evidence.suggest = sug ? { activityId: sug.id, state: sug.state, percent: sug.percent } : undefined;
  if (fresh && n > 1) // an album: a line per photo, one question
    return sendText(c, from, `📷 ${n}. ${doc.photo ? doc.photo.scene : doc.title}${sug ? ` _(→ ${sug.id})_` : ""}`, m.id);
  return sendText(c, from, photoReply((await getRepo()).db, doc), m.id);
}

/** What the agent read in a photo, and the question that turns it into a schedule update. */
function photoReply(db: Db, doc: Doc): string {
  const p = doc.photo;
  const filed = `Filed to ${locationPath(db, doc.locationId)}.`;
  if (!p) return `✅ *${doc.title}* — ${filed}\nIs it evidence for a task? Tell me (text or 🎙 voice note) which one and whether it's *done*, at a *%* or *pending* — e.g. _Tower A L14 slab done_ — and I'll update the schedule.`;
  const lines = [`📷 *${doc.title}*`, p.scene];
  if (p.work) lines.push(`🔧 ${p.work}`);
  if (p.where) lines.push(`📍 ${p.where}${p.locationId ? ` → ${locationPath(db, p.locationId)}` : ""}`);
  if (p.safety.length) lines.push(`⚠️ *Safety:* ${p.safety.join("; ")}`);
  if (p.quality.length) lines.push(`🔍 *Quality:* ${p.quality.join("; ")}`);
  lines.push(`_${filed}_`, "");
  const a = p.activity;
  if (a) {
    const st = a.state === "completed" ? "done" : a.state === "pending" ? "pending" : a.percent !== undefined ? `about ${a.percent}%` : "in progress";
    lines.push(`Looks like *${a.name}* (${a.id}) — ${st} (${a.confidence} confidence${a.why ? `: ${a.why}` : ""}).`);
    lines.push(`Reply *yes* to record it in the schedule with this photo as evidence, or *done* / *pending* / a *%*, or tell me the right task.`);
  } else {
    lines.push("Which task is it evidence for? Tell me (text or 🎙 voice note) and whether it's *done*, at a *%* or *pending*.");
  }
  if (p.safety.length) lines.push("Say *log safety* to record the safety issue for the site team.");
  return lines.join("\n");
}

/** Store a file in the document library (AI title/summary when available). */
async function fileBytes(s: WaSession, f: { bytes: Uint8Array; mime: string; filename: string; caption: string }, locationId: string): Promise<Doc> {
  const ai = await describeUpload(Buffer.from(f.bytes), f.mime, f.filename, { db: (await getRepo()).db, hint: f.caption || undefined, locationId }).catch(() => null);
  // nowhere better known: file it where the photo itself shows it was taken
  if (locationId === "site" && ai?.photo?.locationId) locationId = ai.photo.locationId;
  const caption = f.caption.replace(/^(upload|file|save|attach|put)( it)?( to| at| in| on)?\s*\S.*$/i, "").trim();
  const doc: Doc = {
    id: newId("d"),
    title: ai?.title || (caption ? caption.slice(0, 80) : f.filename.replace(/\.[^.]+$/, "")),
    category: ai?.category && CATEGORIES.includes(ai.category) ? ai.category : f.mime.startsWith("image/") ? "Photo" : "Other",
    discipline: ai?.discipline, revision: ai?.revision, locationId,
    filename: f.filename, mime: f.mime, size: f.bytes.length,
    summary: [caption, ai?.summary].filter(Boolean).join(" — ").slice(0, 300), text: ai?.text ?? caption,
    tags: ["whatsapp"], uploadedAt: new Date().toISOString(), uploadedBy: s.name,
    ...(ai?.photo ? { photo: ai.photo } : {}),
  };
  const repo = await getRepo();
  await saveUpload(doc.id, f.bytes, f.mime);
  repo.db.docs.unshift(doc);
  await repo.save();
  s.focusDocId = doc.id;
  return doc;
}

async function fileMedia(c: WaConfig, from: string, s: WaSession, locationId: string) {
  const p = s.pending!;
  const bytes = await readBytes(p.key);
  if (!bytes) { s.pending = undefined; return sendText(c, from, "Sorry — I lost that file. Please send it again."); }
  const doc = await fileBytes(s, { bytes, mime: p.mime, filename: p.filename, caption: p.caption }, locationId);
  await removeKey(p.key);
  s.pending = undefined;
  s.evidence = { docIds: [doc.id], at: new Date().toISOString() };
  const db = (await getRepo()).db;
  await sendText(c, from, `✅ Filed *${doc.title}* (${doc.category}) to ${locationPath(db, locationId)}.${doc.summary ? `\n${doc.summary}` : ""}\nIt's on the site map and searchable. If it's evidence for a task, tell me which one and whether it's done or pending.`);
}
