import { NextRequest, NextResponse } from "next/server";

/**
 * Password-protects the web app and its API when APP_PASSWORD is set.
 * Machine endpoints authenticate themselves and are excluded:
 *   /api/whatsapp (Meta signature), /api/integrations/* and /api/import (bearer secrets).
 */
export function middleware(req: NextRequest) {
  const pass = process.env.APP_PASSWORD;
  if (!pass) return NextResponse.next();
  const h = req.headers.get("authorization") ?? "";
  if (h.startsWith("Basic ")) {
    try {
      const [user, pw] = atob(h.slice(6)).split(":");
      if (pw === pass && (!process.env.APP_USER || user === process.env.APP_USER)) return NextResponse.next();
    } catch { /* fall through */ }
  }
  return new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Kinan Site Agent"' } });
}

export const config = {
  matcher: ["/((?!api/whatsapp|api/integrations|api/import|_next/static|_next/image|icon.svg|manifest.webmanifest).*)"],
};
