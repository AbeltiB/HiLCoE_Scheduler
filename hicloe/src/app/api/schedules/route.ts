import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, HttpError } from "@/lib/auth/guard";
import { scheduleSchema } from "@/lib/validation/entities";
import { audit } from "@/lib/audit/audit";

export const GET = guarded("entities:read", async () => {
  const rows = await db.schedule.findMany({
    include: {
      period: true,
      slotTemplate: { select: { id: true, name: true } },
      _count: { select: { versions: true } },
      versions: {
        orderBy: { number: "desc" },
        take: 1,
        select: { id: true, number: true, solverResponse: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  // Shaped for the list UI's "jump straight to the timetable" quick link —
  // solverResponse itself is a large solver-reproducibility payload that
  // never needs to leave this route.
  const shaped = rows.map(({ versions, ...r }) => ({
    ...r,
    latestVersion: versions[0]
      ? { id: versions[0].id, number: versions[0].number, solverStatus: (versions[0].solverResponse as { status?: string } | null)?.status ?? null }
      : null,
  }));
  return NextResponse.json({ rows: shaped });
});

export const POST = guarded("schedule:configure", async (ctx) => {
  const parsed = scheduleSchema.safeParse(await ctx.req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid body");
  const d = parsed.data;

  const period = await db.academicPeriod.findUnique({ where: { id: d.periodId } });
  if (!period) throw new HttpError(404, "Academic period not found");
  const template = await db.slotTemplate.findUnique({
    where: { id: d.slotTemplateId }, include: { _count: { select: { slots: true } } },
  });
  if (!template) throw new HttpError(404, "Slot template not found");
  if (template._count.slots === 0) throw new HttpError(409, "Slot template has no slots — build its grid first");

  const row = await db.$transaction(async (tx) => {
    const created = await tx.schedule.create({
      data: {
        periodId: d.periodId,
        slotTemplateId: d.slotTemplateId,
        effectiveFrom: d.effectiveFrom ?? period.startDate,
        effectiveTo: d.effectiveTo ?? period.endDate,
        constraintConfig: { create: {} },
      },
    });
    await audit(
      { action: "schedule.created", actorId: ctx.user.id, entityType: "Schedule", entityId: created.id,
        after: { periodId: d.periodId, slotTemplateId: d.slotTemplateId },
        requestId: ctx.requestId, ip: ctx.ip, userAgent: ctx.userAgent },
      tx
    );
    return created;
  });
  return NextResponse.json({ row }, { status: 201 });
});
