import { crudItem } from "@/lib/crud";
import { studentSchema } from "@/lib/validation/entities";
export const { PATCH, DELETE } = crudItem({
  model: "student", entityType: "Student", schema: studentSchema, softDelete: true,
});
