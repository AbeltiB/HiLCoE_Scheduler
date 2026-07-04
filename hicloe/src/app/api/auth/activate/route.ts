import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { hashPassword } from "@/lib/auth/password";
import { sha256 } from "@/lib/auth/tokens";
import { createSession } from "@/lib/auth/session";
import { activateSchema } from "@/lib/validation/auth";

export async function POST(req: NextRequest) {
  const requestId = randomUUID();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const userAgent = req.headers.get("user-agent") ?? undefined;

  const parsed = activateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request", requestId },
      { status: 400 }
    );
  }

  const token = await db.authToken.findUnique({
    where: { tokenHash: sha256(parsed.data.token) },
    include: { user: true },
  });
  if (!token || token.purpose !== "ACTIVATION" || token.usedAt || token.expiresAt < new Date()) {
    await audit({ action: "auth.activation_failed", requestId, ip, userAgent, meta: { reason: "invalid_or_expired_token" } });
    return NextResponse.json(
      { error: "This activation link is invalid or has expired. Try logging in to receive a fresh one.", requestId },
      { status: 400 }
    );
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
  return NextResponse.json({ ok: true, requestId });
}
