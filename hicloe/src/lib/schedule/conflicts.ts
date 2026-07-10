import { db } from "@/lib/db";
import { HttpError } from "@/lib/auth/guard";
import { externalOccupancyFor, loadSchedule } from "@/lib/schedule/compile";

/**
 * Manual-move validation — the same hard rules the solver enforces, applied
 * to one proposed change against the current assignments of a version. Used
 * by the valid-moves endpoint (green cells) and the move endpoint (final
 * server-side check). One implementation, both call sites.
 */

type Slot = { id: string; day: number; index: number; startTime: string; endTime: string; audience: string[]; blocked: boolean };
type Sess = {
  id: string; kind: string; periods: number;
  audienceUnits: { kind: string; id: string }[];
  instructorIds: string[];
  offering: { course: { code: string } };
  assignment: { id: string; slotDefId: string; roomId: string; pinned: boolean } | null;
};

export type ValidationWorld = {
  versionId: string;
  slots: Slot[];
  slotById: Map<string, Slot>;
  successor: Map<string, string>;
  rooms: { id: string; type: string; capacity: number }[];
  sessions: Sess[];
  sessionById: Map<string, Sess>;
  audienceOfUnit: Map<string, "UG" | "PG">;
  headcountOfUnit: Map<string, number>;
  atomsOfUnit: Map<string, string[]>;
  avail: Map<string, Set<string> | null>; // null = fully available
  extRoom: Set<string>; // `${roomId}|${slotId}`
  extInstructor: Set<string>;
};

export async function buildValidationWorld(scheduleId: string, versionId: string): Promise<ValidationWorld> {
  const schedule = await loadSchedule(scheduleId);
  const version = await db.scheduleVersion.findUnique({
    where: { id: versionId },
    include: {
      sessions: {
        include: { assignment: true, offering: { include: { course: true } } },
      },
    },
  });
  if (!version || version.scheduleId !== scheduleId) throw new HttpError(404, "Version not found");

  const slots = schedule.slotTemplate.slots as unknown as Slot[];
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const successor = new Map<string, string>();
  const byDayIndex = new Map(slots.map((s) => [`${s.day}:${s.index}`, s.id]));
  for (const s of slots) {
    const nxt = byDayIndex.get(`${s.day}:${s.index + 1}`);
    if (nxt) successor.set(s.id, nxt);
  }

  const batches = await db.batch.findMany({
    where: { periodId: schedule.periodId, deletedAt: null },
    include: { program: true, sections: { include: { groups: true } } },
  });
  const audienceOfUnit = new Map<string, "UG" | "PG">();
  const headcountOfUnit = new Map<string, number>();
  const atomsOfUnit = new Map<string, string[]>();
  for (const b of batches) {
    for (const sec of b.sections) {
      audienceOfUnit.set(sec.id, b.program.level);
      headcountOfUnit.set(sec.id, sec.headcount);
      atomsOfUnit.set(sec.id, sec.groups.length ? sec.groups.map((g) => g.id) : [sec.id]);
      for (const g of sec.groups) {
        audienceOfUnit.set(g.id, b.program.level);
        headcountOfUnit.set(g.id, g.headcount);
        atomsOfUnit.set(g.id, [g.id]);
      }
    }
  }

  const instructors = await db.instructor.findMany({
    where: { deletedAt: null },
    include: { availability: true },
  });
  const nonBlocked = slots.filter((s) => !s.blocked).map((s) => s.id);
  const avail = new Map<string, Set<string> | null>();
  for (const ins of instructors) {
    const rows = ins.availability.filter((a) => slotById.has(a.slotDefId));
    if (rows.length === 0) {
      avail.set(ins.id, ins.employment === "FULL_TIME" ? null : new Set());
    } else {
      // UNAVAILABLE is the only status that removes a slot; AVAILABLE/AVOID
      // both leave it schedulable (AVOID is a soft solver preference, not a
      // hard conflict here).
      const statusBySlot = new Map(rows.map((r) => [r.slotDefId, r.status]));
      avail.set(ins.id, new Set(nonBlocked.filter((sid) => {
        const status = statusBySlot.get(sid);
        return status === undefined ? ins.employment === "FULL_TIME" : status !== "UNAVAILABLE";
      })));
    }
  }

  const external = await externalOccupancyFor(scheduleId, schedule.effectiveFrom, schedule.effectiveTo, slots);
  const extRoom = new Set(external.filter((e) => e.resource === "ROOM").map((e) => `${e.id}|${e.slot_id}`));
  const extInstructor = new Set(external.filter((e) => e.resource === "INSTRUCTOR").map((e) => `${e.id}|${e.slot_id}`));

  const sessions = version.sessions.map((s) => ({
    id: s.id, kind: s.kind, periods: s.periods,
    audienceUnits: s.audienceUnits as { kind: string; id: string }[],
    instructorIds: (s.instructorIds as string[]) ?? [],
    offering: { course: { code: s.offering.course.code } },
    assignment: s.assignment
      ? { id: s.assignment.id, slotDefId: s.assignment.slotDefId, roomId: s.assignment.roomId, pinned: s.assignment.pinned }
      : null,
  }));

  return {
    versionId,
    slots, slotById, successor,
    rooms: await db.room.findMany({ where: { deletedAt: null, active: true } }),
    sessions, sessionById: new Map(sessions.map((s) => [s.id, s])),
    audienceOfUnit, headcountOfUnit, atomsOfUnit,
    avail, extRoom, extInstructor,
  };
}

