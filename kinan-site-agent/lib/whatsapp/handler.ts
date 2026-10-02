import crypto from "node:crypto";
import type { Doc, UiAction } from "../types";
import { CATEGORIES } from "../types";
import { agentBudgetMs, runAgent } from "../agent";
import { describeUpload } from "../ingest";
import { renderDrawing } from "../drawings";
import { gpsToPlan, PLAN } from "../siteplan";
import { locationPath, resolveLocation } from "../core/query";
import { transcribe } from "../core/llm/openai";
import { toBase64 } from "../core/tools";
import { serverLlm } from "../llmConfig";
import { getRepo, newId, readBytes, readUpload, removeKey, saveUpload, writeBytes } from "../store";
import { getMedia, markRead, sendDocument, sendImage, sendText, uploadMedia, waConfig, type WaConfig } from "./graph";
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

const HELP = `*Kinan Site Agent* — ask anything about the project, e.g.
• _Slab thickness on Tower A level 12?_
• _What's late on Tower A?_ / _Look-ahead next 2 weeks_
• _Deliveries today_ / _Status of PO-4500123_
• _PPE and permits for hot work at the podium_
• _What does SBC 801 require for refuge floors?_
• _Show me the Tower A L12 slab drawing_ / _Where is TC1?_
• _Note: edge protection missing L31 east_ (or _issue: …_)
• _Order 20 t rebar Ø16 for Tower A L14 by 10 Oct_

📍 Share your *location* and I'll know where you are.
📷 Send a *photo or PDF* — I file it to where you are (or caption it "upload to Tower A L12"). Add a question in the caption to get it analysed.
🎙 Voice notes work too.
Commands: *help*, *where am I*, *here <place>*, *reset*`;

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

async function handleMessage(c: WaConfig, m: any, profileName: string) {
  const from: string = m.from;
  const acl = allowed(from);
  if (!acl.ok) {
    console.warn(`[whatsapp] rejected message from unlisted number ${from}`);
    await sendText(c, from, "This number isn't authorised for the Kinan Site Agent. Ask the project admin to add you.");
    return;
  }
  const s = await loadSession(from, acl.name || profileName || "Site user");
  if (!firstTime(s, m.id)) return; // duplicate delivery
  await saveSession(from, s);      // record the id early so a retry on another instance is skipped
  await markRead(c, m.id);
  try {
    switch (m.type) {
      case "text": await onText(c, from, s, String(m.text?.body ?? ""), m.id); break;
      case "audio": await onAudio(c, from, s, m); break;
      case "image": case "document": await onMedia(c, from, s, m); break;
      case "location": await onLocation(c, from, s, m.location); break;
      case "interactive": await onText(c, from, s, String(m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? ""), m.id); break;
      default: await sendText(c, from, "I can read text, voice notes, photos, PDFs and shared locations. Type *help* for examples.");
    }
  } catch (e) {
    console.error("[whatsapp] handler error", e);
    await sendText(c, from, `Sorry — something went wrong: ${e instanceof Error ? e.message.slice(0, 200) : "error"}`).catch(() => undefined);
  } finally {
    await saveSession(from, s).catch((e) => console.error("[whatsapp] session save", e));
  }
}

