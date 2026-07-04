import { z } from "zod";

export const createUserSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email(),
  roleIds: z.array(z.string().uuid()).min(1),
  attributes: z.record(z.unknown()).default({}),
});

export const updateUserSchema = z.object({
  fullName: z.string().min(2).max(120).optional(),
  roleIds: z.array(z.string().uuid()).min(1).optional(),
  attributes: z.record(z.unknown()).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
});

export const roleSchema = z.object({
  name: z.string().min(2).max(60).regex(/^[A-Z0-9_]+$/, "UPPER_SNAKE_CASE"),
  description: z.string().max(300).optional(),
  permissionActions: z.array(z.string()).min(1),
});
