import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, HttpError } from "@/lib/auth/guard";
import { updateUserSchema } from "@/lib/validation/admin";
import { audit } from "@/lib/audit/audit";
import type { Prisma } from "@/generated/prisma/client";

export const PATCH = guarded("users:manage", async (ctx, params) => {
  const id = params?.id;
  if (!id) throw new HttpError(400, "Missing user id");
  const parsed = updateUserSchema.safeParse(await ctx.req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid body");

  const before = await db.user.findUnique({ where: { id }, include: { roles: true } });
  if (!before) throw new HttpError(404, "User not found");

  // Guardrail: an admin cannot suspend themselves or strip their own roles.
  if (id === ctx.user.id && (parsed.data.status === "SUSPENDED" || parsed.data.roleIds)) {
    throw new HttpError(400, "You cannot change your own status or roles");
  }

  if (parsed.data.roleIds) {
    const roles = await db.role.findMany({ where: { id: { in: parsed.data.roleIds } } });
    if (roles.length !== parsed.data.roleIds.length) {
      throw new HttpError(400, "One or more role ids do not exist");
    }
  }

  const after = await db.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id },
      data: {
        fullName: parsed.data.fullName,
        status: parsed.data.status,
        attributes: parsed.data.attributes as Prisma.InputJsonValue | undefined,
        ...(parsed.data.roleIds
          ? { roles: { set: parsed.data.roleIds.map((rid) => ({ id: rid })) } }
          : {}),
      },
      include: { roles: true },
    });
    if (parsed.data.status === "SUSPENDED") {
      await tx.authSession.deleteMany({ where: { userId: id } }); // kill live sessions
      // Also revoke outstanding tokens (activation/password-reset) — otherwise a
      // suspended-but-not-yet-activated user could still activate via an email
      // link issued before the suspension. (activate/route.ts independently
      // re-checks the user's current status too, but a token should be dead on
      // suspension, not just rejected at use time.)
      await tx.authToken.updateMany({
        where: { userId: id, usedAt: null },
        data: { usedAt: new Date() },
      });
    }
    await audit(
      {
        action: "users.updated",
        actorId: ctx.user.id,
        entityType: "User",
        entityId: id,
        before: { fullName: before.fullName, status: before.status, roles: before.roles.map(r => r.name), attributes: before.attributes },
        after: { fullName: u.fullName, status: u.status, roles: u.roles.map(r => r.name), attributes: u.attributes },
        requestId: ctx.requestId, ip: ctx.ip, userAgent: ctx.userAgent,
      },
      tx
    );
    return u;
  });

  return NextResponse.json({ id: after.id, status: after.status });
});
