import { crudCollection } from "@/lib/crud";
import { instructorSchema } from "@/lib/validation/entities";

const toData = (d: any) => ({
  fullName: d.fullName,
  employment: d.employment,
  userId: d.userId ?? null,
  ...(d.coursePoolIds
    ? { coursePool: { set: d.coursePoolIds.map((id: string) => ({ id })) } }
    : {}),
});

export const { GET, POST } = crudCollection({
  model: "instructor", entityType: "Instructor", schema: instructorSchema, softDelete: true,
  include: { coursePool: { select: { id: true, code: true } }, user: { select: { email: true } } },
  orderBy: { fullName: "asc" },
  toData: (d) => ({
    fullName: d.fullName, email: d.email ?? null, employment: d.employment, userId: d.userId ?? null,
    coursePool: { connect: (d.coursePoolIds ?? []).map((id: string) => ({ id })) },
  }),
});
