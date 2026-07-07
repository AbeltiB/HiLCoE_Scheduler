import { crudCollection } from "@/lib/crud";
import { studentSchema } from "@/lib/validation/entities";
export const { GET, POST } = crudCollection({
  model: "student", entityType: "Student", schema: studentSchema, softDelete: true,
  include: {
    section: { include: { batch: { include: { program: true } } } },
    group: { select: { id: true, name: true } },
  },
  orderBy: { fullName: "asc" },
});
