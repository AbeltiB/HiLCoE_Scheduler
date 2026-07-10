import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { HttpError } from "@/lib/auth/guard";

/**
 * Compiles the database into a contract v1.0 SolveRequest.
 *
 * Responsibilities:
 *  - expand offerings into sessions (per-section lectures or shared; per-group
 *    labs, double periods, co-teaching instructor sets, lab-after-lecture links)
 *  - compile instructor availability (FT default-available, PT default-not,
 *    explicit rows override either way)
 *  - external occupancy: rooms/instructors taken by other PUBLISHED schedules
 *    whose date ranges overlap (term vs semester coexistence), mapped across
 *    slot templates via (day, index)
 *  - carry pinned assignments from the schedule's latest version onto the
 *    matching new sessions (signature-based, since session rows are re-created)
 */

export type SessionRow = {
  id: string;
  offeringId: string;
  kind: "LECTURE" | "LAB";
  periods: number;
  audienceUnits: { kind: "SECTION" | "GROUP"; id: string }[];
  instructorIds: string[];
};

export type CompiledPayload = {
  payload: Record<string, unknown>;
  sessionRows: SessionRow[];
};

export async function loadSchedule(scheduleId: string) {
  const schedule = await db.schedule.findUnique({
    where: { id: scheduleId },
    include: {
      period: true,
      slotTemplate: { include: { slots: true } },
      constraintConfig: true,
    },
  });
  if (!schedule) throw new HttpError(404, "Schedule not found");
  return schedule;
}

