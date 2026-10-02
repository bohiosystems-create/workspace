/** Minimal WhatsApp Business Cloud API (Meta Graph) client. */
export interface WaConfig { token: string; phoneNumberId: string; version: string; base: string }

export function waConfig(): WaConfig | null {
  const token = process.env.WHATSAPP_TOKEN, phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return null;
  return { token, phoneNumberId, version: process.env.WHATSAPP_GRAPH_VERSION || "v23.0", base: (process.env.WHATSAPP_GRAPH_BASE || "https://graph.facebook.com").replace(/\/$/, "") };
}

async function call(c: WaConfig, path: string, init: RequestInit): Promise<any> {
  const r = await fetch(`${c.base}/${c.version}/${path}`, { ...init, headers: { authorization: `Bearer ${c.token}`, ...(init.headers ?? {}) } });
  const txt = await r.text();
  if (!r.ok) throw new Error(`WhatsApp API ${r.status}: ${txt.slice(0, 300)}`);
  return txt ? JSON.parse(txt) : {};
}
const post = (c: WaConfig, body: unknown) =>
  call(c, `${c.phoneNumberId}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", ...(body as object) }) });

/** Split long replies on paragraph/line boundaries (WhatsApp text limit is 4096). */
export function chunks(text: string, max = 3800): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    let cut = rest.lastIndexOf("\n\n", max);
    if (cut < max * 0.5) cut = rest.lastIndexOf("\n", max);
    if (cut < max * 0.5) cut = rest.lastIndexOf(" ", max);
    if (cut <= 0) cut = max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

export async function sendText(c: WaConfig, to: string, text: string, replyTo?: string) {
  for (const [i, body] of chunks(text).entries())
    await post(c, { to, type: "text", text: { body, preview_url: false }, ...(i === 0 && replyTo ? { context: { message_id: replyTo } } : {}) });
}
export async function markRead(c: WaConfig, messageId: string) {
  await post(c, { status: "read", message_id: messageId }).catch(() => undefined);
}
export async function uploadMedia(c: WaConfig, bytes: Uint8Array, mime: string, filename: string): Promise<string> {
  const fd = new FormData();
  fd.set("messaging_product", "whatsapp");
  fd.set("type", mime);
  fd.set("file", new Blob([new Uint8Array(bytes)], { type: mime }), filename);
  const j = await call(c, `${c.phoneNumberId}/media`, { method: "POST", body: fd });
  return String(j.id);
}
export async function sendImage(c: WaConfig, to: string, mediaId: string, caption?: string) {
  await post(c, { to, type: "image", image: { id: mediaId, caption: caption?.slice(0, 1000) } });
}
export async function sendDocument(c: WaConfig, to: string, mediaId: string, filename: string, caption?: string) {
  await post(c, { to, type: "document", document: { id: mediaId, filename, caption: caption?.slice(0, 1000) } });
}
/** Download inbound media (2-step: metadata → authenticated download). */
export async function getMedia(c: WaConfig, mediaId: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const meta = await call(c, mediaId, { method: "GET" });
  const r = await fetch(meta.url, { headers: { authorization: `Bearer ${c.token}` } });
  if (!r.ok) throw new Error(`media download ${r.status}`);
  return { bytes: new Uint8Array(await r.arrayBuffer()), mime: String(meta.mime_type ?? r.headers.get("content-type") ?? "application/octet-stream").split(";")[0] };
}
