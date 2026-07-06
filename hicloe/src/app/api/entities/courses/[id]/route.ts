import { crudItem } from "@/lib/crud";
import { courseSchema } from "@/lib/validation/entities";
export const { PATCH, DELETE } = crudItem({
  model: "course", entityType: "Course", schema: courseSchema, softDelete: true,
});
