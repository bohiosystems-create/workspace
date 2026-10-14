/**
 * System check — everything the demo depends on, verified live: storage, the AI, ElevenLabs (key, voices, credits,
 * and with `deep` a real synthesis), WhatsApp (token, numbers, last message), Outlook, the scheduler, the app's
 * address and the data. Plus the two things a rehearsal needs: "prepare today's brief" (EN + AR, narrated, so
 * ▶ Play is instant) and "reset the demo data" (back to the seeded site; briefs history is kept).
 */
import { store } from "./storage";
import { getRepo, readJson } from "./store";
import { serverLlm } from "./llmConfig";
import { availableProviders, routeAndRun } from "./core/llm/router";
import { synthesize, voiceAccount, voiceEnabled } from "./deck/voice";
import { sttProvider } from "./core/stt";
import { waConfig } from "./whatsapp/graph";
import { outlookCredsSet, outlookMode, outlookSender } from "./outlook";
import { serverReports } from "./reports/server";
import { readGenerated } from "./generated";
import { seedDb } from "./seed";

export type Status = "ok" | "warn" | "fail";
export interface Check { id: string; label: string; status: Status; detail: string; fix?: string; ms?: number }
export interface Readiness { at: string; deep: boolean; checks: Check[]; score: { ok: number; warn: number; fail: number; total: number } }

const API = () => (process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io").replace(/\/$/, "");
const timed = async <T,>(ms: number, p: Promise<T>): Promise<T> => Promise.race([p, new Promise<never>((_, no) => setTimeout(() => no(new Error(`no answer within ${Math.round(ms / 1000)} s`)), ms))]);
const mask = (n: string) => n.replace(/\D/g, "").replace(/^(\d{3})\d+(\d{3})$/, "$1…$2");
const err = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);

