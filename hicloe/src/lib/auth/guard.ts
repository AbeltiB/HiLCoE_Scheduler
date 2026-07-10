import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import { can } from "@/lib/authz/can";
import { audit } from "@/lib/audit/audit";
import { logAccess } from "@/lib/audit/access-log";
import { clientIp } from "@/lib/auth/client-ip";
import "@/lib/authz/policies"; // side-effect: register ABAC policies

export type Ctx = {
  req: NextRequest;
  user: SessionUser;
  requestId: string;
  ip?: string;
  userAgent?: string;
  /** Pre-bound audit helper carrying actor + request context. */
  log: (e: {
    action: string;
    entityType?: string;
    entityId?: string;
    before?: unknown;
    after?: unknown;
    meta?: unknown;
  }) => Promise<void>;
  /** ABAC check against a concrete resource; audits and throws on denial. */
  authorize: (action: string, resource?: unknown) => Promise<void>;
};

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Wrap a route handler with: session requirement, an RBAC precondition,
 * request-scoped audit context, uniform error mapping.
 *
 *   export const POST = guarded("users:manage", async (ctx) => { ... });
 */
export function guarded(
  requiredAction: string | null,
  handler: (ctx: Ctx, routeParams?: Record<string, string>) => Promise<NextResponse>
) {
  return async (
    req: NextRequest,
    props?: { params: Promise<Record<string, string>> }
  ): Promise<NextResponse> => {
    const start = Date.now();
    const requestId = req.headers.get("x-request-id") ?? randomUUID();
    const ip = clientIp(req);
    const userAgent = req.headers.get("user-agent") ?? undefined;
    const path = new URL(req.url).pathname;
    let actorId: string | null = null;

    const finish = async (res: NextResponse): Promise<NextResponse> => {
      await logAccess({
        actorId,
        method: req.method,
        path,
        statusCode: res.status,
        durationMs: Date.now() - start,
        requestId,
        ip,
        userAgent,
      });
      return res;
    };

    const user = await getSessionUser();
    if (!user) {
      return finish(
        NextResponse.json({ error: "Not authenticated", requestId }, { status: 401 })
      );
    }
    actorId = user.id;

    const ctx: Ctx = {
      req,
      user,
      requestId,
      ip,
      userAgent,
      log: (e) => audit({ ...e, actorId: user.id, requestId, ip, userAgent }),
      authorize: async (action, resource) => {
        const res = can(user, action, resource);
        if (!res.allowed) {
          await audit({
            action: "authz.denied",
            actorId: user.id,
            requestId,
            ip,
            userAgent,
            meta: { attempted: action, reason: res.reason },
          });
          throw new HttpError(403, res.reason);
        }
      },
    };

    try {
      if (requiredAction) await ctx.authorize(requiredAction);
      const params = props ? await props.params : undefined;
      return await finish(await handler(ctx, params));
    } catch (err) {
      if (err instanceof HttpError) {
        return await finish(
          NextResponse.json({ error: err.message, requestId }, { status: err.status })
        );
      }
      console.error(`[${requestId}]`, err);
      return await finish(
        NextResponse.json({ error: "Internal error", requestId }, { status: 500 })
      );
    }
  };
}
