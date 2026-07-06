import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { guarded, HttpError } from "@/lib/auth/guard";
import { compilePayload } from "@/lib/schedule/compile";
import { solverPrecheck } from "@/lib/schedule/solver-client";

export const POST = guarded("schedule:generate", async (ctx, params) => {
  const scheduleId = params?.id;
  if (!scheduleId) throw new HttpError(400, "Missing schedule id");
  const { payload, sessionRows } = await compilePayload(scheduleId, randomUUID());
  const report = await solverPrecheck(payload);
  await ctx.log({
    action: "schedule.precheck",
    entityType: "Schedule", entityId: scheduleId,
    meta: { sessions: sessionRows.length, ...report.summary },
  });
  return NextResponse.json({ report, sessionCount: sessionRows.length });
});