export async function readiness(deep = false): Promise<Readiness> {
  const checks: Check[] = [];
  const push = (c: Check) => checks.push(c);

  // ---- storage
  const kind = store().kind;
  push(kind === "blob" ? { id: "storage", label: "Storage", status: "ok", detail: "Vercel Blob — data survives deploys and is shared by every instance." }
    : kind === "fs" ? { id: "storage", label: "Storage", status: "ok", detail: "Disk (own server)." }
    : { id: "storage", label: "Storage", status: "fail", detail: "Temporary storage: everything is lost on the next deploy or restart.", fix: "Connect a Vercel Blob store to the project (VERCEL.md, step 2) and redeploy." });

  // ---- the app's address (links in briefs and e-mails)
  const appUrl = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  push(appUrl ? { id: "url", label: "App address", status: "ok", detail: appUrl } : { id: "url", label: "App address", status: "warn", detail: "Not set: the brief's 'Open the Onsite Agent' and ▶ Play buttons have nowhere to link.", fix: "Set APP_URL to the public address (e.g. https://kinan-site-agent.bohiotech.com)." });

  // ---- AI
  const cfg = serverLlm(), providers = availableProviders(cfg);
  if (!providers.length) push({ id: "ai", label: "AI", status: "fail", detail: "No AI key: the chat, WhatsApp answers, photo reading and the presenter script all need one.", fix: "Set ANTHROPIC_API_KEY (or OPENAI_API_KEY) and redeploy." });
  else if (!deep) push({ id: "ai", label: "AI", status: "ok", detail: `${providers.join(" + ")} configured. Run the deep check to make a real call.` });
  else {
    const t0 = Date.now();
    try {
      const { out, route } = await timed(25_000, routeAndRun(cfg, { system: "Reply with the single word OK.", history: [{ role: "user", content: "Say OK." }], tools: [], exec: async () => "", maxTurns: 1, maxTokens: 8 }, { tier: "fast", reason: "system check" }));
      push({ id: "ai", label: "AI", status: /ok/i.test(out.text ?? "") ? "ok" : "warn", detail: `${route.provider} · ${route.model} answered in ${Date.now() - t0} ms: “${(out.text ?? "").trim().slice(0, 40)}”`, ms: Date.now() - t0 });
    } catch (e) { push({ id: "ai", label: "AI", status: "fail", detail: `The AI did not answer: ${err(e)}`, fix: "Check the key, the provider's status page and the spend limit." }); }
  }

  // ---- ElevenLabs: key, credits, the two voices, and (deep) a real synthesis in each language
  if (!voiceEnabled()) push({ id: "voice", label: "ElevenLabs", status: "warn", detail: "ELEVENLABS_API_KEY is not set: ▶ Play uses the browser's own voice and WhatsApp voice notes go to OpenAI Whisper.", fix: "Add ELEVENLABS_API_KEY in Vercel and redeploy." });
  else {
    const acc = await voiceAccount();
    if (!acc.ok) push({ id: "voice", label: "ElevenLabs", status: "fail", detail: acc.error ?? "The key was refused.", fix: "Check the key in Vercel and the plan's remaining characters." });
    else {
      push({ id: "voice", label: "ElevenLabs", status: "ok", detail: `Key accepted${acc.tier ? ` · ${acc.tier}` : ""}${acc.limit ? ` · ${(acc.limit - (acc.used ?? 0)).toLocaleString("en-GB")} of ${acc.limit.toLocaleString("en-GB")} characters left this month` : ""}.` });
      const ids: [string, string | undefined][] = [["English", process.env.ELEVENLABS_VOICE_ID || process.env.ELEVENLABS_VOICE], ["Arabic", process.env.ELEVENLABS_VOICE_ID_AR || process.env.ELEVENLABS_VOICE_AR]];
      for (const [lang, id] of ids) {
        if (!id) { push({ id: `voice-${lang}`, label: `${lang} voice`, status: "warn", detail: `No voice id set: the stock multilingual voice is used.`, fix: `Set ELEVENLABS_VOICE${lang === "Arabic" ? "_AR" : ""} to a voice id from the ElevenLabs voice library.` }); continue; }
        try {
          const r = await timed(10_000, fetch(`${API()}/v1/voices/${encodeURIComponent(id)}`, { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! } }));
          if (!r.ok) push({ id: `voice-${lang}`, label: `${lang} voice`, status: "fail", detail: `Voice ${id} not found on this account (${r.status}).`, fix: "Add the voice to your ElevenLabs library, or set a voice id that is in it." });
          else { const j = await r.json(); push({ id: `voice-${lang}`, label: `${lang} voice`, status: "ok", detail: `${j.name ?? id}${j.labels?.accent ? ` · ${j.labels.accent}` : ""}${j.labels?.gender ? ` · ${j.labels.gender}` : ""}` }); }
        } catch (e) { push({ id: `voice-${lang}`, label: `${lang} voice`, status: "warn", detail: `Could not read the voice: ${err(e)}` }); }
      }
      if (deep) for (const [lang, code, text] of [["English", "en", "System check: the presenter is ready."], ["Arabic", "ar", "فحص النظام: المقدّم جاهز."]] as const) {
        const t0 = Date.now();
        try { const s = await timed(30_000, synthesize(text, code)); push({ id: `synth-${code}`, label: `${lang} speech`, status: s.audio ? "ok" : "fail", detail: s.audio ? `Synthesised in ${Date.now() - t0} ms${s.starts.length ? " with word timings" : ""}.` : "No audio returned.", ms: Date.now() - t0 }); }
        catch (e) { push({ id: `synth-${code}`, label: `${lang} speech`, status: "fail", detail: err(e), fix: "This is the exact error the player would show. Fix the key, voice or credits first." }); }
      }
    }
  }
  push({ id: "stt", label: "Voice notes (WhatsApp)", status: sttProvider() === "elevenlabs" ? "ok" : cfg.openai?.apiKey ? "warn" : "fail", detail: sttProvider() === "elevenlabs" ? "Transcribed by ElevenLabs Scribe (Arabic and English)." : cfg.openai?.apiKey ? "Transcribed by OpenAI Whisper (needs OpenAI credits)." : "No transcription service: voice notes will be refused.", fix: sttProvider() === "elevenlabs" ? undefined : "Set ELEVENLABS_API_KEY." });

  // ---- WhatsApp
  const c = waConfig();
  if (!c) push({ id: "wa", label: "WhatsApp", status: "warn", detail: "Not connected (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID unset).", fix: "SETUP.md §6." });
  else {
    try {
      const r = await timed(10_000, fetch(`${c.base}/${c.version}/${c.phoneNumberId}?fields=display_phone_number,verified_name`, { headers: { authorization: `Bearer ${c.token}` }, cache: "no-store" }));
      const j = await r.json().catch(() => ({}));
      if (!r.ok) push({ id: "wa", label: "WhatsApp", status: "fail", detail: `Meta refuses the token (${r.status}): ${j?.error?.message ?? "rejected"}`, fix: "Create a permanent System User token (SETUP.md §6.2), set WHATSAPP_TOKEN, redeploy." });
      else {
        const test = /^\+1 ?555/.test(String(j.display_phone_number ?? ""));
        push({ id: "wa", label: "WhatsApp", status: test ? "warn" : "ok", detail: `${j.verified_name ?? ""} ${j.display_phone_number ?? ""}${test ? " — Meta's test number: only numbers added as test recipients in Meta can message it" : ""}`.trim(), fix: test ? "Fine for a demo from your own phone. For the client's phone, add their number as a test recipient in Meta (WhatsApp → API Setup), or go live with a real number (SETUP.md §6.6)." : undefined });
      }
    } catch (e) { push({ id: "wa", label: "WhatsApp", status: "fail", detail: `Meta not reachable: ${err(e)}` }); }
    const all = (process.env.WHATSAPP_ALLOW_ALL ?? "").toLowerCase() === "true";
    const nums = (process.env.WHATSAPP_ALLOWED_NUMBERS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    push(all ? { id: "wa-numbers", label: "Who can message it", status: "warn", detail: "Anyone (WHATSAPP_ALLOW_ALL=true).", fix: "List the demo phones in WHATSAPP_ALLOWED_NUMBERS instead." }
      : nums.length ? { id: "wa-numbers", label: "Who can message it", status: "ok", detail: nums.map((n) => { const [num, ...rest] = n.split(":"); return `${mask(num)}${rest.length ? ` (${rest.join(":").trim()})` : ""}`; }).join(", ") }
      : { id: "wa-numbers", label: "Who can message it", status: "fail", detail: "No numbers allowed: every message is refused.", fix: "WHATSAPP_ALLOWED_NUMBERS=9665…:Name,9665…:Name" });
    const last = (await readJson<{ at: string; ok: boolean; what: string; error?: string }>("whatsapp/status.json").catch(() => null))?.value;
    push(!last ? { id: "wa-last", label: "Last WhatsApp message", status: "warn", detail: "None handled yet on this deployment.", fix: "Send 'hi' from an allowed phone: the project list should come back." }
      : last.ok ? { id: "wa-last", label: "Last WhatsApp message", status: "ok", detail: `${last.what} at ${last.at.slice(0, 16).replace("T", " ")} UTC, handled.` }
      : { id: "wa-last", label: "Last WhatsApp message", status: "fail", detail: `${last.what} at ${last.at.slice(0, 16).replace("T", " ")} UTC failed: ${last.error ?? ""}` });
  }

  // ---- briefs: delivery, scheduler, last run
  const rep = await serverReports().state("en").catch(() => null);
  push(outlookMode() === "live" && outlookCredsSet() ? { id: "mail", label: "Brief e-mail", status: "ok", detail: `Outlook live, sent from ${outlookSender()}.` }
    : outlookMode() === "live" ? { id: "mail", label: "Brief e-mail", status: "fail", detail: "OUTLOOK_MODE=live but the Microsoft credentials are missing.", fix: "Set MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, OUTLOOK_SENDER." }
    : { id: "mail", label: "Brief e-mail", status: "warn", detail: "Simulated: briefs are built and shown in the app, not e-mailed.", fix: "To e-mail them: OUTLOOK_MODE=live with the Microsoft 365 app (SETUP.md §8b)." });
  push(process.env.REPORTS_CRON_KEY ? { id: "cron", label: "Daily schedule", status: "ok", detail: `Scheduler enabled${rep?.next ? ` · next brief ${rep.next.date} ${rep.next.time}` : ""}${rep?.schedule?.recipients ? ` · to ${rep.schedule.recipients}` : ""}.` }
    : { id: "cron", label: "Daily schedule", status: "warn", detail: "REPORTS_CRON_KEY is not set: briefs only run by hand.", fix: "Set REPORTS_CRON_KEY (and CRON_SECRET for Vercel Cron)." });
  const lastSched = rep?.reports?.find((r) => r.trigger === "SCHEDULED");
  push(lastSched ? { id: "brief-last", label: "Last scheduled brief", status: "ok", detail: `${lastSched.date} · ${lastSched.status.toLowerCase()}${lastSched.delivery === "mock" ? " (simulated)" : ""}.` } : { id: "brief-last", label: "Last scheduled brief", status: "warn", detail: "No scheduled brief has run yet." });
  const todays = rep?.reports?.filter((r) => r.date === rep?.local?.date) ?? [];
  push(todays.some((r) => r.lang === "en") && todays.some((r) => r.lang === "ar") ? { id: "brief-today", label: "Today's brief", status: "ok", detail: "Built in English and Arabic — ▶ Play is ready." }
    : { id: "brief-today", label: "Today's brief", status: "warn", detail: `Not built yet in ${todays.some((r) => r.lang === "en") ? "Arabic" : todays.some((r) => r.lang === "ar") ? "English" : "either language"}.`, fix: "Use 'Prepare today's brief' below so ▶ Play opens instantly in both languages." });

  // ---- data
  const db = (await getRepo()).db, gen = await readGenerated().catch(() => ({ projects: [] as unknown[] }));
  const seedNotes = seedDb().notes.length;
  const userDocs = db.docs.filter((d) => !d.id.startsWith("d_seed")).length, pins = db.locations.filter((l) => l.type === "pin").length, upd = db.data.updates?.length ?? 0, userNotes = Math.max(0, db.notes.length - seedNotes);
  push({ id: "data", label: "Site data", status: "ok", detail: `Data date ${db.data.meta.dataDate}${db.data.meta.fixed ? " (fixed: a real programme was imported)" : " (follows the calendar)"} · ${db.data.schedule.length} activities · ${gen.projects.length} generated project${gen.projects.length === 1 ? "" : "s"} on the server.` });
  push(userDocs || userNotes || pins || upd ? { id: "clean", label: "Test traces", status: "warn", detail: `${userDocs} uploaded file${userDocs === 1 ? "" : "s"}, ${userNotes} note${userNotes === 1 ? "" : "s"}, ${pins} dropped pin${pins === 1 ? "" : "s"}, ${upd} site update${upd === 1 ? "" : "s"} on top of the seeded site.`, fix: "Keep them if they are part of the story (e.g. the L14 slab you marked done). Otherwise 'Reset demo data' below." }
    : { id: "clean", label: "Test traces", status: "ok", detail: "The site is as seeded." });

  const score = { ok: checks.filter((x) => x.status === "ok").length, warn: checks.filter((x) => x.status === "warn").length, fail: checks.filter((x) => x.status === "fail").length, total: checks.length };
  return { at: new Date().toISOString(), deep, checks, score };
}

/** Today's brief in both languages, narrated (so ▶ Play opens instantly). Returns the report ids. */
export async function prepareBriefs(by: string) {
  const r = serverReports(), out: Record<string, string | null> = {};
  for (const lang of ["en", "ar"] as const) { const s = await r.action({ action: "PREVIEW", lang, by }); out[lang] = (s as { openId?: string }).openId ?? null; }
  return out;
}

/** Back to the seeded site: uploads, notes, pins, site updates and user material requests go; briefs history stays. */
export async function resetDemoData() {
  const repo = await getRepo(), fresh = seedDb();
  Object.assign(repo.db, fresh);
  await repo.save();
  return { docs: repo.db.docs.length, notes: repo.db.notes.length, dataDate: repo.db.data.meta.dataDate };
}
