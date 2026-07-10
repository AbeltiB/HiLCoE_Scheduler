import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { clientIp } from "@/lib/auth/client-ip";

export type AccessLogEntry = {
  actorId?: string | null;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

/**
 * Every request, reads included — deliberately NOT routed through audit()'s
 * hash chain / pg_advisory_xact_lock. That chain is reserved for mutations and
 * security events (the record of truth); this table exists purely so "who
 * looked at what, when" is answerable, and must never contend with it.
 * A failure here must never fail the request it's logging.
 */
export async function logAccess(entry: AccessLogEntry): Promise<void> {
  try {
    await db.accessLog.create({
      data: {
        actorId: entry.actorId ?? null,
        method: entry.method,
        path: entry.path,
        statusCode: entry.statusCode,
        durationMs: entry.durationMs,
        requestId: entry.requestId,
        ip: entry.ip,
        userAgent: entry.userAgent,
      },
    });
  } catch (err) {
    console.error("[access-log]", err);
  }
}

export type PublicRouteResult = {
  response: NextResponse;
  actorId?: string | null;
};

/**
 * For the handful of routes that run before a session exists (login, logout,
 * activate) and so can't go through guard.ts's `guarded()`. Gives them the
 * same request-id/timing/access-log coverage every other route gets.
 */
export function publicRoute(
  handler: (
    req: NextRequest,
    reqCtx: { requestId: string; ip?: string; userAgent?: string }
  ) => Promise<PublicRouteResult>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const start = Date.now();
    const requestId = req.headers.get("x-request-id") ?? randomUUID();
    const ip = clientIp(req);
    const userAgent = req.headers.get("user-agent") ?? undefined;
    const path = new URL(req.url).pathname;

    let result: PublicRouteResult;
    try {
      result = await handler(req, { requestId, ip, userAgent });
    } catch (err) {
      console.error(`[${requestId}]`, err);
      result = {
        response: NextResponse.json({ error: "Internal error", requestId }, { status: 500 }),
      };
    }

    await logAccess({
      actorId: result.actorId ?? null,
      method: req.method,
      path,
      statusCode: result.response.status,
      durationMs: Date.now() - start,
      requestId,
      ip,
      userAgent,
    });

    return result.response;
  };
}
