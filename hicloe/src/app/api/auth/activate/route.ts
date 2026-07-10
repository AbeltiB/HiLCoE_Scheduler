import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { publicRoute, type PublicRouteResult } from "@/lib/audit/access-log";
import { hashPassword } from "@/lib/auth/password";
import { sha256 } from "@/lib/auth/tokens";
import { createSession } from "@/lib/auth/session";
import { activateSchema } from "@/lib/validation/auth";
import { isRateLimited } from "@/lib/auth/rate-limit";

const IP_MAX_ATTEMPTS = 30;
const IP_WINDOW_MS = 5 * 60_000;

export const POST = publicRoute(async (req, { requestId, ip, userAgent }): Promise<PublicRouteResult> => {
  if (ip && isRateLimited(`activate:${ip}`, IP_MAX_ATTEMPTS, IP_WINDOW_MS)) {
    await audit({ action: "auth.activation_rate_limited", requestId, ip, userAgent });
    return {
      response: NextResponse.json({ error: "Too many attempts from this address. Try again later.", requestId }, { status: 429 }),
    };
  }
  const parsed = activateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return {
      response: NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request", requestId },
        { status: 400 }
      ),
    };
  }

  const token = await db.authToken.findUnique({
    where: { tokenHash: sha256(parsed.data.token) },
    include: { user: true },
  });
  if (
    !token ||
    token.purpose !== "ACTIVATION" ||
    token.usedAt ||
    token.expiresAt < new Date() ||
    token.user.status !== "INVITED"
  ) {
    await audit({
      action: "auth.activation_failed",
      actorId: token?.userId ?? null,
      requestId, ip, userAgent,
      meta: { reason: !token ? "invalid_or_expired_token" : token.user.status !== "INVITED" ? "user_not_invited" : "invalid_or_expired_token" },
    });
    return {
      response: NextResponse.json(
        { error: "This activation link is invalid or has expired. Try logging in to receive a fresh one.", requestId },
        { status: 400 }
      ),
      actorId: token?.userId ?? null,
    };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await db.$transaction(async (tx) => {
    await tx.authToken.update({ where: { id: token.id }, data: { usedAt: new Date() } });
    // Invalidate any other outstanding activation tokens for this user.
    await tx.authToken.updateMany({
      where: { userId: token.userId, purpose: "ACTIVATION", usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.user.update({
      where: { id: token.userId },
      data: { passwordHash, status: "ACTIVE", failedLogins: 0, lockedUntil: null },
    });
    await audit(
      {
        action: "auth.account_activated",
        actorId: token.userId,
        entityType: "User",
        entityId: token.userId,
        requestId, ip, userAgent,
      },
      tx
    );
  });

  await createSession(token.userId, ip, userAgent);
  return { response: NextResponse.json({ ok: true, requestId }), actorId: token.userId };
});
