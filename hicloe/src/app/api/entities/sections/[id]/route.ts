import { crudItem } from "@/lib/crud";
import { sectionSchema } from "@/lib/validation/entities";
export const { PATCH, DELETE } = crudItem({
  model: "section", entityType: "Section", schema: sectionSchema, softDelete: true,
});
