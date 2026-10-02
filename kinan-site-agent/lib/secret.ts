import crypto from "node:crypto";

/** Constant-time check of "Authorization: Bearer <secret>" (or x-api-key) against an env secret. */
export function bearerOk(req: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const h = req.headers.get("authorization") ?? "";
  const got = h.startsWith("Bearer ") ? h.slice(7) : req.headers.get("x-api-key") ?? "";
  const a = Buffer.from(got), b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
