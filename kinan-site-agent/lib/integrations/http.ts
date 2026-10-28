// Small helpers shared by the northbound integrations: settings read from JSON env vars, a fetch that gives up after a
// few seconds (a customer system that hangs must not hold the app), and HMAC signatures for what we send. Web Crypto
// only (no node: imports), so the offline demo page that bundles the operations layer still builds.

export const envJson = <T,>(name: string, fallback: T): T => {
  const s = process.env[name];
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
};

export async function send(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<{ ok: boolean; status: number; text: string; headers: Headers }> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(init.timeoutMs ?? 8000) });
  const text = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, text, headers: res.headers };
}

/** `t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">` — the receiver recomputes it with the shared secret. */
export async function signature(secret: string, body: string, t = Math.floor(Date.now() / 1000)) {
  const enc = new TextEncoder(), key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${body}`)));
  return `t=${t},v1=${Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** A bearer token compared in constant time; false when the token isn't configured. */
export function bearerOk(req: Request, expected: string | undefined) {
  if (!expected || expected.length < 16) return false;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  // constant time: every character is compared whatever the first difference
  let diff = got.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) diff |= (got.charCodeAt(i) || 0) ^ expected.charCodeAt(i);
  return diff === 0;
}

export const short = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
