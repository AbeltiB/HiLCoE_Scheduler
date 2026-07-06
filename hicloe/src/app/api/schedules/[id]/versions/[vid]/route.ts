import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, HttpError } from "@/lib/auth/guard";

/** Everything the timetable grid needs, in one call. */
export const GET = guarded("entities:read", async (_ctx, params) => {
  const { id: scheduleId, vid: versionId } = params ?? {};
  const version = await db.scheduleVersion.findUnique({
    where: { id: versionId },
    include: {
      schedule: {
        include: { period: true, slotTemplate: { include: { slots: true } } },
      },
      sessions: {
        include: {
          assignment: true,
          offering: { include: { course: true, batch: { include: { program: true } } } },
        },
      },
    },
  });
  if (!version || version.scheduleId !== scheduleId) throw new HttpError(404, "Version not found");

  // Display names for units and instructors.
  const batches = await db.batch.findMany({
    where: { periodId: version.schedule.periodId },
    include: { sections: { include: { groups: true } } },
  });
  const unitName = new Map<string, string>();
  for (const b of batches) {
    for (const sec of b.sections) {
      unitName.set(sec.id, `${b.name}/${sec.name}`);
      for (const g of sec.groups) unitName.set(g.id, `${b.name}/${sec.name}-${g.name}`);
    }
  }
  const instructors = await db.instructor.findMany({ select: { id: true, fullName: true } });
  const rooms = await db.room.findMany({ where: { deletedAt: null, active: true } });
  const resp = version.solverResponse as any;

  return NextResponse.json({
    schedule: {
      id: version.schedule.id, state: version.schedule.state,
      period: version.schedule.period.name,
    },
    version: { id: version.id, number: version.number, objectivePenalty: version.objectivePenalty },
    solver: resp ? { status: resp.status, objective: resp.objective, infeasibility: resp.infeasibility } : null,
    slots: version.schedule.slotTemplate.slots,
    rooms,
    instructors,
    unitNames: Object.fromEntries(unitName),
    sessions: version.sessions.map((s) => ({
      id: s.id, kind: s.kind, periods: s.periods,
      audienceUnits: s.audienceUnits, instructorIds: s.instructorIds,
      course: { code: s.offering.course.code, name: s.offering.course.name },
      batch: `${s.offering.batch.program.code} ${s.offering.batch.name}`,
      assignment: s.assignment,
    })),
  });
});
