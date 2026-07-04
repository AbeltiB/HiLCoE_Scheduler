import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { guarded, HttpError } from "@/lib/auth/guard";
import { createUserSchema } from "@/lib/validation/admin";
import { newOpaqueToken } from "@/lib/auth/tokens";
import { sendActivationEmail } from "@/lib/email/templates";
import { audit } from "@/lib/audit/audit";
import type { Prisma } from "@/generated/prisma/client";

export const GET = guarded("users:manage", async () => {
  const users = await db.user.findMany({
    select: {
      id: true, fullName: true, email: true, status: true,
      attributes: true, createdAt: true,
      roles: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ users });
});

/**
 * Registration-first flow: the admin creates the account (no password).
 * The user receives an activation email; setting a password activates it.
 */
export const POST = guarded("users:manage", async (ctx) => {
  const parsed = createUserSchema.safeParse(await ctx.req.json().catch(() => ({})));
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid body");
  }
  const email = parsed.data.email.toLowerCase().trim();

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) throw new HttpError(409, "A user with this email already exists");

  const roles = await db.role.findMany({ where: { id: { in: parsed.data.roleIds } } });
  if (roles.length !== parsed.data.roleIds.length) {
    throw new HttpError(400, "One or more role ids do not exist");
  }

  const { raw, hash } = newOpaqueToken();
  const user = await db.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        fullName: parsed.data.fullName,
        email,
        status: "INVITED",
        attributes: parsed.data.attributes as Prisma.InputJsonValue,
        roles: { connect: roles.map((r) => ({ id: r.id })) },
      },
    });
    await tx.authToken.create({
      data: {
        tokenHash: hash,
        purpose: "ACTIVATION",
        userId: u.id,
        expiresAt: new Date(Date.now() + env.ACTIVATION_TOKEN_TTL_HOURS * 3600_000),
      },
    });
    await audit(
      {
        action: "users.created",
        actorId: ctx.user.id,
        entityType: "User",
        entityId: u.id,
        after: { fullName: u.fullName, email: u.email, roles: roles.map((r) => r.name), attributes: parsed.data.attributes },
        requestId: ctx.requestId, ip: ctx.ip, userAgent: ctx.userAgent,
      },
      tx
    );
    return u;
  });

  // Send outside the transaction; a mail hiccup shouldn't roll back the account.
  let emailSent = true;
  try {
    await sendActivationEmail(email, user.fullName, raw);
  } catch {
    emailSent = false;
    await ctx.log({ action: "users.invite_email_failed", entityType: "User", entityId: user.id });
  }

  return NextResponse.json({ id: user.id, emailSent }, { status: 201 });
});
