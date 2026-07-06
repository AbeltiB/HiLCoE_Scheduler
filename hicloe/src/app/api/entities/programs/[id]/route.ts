import { crudItem } from "@/lib/crud";
import { programSchema } from "@/lib/validation/entities";
export const { PATCH, DELETE } = crudItem({ model: "program", entityType: "Program", schema: programSchema });
