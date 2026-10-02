import type { ChatTurn } from "../core/llm/types";
import { readJson, writeJson } from "../store";

export interface WaSession {
  name: string;
  history: ChatTurn[];
  here?: { locationId: string; at: string; source: "gps" | "text" };
  focusDocId?: string;
  /** Photo/PDF received but not yet filed (bytes kept in storage under `key`). */
  pending?: { key: string; mime: string; filename: string; caption: string; at: string };
  seen: string[];
  lastSeen: string;
}

// One storage object per sender, so concurrent conversations never overwrite each other.
const key = (waId: string) => `whatsapp/sessions/${waId.replace(/\D/g, "")}.json`;

export async function loadSession(waId: string, name: string): Promise<WaSession> {
  const r = await readJson<WaSession>(key(waId));
  const s: WaSession = r?.value ?? { name, history: [], seen: [], lastSeen: new Date().toISOString() };
  s.seen ??= [];
  s.name = name || s.name;
  s.lastSeen = new Date().toISOString();
  // "Here" from GPS/text expires after 3 h — people move around site.
  if (s.here && Date.now() - Date.parse(s.here.at) > 3 * 3600_000) s.here = undefined;
  return s;
}
export async function saveSession(waId: string, s: WaSession) {
  s.seen = s.seen.slice(-200);
  s.history = s.history.slice(-24);
  await writeJson(key(waId), s);
}
/** True the first time a message id is seen for this sender (Meta retries deliveries). */
export function firstTime(s: WaSession, messageId: string): boolean {
  if (s.seen.includes(messageId)) return false;
  s.seen.push(messageId);
  return true;
}

/** Allowed senders: WHATSAPP_ALLOWED_NUMBERS="966500000102:Development Manager,9665…:Name" */
export function allowed(waId: string): { ok: boolean; name?: string } {
  if ((process.env.WHATSAPP_ALLOW_ALL ?? "").toLowerCase() === "true") return { ok: true };
  const list = (process.env.WHATSAPP_ALLOWED_NUMBERS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  for (const e of list) {
    const [num, ...rest] = e.split(":");
    if (num.replace(/\D/g, "") === waId.replace(/\D/g, "")) return { ok: true, name: rest.join(":").trim() || undefined };
  }
  return { ok: false };
}
