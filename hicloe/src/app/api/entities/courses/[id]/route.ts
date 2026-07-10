import { crudItem } from "@/lib/crud";
import { courseSchema, courseUpdateSchema } from "@/lib/validation/entities";
export const { PATCH, DELETE } = crudItem({
  model: "course", entityType: "Course", schema: courseSchema, updateSchema: courseUpdateSchema, softDelete: true,
});
