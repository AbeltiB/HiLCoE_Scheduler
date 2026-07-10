import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, HttpError } from "@/lib/auth/guard";
import { slotTemplateSchema } from "@/lib/validation/entities";
import { audit } from "@/lib/audit/audit";

export const GET = guarded("entities:read", async (_ctx, params) => {
  const row = await db.slotTemplate.findUnique({
    where: { id: params?.id },
    include: { slots: { orderBy: [{ day: "asc" }, { index: "asc" }] } },
  });
  if (!row || row.deletedAt) throw new HttpError(404, "Template not found");
  return NextResponse.json({ row });
});

export const PATCH = guarded("entities:write", async (ctx, params) => {
  const id = params?.id;
  if (!id) throw new HttpError(400, "Missing id");
  const parsed = slotTemplateSchema.partial().safeParse(await ctx.req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid body");
  const before = await db.slotTemplate.findUnique({ where: { id } });
  if (!before || before.deletedAt) throw new HttpError(404, "Template not found");

  await db.$transaction(async (tx) => {
    if (parsed.data.active) await tx.slotTemplate.updateMany({ where: { deletedAt: null }, data: { active: false } });
    await tx.slotTemplate.update({ where: { id }, data: parsed.data });
    await audit(
      { action: "slotTemplate.updated", actorId: ctx.user.id, entityType: "SlotTemplate", entityId: id, before, after: parsed.data, requestId: ctx.requestId, ip: ctx.ip, userAgent: ctx.userAgent },
      tx
    );
  });
  return NextResponse.json({ ok: true });
});

export const DELETE = guarded("entities:write", async (ctx, params) => {
  const id = params?.id;
  if (!id) throw new HttpError(400, "Missing id");
  const before = await db.slotTemplate.findUnique({ where: { id }, include: { _count: { select: { schedules: true } } } });
  if (!before || before.deletedAt) throw new HttpError(404, "Template not found");
  if (before._count.schedules > 0) throw new HttpError(409, "Template is used by existing schedules");
  await db.$transaction(async (tx) => {
    // Soft delete — historical Assignments RESTRICT-block ever hard-deleting
    // a template's SlotDefs, so a hard delete here would just throw a raw
    // FK-violation the moment any schedule had ever used it.
    await tx.slotTemplate.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    await audit(
      { action: "slotTemplate.deleted", actorId: ctx.user.id, entityType: "SlotTemplate", entityId: id, before: { name: before.name }, meta: { soft: true }, requestId: ctx.requestId, ip: ctx.ip, userAgent: ctx.userAgent },
      tx
    );
  });
  return NextResponse.json({ ok: true });
});
