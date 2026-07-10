import { crudItem } from "@/lib/crud";
import { sectionSchema } from "@/lib/validation/entities";
import { warnGroupHeadcountMismatch } from "@/lib/validation/headcount";
export const { PATCH, DELETE } = crudItem({
  model: "section", entityType: "Section", schema: sectionSchema, softDelete: true,
  warn: (row) => warnGroupHeadcountMismatch(row.id),
});
