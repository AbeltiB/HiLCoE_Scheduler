import { crudItem } from "@/lib/crud";
import { periodSchema } from "@/lib/validation/entities";
export const { PATCH, DELETE } = crudItem({
  model: "academicPeriod", entityType: "AcademicPeriod", schema: periodSchema,
});
