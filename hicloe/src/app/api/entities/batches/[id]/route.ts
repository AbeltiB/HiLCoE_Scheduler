import { crudItem } from "@/lib/crud";
import { batchSchema } from "@/lib/validation/entities";
export const { PATCH, DELETE } = crudItem({
  model: "batch", entityType: "Batch", schema: batchSchema, softDelete: true,
  include: { program: true, period: true },
});
