// Next.js 16: proxy.ts (renamed from middleware.ts).
// Lightweight gate only — checks cookie presence and redirects to /login.
// Real session validation + authorization happen server-side in guard.ts;
// never trust this layer alone.
import { NextRequest, NextResponse } from "next/server";

const PUBLIC = ["/login", "/activate", "/api/auth/login", "/api/auth/activate"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    PUBLIC.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }
  const hasCookie = req.cookies.has(process.env.SESSION_COOKIE_NAME ?? "hilcoe_session");
  if (!hasCookie) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
