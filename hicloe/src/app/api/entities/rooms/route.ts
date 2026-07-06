import { crudCollection } from "@/lib/crud";
import { roomSchema } from "@/lib/validation/entities";
export const { GET, POST } = crudCollection({
  model: "room", entityType: "Room", schema: roomSchema, softDelete: true, orderBy: { name: "asc" },
});
