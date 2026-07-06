import { crudCollection } from "@/lib/crud";
import { batchSchema } from "@/lib/validation/entities";
export const { GET, POST } = crudCollection({
  model: "batch", entityType: "Batch", schema: batchSchema, softDelete: true,
  include: { program: true, period: true, _count: { select: { sections: true } } },
  orderBy: { name: "asc" },
});
