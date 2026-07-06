import { crudCollection } from "@/lib/crud";
import { groupSchema } from "@/lib/validation/entities";
export const { GET, POST } = crudCollection({
  model: "labGroup", entityType: "LabGroup", schema: groupSchema, softDelete: true,
  include: { section: { include: { batch: true } } }, orderBy: { name: "asc" },
});
