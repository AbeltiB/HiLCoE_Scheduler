import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, HttpError } from "@/lib/auth/guard";
import { moveSchema } from "@/lib/validation/entities";
import { buildValidationWorld, checkMove } from "@/lib/schedule/conflicts";
import { audit } from "@/lib/audit/audit";

const EDITABLE_STATES = ["GENERATED", "IN_REVIEW"];

export const PATCH = guarded("schedule:edit", async (ctx, params) => {
  const { id: scheduleId, vid: versionId, aid } = params ?? {};
  if (!scheduleId || !versionId || !aid) throw new HttpError(400, "Missing ids");

  const parsed = moveSchema.safeParse(await ctx.req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid body");

  const assignment = await db.assignment.findUnique({
    where: { id: aid },
    include: { session: { include: { version: { include: { schedule: true } } } } },
  });
  if (!assignment || assignment.session.versionId !== versionId) throw new HttpError(404, "Assignment not found");
  const schedule = assignment.session.version.schedule;
  if (!EDITABLE_STATES.includes(schedule.state)) {
    throw new HttpError(409, `Manual edits are only allowed in GENERATED or IN_REVIEW state (currently ${schedule.state})`);
  }

  const moved = assignment.slotDefId !== parsed.data.slotDefId || assignment.roomId !== parsed.data.roomId;
  if (moved) {
    const world = await buildValidationWorld(scheduleId, versionId);
    const reason = checkMove(world, assignment.sessionId, parsed.data.slotDefId, parsed.data.roomId);
    if (reason) throw new HttpError(409, `Move rejected: ${reason}`);
  }

  await db.$transaction(async (tx) => {
    await tx.assignment.update({
      where: { id: aid },
      data: {
        slotDefId: parsed.data.slotDefId,
        roomId: parsed.data.roomId,
        pinned: parsed.data.pinned ?? assignment.pinned,
        manuallyEdited: moved ? true : assignment.manuallyEdited,
      },
    });
    await audit(
      { action: moved ? "assignment.moved" : "assignment.pin_toggled",
        actorId: ctx.user.id, entityType: "Assignment", entityId: aid,
        before: { slotDefId: assignment.slotDefId, roomId: assignment.roomId, pinned: assignment.pinned },
        after: parsed.data,
        meta: { versionId, sessionId: assignment.sessionId },
        requestId: ctx.requestId, ip: ctx.ip, userAgent: ctx.userAgent },
      tx
    );
  });
  return NextResponse.json({ ok: true });
});
