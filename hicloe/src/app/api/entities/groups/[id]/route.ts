import { crudItem } from "@/lib/crud";
import { groupSchema } from "@/lib/validation/entities";
import { warnGroupHeadcountMismatch } from "@/lib/validation/headcount";
export const { PATCH, DELETE } = crudItem({
  model: "labGroup", entityType: "LabGroup", schema: groupSchema, softDelete: true,
  warn: (row) => warnGroupHeadcountMismatch(row.sectionId),
});