function occupiedSlots(w: ValidationWorld, session: Sess, startSlotId: string): string[] | null {
  if (session.periods === 1) return [startSlotId];
  const nxt = w.successor.get(startSlotId);
  return nxt ? [startSlotId, nxt] : null;
}

const atomsOfSession = (w: ValidationWorld, s: Sess): string[] =>
  s.audienceUnits.flatMap((u) => w.atomsOfUnit.get(u.id) ?? [u.id]);

/** null = move is valid; otherwise a human-readable rejection reason. */
export function checkMove(
  w: ValidationWorld,
  sessionId: string,
  slotDefId: string,
  roomId: string
): string | null {
  const session = w.sessionById.get(sessionId);
  if (!session) return "Unknown session";
  const occ = occupiedSlots(w, session, slotDefId);
  if (!occ) return "Double-period session needs a consecutive next period on the same day";

  const room = w.rooms.find((r) => r.id === roomId);
  if (!room) return "Unknown or inactive room";
  if (room.type !== (session.kind === "LAB" ? "LAB" : "LECTURE")) {
    return `Room ${roomId} is a ${room.type} room; this session needs ${session.kind === "LAB" ? "LAB" : "LECTURE"}`;
  }
  const headcount = session.audienceUnits.reduce((sum, u) => sum + (w.headcountOfUnit.get(u.id) ?? 0), 0);
  if (room.capacity < headcount) return `Room capacity ${room.capacity} < headcount ${headcount}`;

  const myAtoms = new Set(atomsOfSession(w, session));

  for (const slotId of occ) {
    const slot = w.slotById.get(slotId);
    if (!slot) return "Unknown slot";
    if (slot.blocked) return `Slot ${slot.day}/P${slot.index} is blocked`;
    for (const u of session.audienceUnits) {
      const aud = w.audienceOfUnit.get(u.id);
      if (aud && !slot.audience.includes(aud)) {
        return `Slot is not open to ${aud} students`;
      }
    }
    for (const iid of session.instructorIds) {
      const a = w.avail.get(iid);
      if (a !== null && a !== undefined && !a.has(slotId)) return `Instructor ${iid} is not available at this slot`;
      if (w.extInstructor.has(`${iid}|${slotId}`)) return `Instructor ${iid} teaches in another published schedule at this slot`;
    }
    if (w.extRoom.has(`${roomId}|${slotId}`)) return `Room is occupied by another published schedule at this slot`;

    for (const other of w.sessions) {
      if (other.id === session.id || !other.assignment) continue;
      const otherOcc = occupiedSlots(w, other, other.assignment.slotDefId) ?? [];
      if (!otherOcc.includes(slotId)) continue;
      if (other.assignment.roomId === roomId) {
        return `Room clash with ${other.offering.course.code} (${other.kind.toLowerCase()})`;
      }
      const otherAtoms = atomsOfSession(w, other);
      if (otherAtoms.some((a) => myAtoms.has(a))) {
        return `Student clash with ${other.offering.course.code} (${other.kind.toLowerCase()})`;
      }
      if (other.instructorIds.some((i) => session.instructorIds.includes(i))) {
        return `Instructor clash with ${other.offering.course.code}`;
      }
    }
  }
  return null;
}

/** All valid (slot, rooms[]) placements for a session in the current state. */
export function validMoves(w: ValidationWorld, sessionId: string): { slotDefId: string; roomIds: string[] }[] {
  const out: { slotDefId: string; roomIds: string[] }[] = [];
  for (const slot of w.slots) {
    const roomIds = w.rooms
      .filter((r) => checkMove(w, sessionId, slot.id, r.id) === null)
      .map((r) => r.id);
    if (roomIds.length > 0) out.push({ slotDefId: slot.id, roomIds });
  }
  return out;
}
