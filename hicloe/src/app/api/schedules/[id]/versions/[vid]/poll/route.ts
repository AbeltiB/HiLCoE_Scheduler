import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, HttpError } from "@/lib/auth/guard";
import { solverGetJob } from "@/lib/schedule/solver-client";
import { audit } from "@/lib/audit/audit";
import type { Prisma } from "@/generated/prisma/client";

/** Client-driven completion: polls the solver and persists the result once.
 * Safe to call repeatedly and from multiple tabs (idempotent via in-tx guard). */
export const POST = guarded("schedule:generate", async (ctx, params) => {
  const { id: scheduleId, vid: versionId } = params ?? {};
  if (!scheduleId || !versionId) throw new HttpError(400, "Missing ids");

  const version = await db.scheduleVersion.findUnique({ where: { id: versionId } });
  if (!version || version.scheduleId !== scheduleId) throw new HttpError(404, "Version not found");
  if (version.solverResponse) {
    const resp = version.solverResponse as any;
    return NextResponse.json({ done: true, status: resp.status });
  }

  // A genuine 404 means the solver has no record of this job (e.g. it
  // restarted) — that's permanent, so fail the schedule. Anything else
  // (unreachable, 5xx) is transient: retry a few times in-request, and if
  // still failing, report "not done yet" rather than killing the schedule —
  // the client polls repeatedly anyway, so the next poll gets another shot
  // instead of forcing a regenerate over what may be a momentary blip.
  let job: Awaited<ReturnType<typeof solverGetJob>> | null = null;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3 && !job; attempt++) {
    try {
      job = await solverGetJob(versionId, ctx.requestId);
    } catch (e) {
      lastErr = e;
      if (e instanceof HttpError && e.status === 404) break;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (!job) {
    if (lastErr instanceof HttpError && lastErr.status === 404) {
      await db.schedule.update({ where: { id: scheduleId }, data: { state: "FAILED" } });
      return NextResponse.json({ done: true, status: "ERROR", error: "Solver job lost — regenerate." });
    }
    return NextResponse.json({ done: false, status: "RUNNING", error: "Solver temporarily unreachable — will retry." });
  }
  if (job.status !== "DONE") return NextResponse.json({ done: false, status: job.status });

  const result = job.result;
  const solved = result.status === "OPTIMAL" || result.status === "FEASIBLE";
  const pins = new Set(
    (((version.solverRequest as any)?.pins ?? []) as { session_id: string }[]).map((p) => p.session_id)
  );

  await db.$transaction(async (tx) => {
    const fresh = await tx.scheduleVersion.findUnique({ where: { id: versionId }, select: { solverResponse: true } });
    if (fresh?.solverResponse) return; // another poll won the race
    await tx.scheduleVersion.update({
      where: { id: versionId },
      data: {
        solverResponse: result as Prisma.InputJsonValue,
        objectivePenalty: result.objective?.total_penalty ?? null,
      },
    });
    if (solved) {
      await tx.assignment.createMany({
        data: result.assignments.map((a: any) => ({
          sessionId: a.session_id, slotDefId: a.slot_id, roomId: a.room_id,
          pinned: pins.has(a.session_id),
        })),
      });
    }
    await tx.schedule.update({
      where: { id: scheduleId },
      data: { state: solved ? "GENERATED" : "FAILED" },
    });
    await audit(
      { action: solved ? "schedule.generated" : "schedule.generation_failed",
        actorId: ctx.user.id, entityType: "ScheduleVersion", entityId: versionId,
        meta: { status: result.status, penalty: result.objective?.total_penalty,
                wallTimeMs: result.stats?.wall_time_ms },
        requestId: ctx.requestId, ip: ctx.ip, userAgent: ctx.userAgent },
      tx
    );
  });
  return NextResponse.json({ done: true, status: result.status });
});
