import { crudCollection } from "@/lib/crud";
import { periodSchema } from "@/lib/validation/entities";
export const { GET, POST } = crudCollection({
  model: "academicPeriod", entityType: "AcademicPeriod", schema: periodSchema,
  orderBy: { startDate: "desc" },
});
