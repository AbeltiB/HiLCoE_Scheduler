import { crudItem } from "@/lib/crud";
import { groupSchema } from "@/lib/validation/entities";
export const { PATCH, DELETE } = crudItem({
  model: "labGroup", entityType: "LabGroup", schema: groupSchema, softDelete: true,
});