export async function compilePayload(scheduleId: string, jobId: string): Promise<CompiledPayload> {
  const schedule = await loadSchedule(scheduleId);
  const slots = schedule.slotTemplate.slots;
  if (slots.length === 0) throw new HttpError(409, "Slot template has no slots — build the grid first");

  const batches = await db.batch.findMany({
    where: { periodId: schedule.periodId, deletedAt: null },
    include: {
      program: true,
      sections: { where: { deletedAt: null }, include: { groups: { where: { deletedAt: null } } } },
    },
  });
  if (batches.length === 0) throw new HttpError(409, "No batches exist for this academic period");

  const offerings = await db.courseOffering.findMany({
    where: { batchId: { in: batches.map((b) => b.id) }, deletedAt: null },
    include: {
      course: true,
      sections: { where: { deletedAt: null }, include: { groups: { where: { deletedAt: null } } } },
      instructors: true,
    },
  });
  if (offerings.length === 0) throw new HttpError(409, "No course offerings exist for this period's batches");

  const rooms = await db.room.findMany({ where: { deletedAt: null, active: true } });
  const instructors = await db.instructor.findMany({
    where: { deletedAt: null },
    include: { availability: true },
  });

  // ── student units ──
  const units: { id: string; kind: "SECTION" | "GROUP"; parent_id: string | null; headcount: number; audience: "UG" | "PG" }[] = [];
  for (const b of batches) {
    for (const sec of b.sections) {
      units.push({ id: sec.id, kind: "SECTION", parent_id: null, headcount: sec.headcount, audience: b.program.level });
      for (const g of sec.groups) {
        units.push({ id: g.id, kind: "GROUP", parent_id: sec.id, headcount: g.headcount, audience: b.program.level });
      }
    }
  }

  // ── session expansion ──
  const sessionRows: SessionRow[] = [];
  const contractSessions: Record<string, unknown>[] = [];

  for (const off of offerings) {
    const lecIns = off.instructors.filter((i) => i.kind === "LECTURE").map((i) => i.instructorId);
    const labIns = off.instructors.filter((i) => i.kind === "LAB").map((i) => i.instructorId);
    const firstLectureBySection = new Map<string, string>();

    const emitLecture = (audienceSectionIds: string[]) => {
      for (let n = 0; n < off.course.lectureSessionsPerWeek; n++) {
        const id = randomUUID();
        sessionRows.push({
          id, offeringId: off.id, kind: "LECTURE", periods: 1,
          audienceUnits: audienceSectionIds.map((sid) => ({ kind: "SECTION" as const, id: sid })),
          instructorIds: lecIns,
        });
        contractSessions.push({
          id, offering_id: off.id, kind: "LECTURE", periods: 1,
          audience_unit_ids: audienceSectionIds, instructor_ids: lecIns,
          room_type: "LECTURE",
        });
        for (const sid of audienceSectionIds) {
          if (!firstLectureBySection.has(sid)) firstLectureBySection.set(sid, id);
        }
      }
    };

    if (off.course.lectureSessionsPerWeek > 0) {
      if (off.sharedLecture) emitLecture(off.sections.map((s) => s.id));
      else for (const sec of off.sections) emitLecture([sec.id]);
    }

    if (off.course.labSessionsPerWeek > 0) {
      const periods = off.course.labNeedsDoublePeriod ? 2 : 1;
      for (const sec of off.sections) {
        const groups = sec.groups.length > 0 ? sec.groups : [{ id: sec.id }]; // no groups → section labs together
        for (const g of groups) {
          for (let n = 0; n < off.course.labSessionsPerWeek; n++) {
            const id = randomUUID();
            const unitKind = sec.groups.length > 0 ? ("GROUP" as const) : ("SECTION" as const);
            sessionRows.push({
              id, offeringId: off.id, kind: "LAB", periods,
              audienceUnits: [{ kind: unitKind, id: g.id }],
              instructorIds: labIns,
            });
            contractSessions.push({
              id, offering_id: off.id, kind: "LAB", periods,
              audience_unit_ids: [g.id], instructor_ids: labIns,
              room_type: "LAB",
              week_order_after: n === 0 ? firstLectureBySection.get(sec.id) ?? null : null,
            });
          }
        }
      }
    }
  }

  // ── instructor availability compile ──
  // AvailabilityStatus is three-state: UNAVAILABLE removes the slot entirely
  // (hard), AVOID keeps it schedulable but also feeds avoid_slot_ids for the
  // solver's soft instructor_avoid_slot penalty, AVAILABLE is a no-op
  // confirmation. A slot with no override row at all falls back to the
  // employment default (full-time available, part-time not).
  const nonBlockedSlotIds = slots.filter((s) => !s.blocked).map((s) => s.id);
  const contractInstructors = instructors.map((ins) => {
    const rows = ins.availability.filter((a) => nonBlockedSlotIds.includes(a.slotDefId));
    const statusBySlot = new Map(rows.map((r) => [r.slotDefId, r.status]));
    let available: string[] | null;
    if (rows.length === 0) {
      available = ins.employment === "FULL_TIME" ? null : []; // PT with no grid = not schedulable (precheck flags it)
    } else {
      available = nonBlockedSlotIds.filter((sid) => {
        const status = statusBySlot.get(sid);
        return status === undefined ? ins.employment === "FULL_TIME" : status !== "UNAVAILABLE";
      });
    }
    const avoid = nonBlockedSlotIds.filter((sid) => statusBySlot.get(sid) === "AVOID");
    return { id: ins.id, employment: ins.employment, available_slot_ids: available, avoid_slot_ids: avoid };
  });

  // ── external occupancy from overlapping PUBLISHED schedules ──
  const external = await externalOccupancyFor(schedule.id, schedule.effectiveFrom, schedule.effectiveTo, slots);

  // ── pins carried over from the latest version (signature match) ──
  const pins: { session_id: string; slot_id: string | null; room_id: string | null }[] = [];
  const latest = await db.scheduleVersion.findFirst({
    where: { scheduleId: schedule.id },
    orderBy: { number: "desc" },
    include: { sessions: { include: { assignment: true } } },
  });
  if (latest) {
    const signature = (s: { offeringId: string; kind: string; audienceUnits: unknown }, seq: number) =>
      `${s.offeringId}|${s.kind}|${JSON.stringify(s.audienceUnits)}|${seq}`;
    const newBySig = new Map<string, string>();
    const counters = new Map<string, number>();
    for (const s of sessionRows) {
      const base = `${s.offeringId}|${s.kind}|${JSON.stringify(s.audienceUnits)}`;
      const seq = counters.get(base) ?? 0;
      counters.set(base, seq + 1);
      newBySig.set(signature(s, seq), s.id);
    }
    const oldCounters = new Map<string, number>();
    for (const s of latest.sessions) {
      const base = `${s.offeringId}|${s.kind}|${JSON.stringify(s.audienceUnits)}`;
      const seq = oldCounters.get(base) ?? 0;
      oldCounters.set(base, seq + 1);
      if (s.assignment?.pinned) {
        const target = newBySig.get(signature(s, seq));
        if (target) pins.push({ session_id: target, slot_id: s.assignment.slotDefId, room_id: s.assignment.roomId });
      }
    }
  }

  const cfg = schedule.constraintConfig;
  const weights = (cfg?.weights as Record<string, number>) ?? {};
  const options = (cfg?.options as Record<string, number>) ?? {};

  const payload = {
    contract_version: "1.0",
    job_id: jobId,
    config: {
      max_time_seconds: options.max_time_seconds ?? 60,
      num_workers: 8,
      weights: { ...weights },
      options: { instructor_max_periods_per_day: options.instructor_max_periods_per_day ?? 4 },
    },
    slots: slots.map((s) => ({
      id: s.id, day: s.day, index: s.index,
      start: s.startTime, end: s.endTime,
      audience: s.audience, blocked: s.blocked,
    })),
    rooms: rooms.map((r) => ({ id: r.id, type: r.type, capacity: r.capacity })),
    instructors: contractInstructors,
    student_units: units,
    sessions: contractSessions,
    pins,
    external_occupancy: external,
  };

  return { payload, sessionRows };
}

