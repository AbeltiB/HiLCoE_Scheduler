import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, HttpError } from "@/lib/auth/guard";
import { roleSchema } from "@/lib/validation/admin";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { audit } from "@/lib/audit/audit";

export const GET = guarded("roles:manage", async () => {
  const roles = await db.role.findMany({
    include: { permissions: true, _count: { select: { users: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ roles, catalog: PERMISSIONS });
});

export const POST = guarded("roles:manage", async (ctx) => {
  const parsed = roleSchema.safeParse(await ctx.req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid body");

  const valid = new Set<string>([...PERMISSIONS, "*"]);
  const bad = parsed.data.permissionActions.filter((a) => !valid.has(a));
  if (bad.length) throw new HttpError(400, `Unknown permissions: ${bad.join(", ")}`);

  const perms = await db.permission.findMany({ where: { action: { in: parsed.data.permissionActions } } });
  const role = await db.$transaction(async (tx) => {
    const r = await tx.role.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        permissions: { connect: perms.map((p) => ({ id: p.id })) },
      },
    });
    await audit(
      {
        action: "roles.created", actorId: ctx.user.id,
        entityType: "Role", entityId: r.id,
        after: { name: r.name, permissions: parsed.data.permissionActions },
        requestId: ctx.requestId, ip: ctx.ip, userAgent: ctx.userAgent,
      },
      tx
    );
    return r;
  });
  return NextResponse.json({ id: role.id }, { status: 201 });
});
