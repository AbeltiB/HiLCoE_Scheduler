import { crudItem } from "@/lib/crud";
import { roomSchema } from "@/lib/validation/entities";
export const { PATCH, DELETE } = crudItem({
  model: "room", entityType: "Room", schema: roomSchema, softDelete: true,
});