/** Rooms/instructors occupied by other PUBLISHED schedules overlapping the
 * date range, mapped onto this template's slots via (day, index). Shared by
 * the payload compiler and the manual-move validator. */
export async function externalOccupancyFor(
  scheduleId: string,
  from: Date,
  to: Date,
  mySlots: { id: string; day: number; index: number }[]
): Promise<{ resource: "ROOM" | "INSTRUCTOR"; id: string; slot_id: string }[]> {
  const external: { resource: "ROOM" | "INSTRUCTOR"; id: string; slot_id: string }[] = [];
  const overlapping = await db.schedule.findMany({
    where: {
      id: { not: scheduleId },
      state: "PUBLISHED",
      effectiveFrom: { lte: to },
      effectiveTo: { gte: from },
    },
    include: {
      slotTemplate: { include: { slots: true } },
      versions: {
        orderBy: { number: "desc" }, take: 1,
        include: { sessions: { include: { assignment: true } } },
      },
    },
  });
  const mine = new Map(mySlots.map((s) => [`${s.day}:${s.index}`, s.id]));
  for (const other of overlapping) {
    const theirSlotById = new Map<string, { id: string; day: number; index: number }>(
      other.slotTemplate.slots.map((s) => [s.id, s]));
    const version = other.versions[0];
    if (!version) continue;
    for (const sess of version.sessions) {
      if (!sess.assignment) continue;
      const start = theirSlotById.get(sess.assignment.slotDefId);
      if (!start) continue;
      const spans: { day: number; index: number }[] = [start];
      if (sess.periods === 2) {
        const next = other.slotTemplate.slots.find((s) => s.day === start.day && s.index === start.index + 1);
        if (next) spans.push(next);
      }
      for (const sp of spans) {
        const slotId = mine.get(`${sp.day}:${sp.index}`);
        if (!slotId) continue;
        external.push({ resource: "ROOM", id: sess.assignment.roomId, slot_id: slotId });
        for (const iid of (sess.instructorIds as string[]) ?? []) {
          external.push({ resource: "INSTRUCTOR", id: iid, slot_id: slotId });
        }
      }
    }
  }
  return external;
}
