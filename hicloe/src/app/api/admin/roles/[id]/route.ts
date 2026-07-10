import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, HttpError } from "@/lib/auth/guard";
import { roleSchema } from "@/lib/validation/admin";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { audit } from "@/lib/audit/audit";

export const PATCH = guarded("roles:manage", async (ctx, params) => {
  const id = params?.id;
  if (!id) throw new HttpError(400, "Missing role id");
  const parsed = roleSchema.partial().safeParse(await ctx.req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid body");

  const before = await db.role.findUnique({ where: { id }, include: { permissions: true } });
  if (!before) throw new HttpError(404, "Role not found");
  if (before.system) {
    if (parsed.data.name) throw new HttpError(400, "System roles cannot be renamed");
    if (parsed.data.permissionActions) throw new HttpError(400, "System role permissions cannot be changed");
  }

  let perms: { id: string }[] | undefined;
  if (parsed.data.permissionActions) {
    const valid = new Set<string>([...PERMISSIONS, "*"]);
    const bad = parsed.data.permissionActions.filter((a) => !valid.has(a));
    if (bad.length) throw new HttpError(400, `Unknown permissions: ${bad.join(", ")}`);

    // Holding roles:manage is not itself enough to grant a permission the
    // actor doesn't have — otherwise any roles:manage holder could edit any
    // role (including their own) up to "*" and self-escalate.
    if (!ctx.user.permissions.has("*")) {
      const ungranted = parsed.data.permissionActions.filter((a) => !ctx.user.permissions.has(a));
      if (ungranted.length) {
        throw new HttpError(403, `Cannot grant permission(s) you don't hold: ${ungranted.join(", ")}`);
      }
    }
    perms = await db.permission.findMany({ where: { action: { in: parsed.data.permissionActions } } });
  }

  await db.$transaction(async (tx) => {
    await tx.role.update({
      where: { id },
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        ...(perms ? { permissions: { set: perms.map((p) => ({ id: p.id })) } } : {}),
      },
    });
    await audit(
      {
        action: "roles.updated", actorId: ctx.user.id,
        entityType: "Role", entityId: id,
        before: { name: before.name, permissions: before.permissions.map(p => p.action) },
        after: { name: parsed.data.name ?? before.name, permissions: parsed.data.permissionActions ?? before.permissions.map(p => p.action) },
        requestId: ctx.requestId, ip: ctx.ip, userAgent: ctx.userAgent,
      },
      tx
    );
  });
  return NextResponse.json({ ok: true });
});

export const DELETE = guarded("roles:manage", async (ctx, params) => {
  const id = params?.id;
  if (!id) throw new HttpError(400, "Missing role id");
  const role = await db.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
  if (!role) throw new HttpError(404, "Role not found");
  if (role.system) throw new HttpError(400, "System roles cannot be deleted");
  if (role._count.users > 0) throw new HttpError(409, `Role is assigned to ${role._count.users} user(s)`);

  await db.$transaction(async (tx) => {
    await tx.role.delete({ where: { id } });
    await audit(
      { action: "roles.deleted", actorId: ctx.user.id, entityType: "Role", entityId: id, before: { name: role.name }, requestId: ctx.requestId, ip: ctx.ip, userAgent: ctx.userAgent },
      tx
    );
  });
  return NextResponse.json({ ok: true });
});
