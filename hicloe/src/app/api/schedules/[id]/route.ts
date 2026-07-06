import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, HttpError } from "@/lib/auth/guard";
import { audit } from "@/lib/audit/audit";

export const GET = guarded("entities:read", async (_ctx, params) => {
  const row = await db.schedule.findUnique({
    where: { id: params?.id },
    include: {
      period: true,
      slotTemplate: { select: { id: true, name: true } },
      constraintConfig: true,
      versions: {
        orderBy: { number: "desc" },
        select: {
          id: true, number: true, createdAt: true, objectivePenalty: true, notes: true,
          createdBy: { select: { fullName: true } },
          solverResponse: true,
          _count: { select: { sessions: true } },
        },
      },
    },
  });
  if (!row) throw new HttpError(404, "Schedule not found");
  // Trim heavy fields: keep only status + infeasibility summary from responses.
  const versions = row.versions.map((v) => {
    const resp = v.solverResponse as any;
    return {
      id: v.id, number: v.number, createdAt: v.createdAt,
      objectivePenalty: v.objectivePenalty, notes: v.notes,
      createdBy: v.createdBy, sessionCount: v._count.sessions,
      solverStatus: resp?.status ?? null,
      infeasibility: resp?.infeasibility ?? null,
    };
  });
  return NextResponse.json({ row: { ...row, versions, solverResponse: undefined } });
});

export const DELETE = guarded("schedule:configure", async (ctx, params) => {
  const id = params?.id;
  const row = await db.schedule.findUnique({
    where: { id }, include: { _count: { select: { versions: true } } },
  });
  if (!row) throw new HttpError(404, "Schedule not found");
  if (row.state === "PUBLISHED") throw new HttpError(409, "Published schedules cannot be deleted");
  if (row._count.versions > 0) throw new HttpError(409, "Schedule has generated versions — archive instead of deleting");
  await db.$transaction(async (tx) => {
    await tx.constraintConfig.deleteMany({ where: { scheduleId: id } });
    await tx.schedule.delete({ where: { id } });
    await audit(
      { action: "schedule.deleted", actorId: ctx.user.id, entityType: "Schedule", entityId: id!,
        before: { periodId: row.periodId, state: row.state },
        requestId: ctx.requestId, ip: ctx.ip, userAgent: ctx.userAgent },
      tx
    );
  });
  return NextResponse.json({ ok: true });
});
