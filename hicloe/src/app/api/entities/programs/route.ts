import { crudCollection } from "@/lib/crud";
import { programSchema } from "@/lib/validation/entities";
export const { GET, POST } = crudCollection({
  model: "program", entityType: "Program", schema: programSchema, orderBy: { code: "asc" },
});
