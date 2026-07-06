import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { guarded, HttpError } from "@/lib/auth/guard";
import { compilePayload } from "@/lib/schedule/compile";
import { solverSubmitJob } from "@/lib/schedule/solver-client";
import { audit } from "@/lib/audit/audit";
import type { Prisma } from "@/generated/prisma/client";

const GENERATABLE = ["DRAFT", "GENERATED", "FAILED"];

export const POST = guarded("schedule:generate", async (ctx, params) => {
  const scheduleId = params?.id;
  if (!scheduleId) throw new HttpError(400, "Missing schedule id");
  const schedule = await db.schedule.findUnique({ where: { id: scheduleId } });
  if (!schedule) throw new HttpError(404, "Schedule not found");
  if (!GENERATABLE.includes(schedule.state)) {
    throw new HttpError(409, `Cannot generate while schedule is ${schedule.state}`);
  }

  const versionId = randomUUID(); // doubles as the solver job id
  const { payload, sessionRows } = await compilePayload(scheduleId, versionId);

  await db.$transaction(async (tx) => {
    const last = await tx.scheduleVersion.findFirst({
      where: { scheduleId }, orderBy: { number: "desc" }, select: { number: true },
    });
    await tx.scheduleVersion.create({
      data: {
        id: versionId,
        scheduleId,
        number: (last?.number ?? 0) + 1,
        createdById: ctx.user.id,
        solverRequest: payload as Prisma.InputJsonValue,
      },
    });
    await tx.scheduleSession.createMany({
      data: sessionRows.map((s) => ({
        id: s.id, versionId, offeringId: s.offeringId, kind: s.kind, periods: s.periods,
        audienceUnits: s.audienceUnits as unknown as Prisma.InputJsonValue,
        instructorIds: s.instructorIds as unknown as Prisma.InputJsonValue,
      })),
    });
    await tx.schedule.update({ where: { id: scheduleId }, data: { state: "GENERATING" } });
    await audit(
      { action: "schedule.generation_started", actorId: ctx.user.id,
        entityType: "ScheduleVersion", entityId: versionId,
        meta: { scheduleId, sessions: sessionRows.length, pins: (payload.pins as unknown[]).length },
        requestId: ctx.requestId, ip: ctx.ip, userAgent: ctx.userAgent },
      tx
    );
  });

  try {
    await solverSubmitJob(payload);
  } catch (e) {
    await db.schedule.update({ where: { id: scheduleId }, data: { state: "FAILED" } });
    await ctx.log({ action: "schedule.generation_submit_failed", entityType: "ScheduleVersion", entityId: versionId });
    throw e;
  }
  return NextResponse.json({ versionId }, { status: 202 });
});
