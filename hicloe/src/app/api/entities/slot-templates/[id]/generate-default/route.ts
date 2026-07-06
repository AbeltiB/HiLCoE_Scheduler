import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, HttpError } from "@/lib/auth/guard";
import { audit } from "@/lib/audit/audit";

/**
 * Seeds the current HiLCoE weekly structure into an empty template:
 *  P1 08:00–09:30 · P2 09:45–11:15 · P3 11:30–13:00 · lunch · P4 14:00–15:30 · P5 15:45–17:15 · P6 17:30–19:00
 *  Mon–Fri: P1–P5 UG+PG, P6 PG-only · Friday P3 blocked
 *  Saturday: P1–P3 UG (morning) · P4–P5 PG (afternoon)
 *  Sunday: P1–P5 PG
 * Everything is editable afterwards — this is a starting point, not a rule.
 */
const TIMES: [string, string][] = [
  ["08:00", "09:30"], ["09:45", "11:15"], ["11:30", "13:00"],
  ["14:00", "15:30"], ["15:45", "17:15"], ["17:30", "19:00"],
];

export const POST = guarded("entities:write", async (ctx, params) => {
  const templateId = params?.id;
  if (!templateId) throw new HttpError(400, "Missing template id");
  const existing = await db.slotDef.count({ where: { templateId } });
  if (existing > 0) throw new HttpError(409, "Template already has slots — edit them or clear first");

  const slots: { day: number; index: number; startTime: string; endTime: string; audience: ("UG" | "PG")[]; blocked: boolean }[] = [];
  for (let day = 1; day <= 5; day++) {
    for (let i = 1; i <= 6; i++) {
      slots.push({
        day, index: i, startTime: TIMES[i - 1][0], endTime: TIMES[i - 1][1],
        audience: i === 6 ? ["PG"] : ["UG", "PG"],
        blocked: day === 5 && i === 3, // Friday P3
      });
    }
  }
  for (let i = 1; i <= 5; i++) {
    slots.push({
      day: 6, index: i, startTime: TIMES[i - 1][0], endTime: TIMES[i - 1][1],
      audience: i <= 3 ? ["UG"] : ["PG"], blocked: false,
    });
  }
  for (let i = 1; i <= 5; i++) {
    slots.push({ day: 7, index: i, startTime: TIMES[i - 1][0], endTime: TIMES[i - 1][1], audience: ["PG"], blocked: false });
  }

  await db.$transaction(async (tx) => {
    await tx.slotDef.createMany({ data: slots.map((s) => ({ ...s, templateId })) });
    await audit(
      { action: "slotTemplate.default_generated", actorId: ctx.user.id, entityType: "SlotTemplate", entityId: templateId, after: { count: slots.length }, requestId: ctx.requestId, ip: ctx.ip, userAgent: ctx.userAgent },
      tx
    );
  });
  return NextResponse.json({ ok: true, count: slots.length });
});
