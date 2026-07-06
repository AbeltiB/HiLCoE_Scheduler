import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, HttpError } from "@/lib/auth/guard";
import { slotTemplateSchema } from "@/lib/validation/entities";
import { audit } from "@/lib/audit/audit";

export const GET = guarded("entities:read", async () => {
  const rows = await db.slotTemplate.findMany({
    include: { _count: { select: { slots: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ rows });
});

export const POST = guarded("entities:write", async (ctx) => {
  const parsed = slotTemplateSchema.safeParse(await ctx.req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid body");
  const row = await db.$transaction(async (tx) => {
    if (parsed.data.active) {
      await tx.slotTemplate.updateMany({ data: { active: false } }); // single active template
    }
    const created = await tx.slotTemplate.create({ data: parsed.data });
    await audit(
      { action: "slotTemplate.created", actorId: ctx.user.id, entityType: "SlotTemplate", entityId: created.id, after: parsed.data, requestId: ctx.requestId, ip: ctx.ip, userAgent: ctx.userAgent },
      tx
    );
    return created;
  });
  return NextResponse.json({ row }, { status: 201 });
});
