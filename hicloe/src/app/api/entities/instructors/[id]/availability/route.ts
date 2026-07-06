import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, HttpError } from "@/lib/auth/guard";
import { availabilityBulkSchema } from "@/lib/validation/entities";
import { audit } from "@/lib/audit/audit";

/** GET: availability rows for the instructor (joined to active template slots). */
export const GET = guarded("entities:read", async (_ctx, params) => {
  const instructorId = params?.id;
  if (!instructorId) throw new HttpError(400, "Missing instructor id");
  const rows = await db.instructorAvailability.findMany({ where: { instructorId } });
  return NextResponse.json({ rows });
});

/**
 * PUT: replace the availability grid. Editable by schedulers (entities:write)
 * or by the instructor themself (availability:edit_own via ABAC).
 */
export const PUT = guarded(null, async (ctx, params) => {
  const instructorId = params?.id;
  if (!instructorId) throw new HttpError(400, "Missing instructor id");

  const isOwn = ctx.user.attributes["instructorId"] === instructorId;
  if (isOwn) await ctx.authorize("availability:edit_own", { instructorId });
  else await ctx.authorize("entities:write");

  const parsed = availabilityBulkSchema.safeParse(await ctx.req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid body");

  const before = await db.instructorAvailability.findMany({ where: { instructorId } });
  await db.$transaction(async (tx) => {
    await tx.instructorAvailability.deleteMany({ where: { instructorId } });
    await tx.instructorAvailability.createMany({
      data: parsed.data.entries.map((e) => ({ instructorId, ...e })),
    });
    await audit(
      {
        action: "instructor.availability_updated", actorId: ctx.user.id,
        entityType: "Instructor", entityId: instructorId,
        before: { entries: before }, after: { entries: parsed.data.entries },
        requestId: ctx.requestId, ip: ctx.ip, userAgent: ctx.userAgent,
      },
      tx
    );
  });
  return NextResponse.json({ ok: true });
});
