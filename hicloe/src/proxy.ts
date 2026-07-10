// Next.js 16: proxy.ts (renamed from middleware.ts).
// Lightweight gate only — checks cookie presence and redirects to /login.
// Real session validation + authorization happen server-side in guard.ts;
// never trust this layer alone.
//
// Proxy defaults to the Node.js runtime as of Next.js 16 (confirmed in
// node_modules/next/dist/docs), so it's safe to write an AccessLog row
// directly here. This matters because a request with no session cookie at
// all is answered right here — it never reaches guard.ts's guarded(), which
// is where every other request gets logged. Without this, "no cookie"
// requests (bots, logged-out users, anyone probing a protected URL) would
// leave zero trace despite the "log every request" goal.
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { logAccess } from "@/lib/audit/access-log";
import { clientIp } from "@/lib/auth/client-ip";

const PUBLIC = ["/login", "/activate", "/api/auth/login", "/api/auth/activate"];

export async function proxy(req: NextRequest) {
  const start = Date.now();
  const { pathname } = req.nextUrl;
  if (
    PUBLIC.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const requestId = req.headers.get("x-request-id") ?? randomUUID();
  const ip = clientIp(req);
  const userAgent = req.headers.get("user-agent") ?? undefined;

  const hasCookie = req.cookies.has(process.env.SESSION_COOKIE_NAME ?? "hilcoe_session");
  if (!hasCookie) {
    const isApi = pathname.startsWith("/api/");
    const res = isApi
      ? NextResponse.json({ error: "Not authenticated", requestId }, { status: 401 })
      : (() => {
          const url = req.nextUrl.clone();
          url.pathname = "/login";
          url.searchParams.set("next", pathname);
          return NextResponse.redirect(url);
        })();
    await logAccess({
      actorId: null,
      method: req.method,
      path: pathname,
      statusCode: res.status,
      durationMs: Date.now() - start,
      requestId,
      ip,
      userAgent,
    });
    return res;
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
