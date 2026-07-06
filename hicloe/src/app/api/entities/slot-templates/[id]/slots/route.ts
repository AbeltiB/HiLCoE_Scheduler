import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, HttpError } from "@/lib/auth/guard";
import { slotsBulkSchema } from "@/lib/validation/entities";
import { audit } from "@/lib/audit/audit";

/** PUT: replace the template's whole slot grid (the builder saves atomically). */
export const PUT = guarded("entities:write", async (ctx, params) => {
  const templateId = params?.id;
  if (!templateId) throw new HttpError(400, "Missing template id");
  const parsed = slotsBulkSchema.safeParse(await ctx.req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid body");

  const seen = new Set<string>();
  for (const s of parsed.data.slots) {
    const key = `${s.day}-${s.index}`;
    if (seen.has(key)) throw new HttpError(400, `Duplicate slot day ${s.day} period ${s.index}`);
    seen.add(key);
    if (s.endTime <= s.startTime) throw new HttpError(400, `Slot day ${s.day} P${s.index}: end must be after start`);
  }

  const before = await db.slotDef.findMany({ where: { templateId } });
  await db.$transaction(async (tx) => {
    await tx.slotDef.deleteMany({ where: { templateId } });
    await tx.slotDef.createMany({
      data: parsed.data.slots.map((s) => ({ ...s, templateId })),
    });
    await audit(
      {
        action: "slotTemplate.slots_replaced", actorId: ctx.user.id,
        entityType: "SlotTemplate", entityId: templateId,
        before: { count: before.length }, after: { count: parsed.data.slots.length },
        requestId: ctx.requestId, ip: ctx.ip, userAgent: ctx.userAgent,
      },
      tx
    );
  });
  return NextResponse.json({ ok: true });
});
