import { crudCollection } from "@/lib/crud";
import { sectionSchema } from "@/lib/validation/entities";
export const { GET, POST } = crudCollection({
  model: "section", entityType: "Section", schema: sectionSchema, softDelete: true,
  include: { batch: { include: { program: true } }, _count: { select: { groups: true } } },
  orderBy: { name: "asc" },
});
