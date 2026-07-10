import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit/audit";
import { publicRoute, type PublicRouteResult } from "@/lib/audit/access-log";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { newOpaqueToken } from "@/lib/auth/tokens";
import { sendActivationEmail } from "@/lib/email/templates";
import { loginSchema } from "@/lib/validation/auth";
import { isRateLimited } from "@/lib/auth/rate-limit";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
// Per-account lockout (above) doesn't stop low-and-slow credential stuffing
// spread across many different emails from one source — this caps total
// login volume per IP regardless of which account each attempt targets.
const IP_MAX_ATTEMPTS = 30;
const IP_WINDOW_MS = 5 * 60_000;

// Constant response for wrong email / wrong password / suspended — no oracle.
const invalid = (requestId: string) =>
  NextResponse.json({ error: "Invalid email or password", requestId }, { status: 401 });

export const POST = publicRoute(async (req, { requestId, ip, userAgent }): Promise<PublicRouteResult> => {
  if (ip && isRateLimited(`login:${ip}`, IP_MAX_ATTEMPTS, IP_WINDOW_MS)) {
    await audit({ action: "auth.login_rate_limited", requestId, ip, userAgent });
    return {
      response: NextResponse.json({ error: "Too many attempts from this address. Try again later.", requestId }, { status: 429 }),
    };
  }
  const parsed = loginSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return { response: NextResponse.json({ error: "Invalid request body", requestId }, { status: 400 }) };
  }
  const email = parsed.data.email.toLowerCase().trim();
  const user = await db.user.findUnique({ where: { email } });

  if (!user) {
    // Hash anyway to equalize timing between unknown-email and wrong-password.
    await hashPassword(parsed.data.password);
    await audit({ action: "auth.login_failed", requestId, ip, userAgent, meta: { email, reason: "unknown_email" } });
    return { response: invalid(requestId), actorId: null };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await audit({ action: "auth.login_locked", actorId: user.id, requestId, ip, userAgent });
    return {
      response: NextResponse.json(
        { error: "Too many attempts. Try again later.", requestId },
        { status: 429 }
      ),
      actorId: user.id,
    };
  }

  // Registered-but-not-activated: (re)issue activation and tell them to check email.
  // Rate-limited the same as failed password attempts so this can't be used as an
  // unlimited enumeration/mail-bomb oracle against invited accounts.
  if (user.status === "INVITED") {
    const failed = user.failedLogins + 1;
    const locked = failed >= MAX_FAILED;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLogins: failed,
        lockedUntil: locked ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    if (locked) {
      await audit({ action: "auth.login_locked", actorId: user.id, requestId, ip, userAgent });
      return {
        response: NextResponse.json(
          { error: "Too many attempts. Try again later.", requestId },
          { status: 429 }
        ),
        actorId: user.id,
      };
    }

    const { raw, hash } = newOpaqueToken();
    await db.authToken.create({
      data: {
        tokenHash: hash,
        purpose: "ACTIVATION",
        userId: user.id,
        expiresAt: new Date(Date.now() + env.ACTIVATION_TOKEN_TTL_HOURS * 3600_000),
      },
    });
    await sendActivationEmail(user.email, user.fullName, raw).catch(() => {});
    await audit({ action: "auth.activation_resent", actorId: user.id, requestId, ip, userAgent });
    return {
      response: NextResponse.json(
        {
          pendingActivation: true,
          message: "Your account isn't activated yet. We've sent an activation link to your email — set your password there first.",
          requestId,
        },
        { status: 403 }
      ),
      actorId: user.id,
    };
  }

  if (user.status === "SUSPENDED" || !user.passwordHash) {
    await audit({ action: "auth.login_failed", actorId: user.id, requestId, ip, userAgent, meta: { reason: "suspended_or_no_password" } });
    return { response: invalid(requestId), actorId: user.id };
  }

  const ok = await verifyPassword(user.passwordHash, parsed.data.password);
  if (!ok) {
    const failed = user.failedLogins + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLogins: failed,
        lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    await audit({ action: "auth.login_failed", actorId: user.id, requestId, ip, userAgent, meta: { failed } });
    return { response: invalid(requestId), actorId: user.id };
  }

  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  await createSession(user.id, ip, userAgent);
  await audit({ action: "auth.login", actorId: user.id, requestId, ip, userAgent });
  return { response: NextResponse.json({ ok: true, requestId }), actorId: user.id };
});
