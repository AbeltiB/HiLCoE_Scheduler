import { crudCollection } from "@/lib/crud";
import { courseSchema } from "@/lib/validation/entities";
export const { GET, POST } = crudCollection({
  model: "course", entityType: "Course", schema: courseSchema, softDelete: true,
  orderBy: { code: "asc" },
});
