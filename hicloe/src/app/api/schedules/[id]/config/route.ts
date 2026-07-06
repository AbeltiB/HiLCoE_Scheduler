import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, HttpError } from "@/lib/auth/guard";
import { scheduleConfigSchema } from "@/lib/validation/entities";
import { audit } from "@/lib/audit/audit";
import type { Prisma } from "@/generated/prisma/client";

export const PUT = guarded("schedule:configure", async (ctx, params) => {
  const scheduleId = params?.id;
  if (!scheduleId) throw new HttpError(400, "Missing schedule id");
  const parsed = scheduleConfigSchema.safeParse(await ctx.req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid body");

  const before = await db.constraintConfig.findUnique({ where: { scheduleId } });
  await db.$transaction(async (tx) => {
    await tx.constraintConfig.upsert({
      where: { scheduleId },
      update: {
        weights: parsed.data.weights as Prisma.InputJsonValue,
        options: parsed.data.options as Prisma.InputJsonValue,
      },
      create: {
        scheduleId,
        weights: parsed.data.weights as Prisma.InputJsonValue,
        options: parsed.data.options as Prisma.InputJsonValue,
      },
    });
    await audit(
      { action: "schedule.config_updated", actorId: ctx.user.id, entityType: "Schedule", entityId: scheduleId,
        before: before ? { weights: before.weights, options: before.options } : undefined,
        after: parsed.data,
        requestId: ctx.requestId, ip: ctx.ip, userAgent: ctx.userAgent },
      tx
    );
  });
  return NextResponse.json({ ok: true });
});
