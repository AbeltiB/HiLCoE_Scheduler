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