async function onText(c: WaConfig, from: string, s: WaSession, text: string, msgId?: string) {
  const t = text.trim();
  const lt = t.toLowerCase();
  const db = (await getRepo()).db;
  if (!t) return;
  if (/^(help|menu|\?|start|hi|hello|salam|السلام عليكم)$/i.test(t)) return sendText(c, from, HELP);
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

async function onAudio(c: WaConfig, from: string, s: WaSession, m: any) {
  const { bytes, mime } = await getMedia(c, m.audio.id);
  let text: string;
  try { text = await transcribe(serverLlm(), bytes, mime, mime.includes("ogg") ? "voice.ogg" : "voice.m4a"); }
  catch (e) { return sendText(c, from, `🎙 I couldn't transcribe that: ${e instanceof Error ? e.message : e}`); }
  if (!text) return sendText(c, from, "🎙 I couldn't hear anything in that voice note.");
  await sendText(c, from, `🎙 _“${text}”_`);
  await onText(c, from, s, text, m.id);
}

async function onLocation(c: WaConfig, from: string, s: WaSession, loc: { latitude: number; longitude: number; name?: string }) {
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
  const media = m.type === "image" ? m.image : m.document;
  const caption = String(media?.caption ?? "").trim();
  const { bytes, mime } = await getMedia(c, media.id);
  const filename = String(media.filename ?? (mime === "application/pdf" ? "document.pdf" : `photo-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}.jpg`));
  if (s.pending) await removeKey(s.pending.key); // only one held file at a time
  const key = `whatsapp/inbox/${m.id.replace(/\W/g, "")}`;
  await writeBytes(key, bytes, mime);
  s.pending = { key, mime, filename, caption, at: new Date().toISOString() };

  const db = (await getRepo()).db;
  const isQuestion = /\?|^(what|why|is |are |check|analy|review|explain|does|can you)/i.test(caption);
  if (isQuestion && (mime === "application/pdf" || /^image\/(jpeg|png|webp|gif)$/.test(mime))) {
    await ask(c, from, s, `${caption}\n\n(Attached ${mime === "application/pdf" ? "PDF" : "photo"}: ${filename}.)`, { mime, bytes, name: filename }, m.id);
    return sendText(c, from, "Want me to file it? Reply *save* (to your current place) or *upload to <place>*.");
  }
  const target = caption.replace(/^(upload|file|save|attach|put)( it)?( to| at| in| on)?\s*/i, "");
  const l = (target && resolveLocation(db, target)) || (s.here ? db.locations.find((x) => x.id === s.here!.locationId) : undefined);
  if (l) return fileMedia(c, from, s, l.id);
  return sendText(c, from, "Where should I file this? Reply with a place (e.g. *Tower A L12*, *Laydown 2*), share your 📍 location, or *cancel*.");
}

async function fileMedia(c: WaConfig, from: string, s: WaSession, locationId: string) {
  const p = s.pending!;
  const bytes = await readBytes(p.key);
  if (!bytes) { s.pending = undefined; return sendText(c, from, "Sorry — I lost that file. Please send it again."); }
  const ai = await describeUpload(Buffer.from(bytes), p.mime, p.filename);
  const caption = p.caption.replace(/^(upload|file|save|attach|put)( it)?( to| at| in| on)?\s*\S.*$/i, "").trim();
  const doc: Doc = {
    id: newId("d"),
    title: ai?.title || (caption ? caption.slice(0, 80) : p.filename.replace(/\.[^.]+$/, "")),
    category: ai?.category && CATEGORIES.includes(ai.category) ? ai.category : p.mime.startsWith("image/") ? "Photo" : "Other",
    discipline: ai?.discipline, revision: ai?.revision, locationId,
    filename: p.filename, mime: p.mime, size: bytes.length,
    summary: [caption, ai?.summary].filter(Boolean).join(" — ").slice(0, 300), text: ai?.text ?? caption,
    tags: ["whatsapp"], uploadedAt: new Date().toISOString(), uploadedBy: s.name,
  };
  const repo = await getRepo();
  await saveUpload(doc.id, bytes, p.mime);
  repo.db.docs.unshift(doc);
  await repo.save();
  await removeKey(p.key);
  s.pending = undefined;
  s.focusDocId = doc.id;
  const db = repo.db;
  await sendText(c, from, `✅ Filed *${doc.title}* (${doc.category}) to ${locationPath(db, locationId)}.${ai?.summary ? `\n${ai.summary}` : ""}\nIt's now on the site map and searchable. Say _note: …_ to add a note to it.`);
}
