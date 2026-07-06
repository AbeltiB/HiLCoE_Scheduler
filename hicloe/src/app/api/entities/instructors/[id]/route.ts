import { crudItem } from "@/lib/crud";
import { instructorSchema } from "@/lib/validation/entities";
export const { PATCH, DELETE } = crudItem({
  model: "instructor", entityType: "Instructor", schema: instructorSchema, softDelete: true,
  include: { coursePool: { select: { id: true, code: true } } },
  toData: (d) => ({
    ...(d.fullName !== undefined ? { fullName: d.fullName } : {}),
    ...(d.employment !== undefined ? { employment: d.employment } : {}),
    ...(d.userId !== undefined ? { userId: d.userId } : {}),
    ...(d.coursePoolIds !== undefined
      ? { coursePool: { set: d.coursePoolIds.map((id: string) => ({ id })) } }
      : {}),
  }),
});
