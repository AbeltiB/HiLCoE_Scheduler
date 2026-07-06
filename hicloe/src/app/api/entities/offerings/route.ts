import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, HttpError } from "@/lib/auth/guard";
import { offeringSchema } from "@/lib/validation/entities";
import { audit } from "@/lib/audit/audit";

export const GET = guarded("entities:read", async (ctx) => {
  const batchId = ctx.req.nextUrl.searchParams.get("batchId") ?? undefined;
  const rows = await db.courseOffering.findMany({
    where: { deletedAt: null, batchId },
    include: {
      course: { select: { id: true, code: true, name: true } },
      batch: { select: { id: true, name: true, program: { select: { code: true } } } },
      sections: { select: { id: true, name: true } },
      instructors: { include: { instructor: { select: { id: true, fullName: true } } } },
    },
    orderBy: { course: { code: "asc" } },
  });
  return NextResponse.json({ rows });
});

export const POST = guarded("entities:write", async (ctx) => {
  const parsed = offeringSchema.safeParse(await ctx.req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid body");
  const d = parsed.data;

  // Sanity: sections must belong to the offering's batch.
  const sections = await db.section.findMany({ where: { id: { in: d.sectionIds }, deletedAt: null } });
  if (sections.length !== d.sectionIds.length) throw new HttpError(400, "Unknown section id(s)");
  if (sections.some((s) => s.batchId !== d.batchId)) {
    throw new HttpError(400, "All sections must belong to the selected batch");
  }

  const row = await db.$transaction(async (tx) => {
    const created = await tx.courseOffering.create({
      data: {
        courseId: d.courseId,
        batchId: d.batchId,
        sharedLecture: d.sharedLecture,
        sections: { connect: d.sectionIds.map((id) => ({ id })) },
        instructors: {
          create: [
            ...d.lectureInstructorIds.map((instructorId) => ({ instructorId, kind: "LECTURE" as const })),
            ...d.labInstructorIds.map((instructorId) => ({ instructorId, kind: "LAB" as const })),
          ],
        },
      },
    });
    await audit(
      {
        action: "offering.created", actorId: ctx.user.id,
        entityType: "CourseOffering", entityId: created.id, after: d,
        requestId: ctx.requestId, ip: ctx.ip, userAgent: ctx.userAgent,
      },
      tx
    );
    return created;
  });
  return NextResponse.json({ row }, { status: 201 });
});
