import { NextResponse } from "next/server";
import { guarded, HttpError } from "@/lib/auth/guard";
import { buildValidationWorld, validMoves } from "@/lib/schedule/conflicts";

export const GET = guarded("schedule:edit", async (ctx, params) => {
  const { id: scheduleId, vid: versionId } = params ?? {};
  const sessionId = ctx.req.nextUrl.searchParams.get("sessionId");
  if (!scheduleId || !versionId || !sessionId) throw new HttpError(400, "Missing ids");
  const world = await buildValidationWorld(scheduleId, versionId);
  return NextResponse.json({ moves: validMoves(world, sessionId) });
});
