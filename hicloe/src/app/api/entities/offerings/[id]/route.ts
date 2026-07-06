import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, HttpError } from "@/lib/auth/guard";
import { offeringSchema } from "@/lib/validation/entities";
import { audit } from "@/lib/audit/audit";

export const PATCH = guarded("entities:write", async (ctx, params) => {
  const id = params?.id;
  if (!id) throw new HttpError(400, "Missing id");
  const parsed = offeringSchema.partial().safeParse(await ctx.req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid body");
  const d = parsed.data;

  const before = await db.courseOffering.findUnique({
    where: { id }, include: { sections: true, instructors: true },
  });
  if (!before || before.deletedAt) throw new HttpError(404, "Offering not found");

  if (d.sectionIds) {
    const batchId = d.batchId ?? before.batchId;
    const sections = await db.section.findMany({ where: { id: { in: d.sectionIds } } });
    if (sections.some((s) => s.batchId !== batchId)) {
      throw new HttpError(400, "All sections must belong to the offering's batch");
    }
  }

  await db.$transaction(async (tx) => {
    await tx.courseOffering.update({
      where: { id },
      data: {
        courseId: d.courseId,
        batchId: d.batchId,
        sharedLecture: d.sharedLecture,
        ...(d.sectionIds ? { sections: { set: d.sectionIds.map((sid) => ({ id: sid })) } } : {}),
      },
    });
    if (d.lectureInstructorIds || d.labInstructorIds) {
      await tx.offeringInstructor.deleteMany({ where: { offeringId: id } });
      await tx.offeringInstructor.createMany({
        data: [
          ...(d.lectureInstructorIds ?? []).map((instructorId) => ({ offeringId: id, instructorId, kind: "LECTURE" as const })),
          ...(d.labInstructorIds ?? []).map((instructorId) => ({ offeringId: id, instructorId, kind: "LAB" as const })),
        ],
      });
    }
    await audit(
      {
        action: "offering.updated", actorId: ctx.user.id,
        entityType: "CourseOffering", entityId: id,
        before: { sections: before.sections.map((s) => s.id), instructors: before.instructors },
        after: d,
        requestId: ctx.requestId, ip: ctx.ip, userAgent: ctx.userAgent,
      },
      tx
    );
  });
  return NextResponse.json({ ok: true });
});

export const DELETE = guarded("entities:write", async (ctx, params) => {
  const id = params?.id;
  if (!id) throw new HttpError(400, "Missing id");
  const before = await db.courseOffering.findUnique({ where: { id } });
  if (!before || before.deletedAt) throw new HttpError(404, "Offering not found");
  await db.$transaction(async (tx) => {
    await tx.courseOffering.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(
      { action: "offering.deleted", actorId: ctx.user.id, entityType: "CourseOffering", entityId: id, before, meta: { soft: true }, requestId: ctx.requestId, ip: ctx.ip, userAgent: ctx.userAgent },
      tx
    );
  });
  return NextResponse.json({ ok: true });
});
