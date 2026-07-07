import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, HttpError } from "@/lib/auth/guard";
import { broadcastSchema } from "@/lib/validation/entities";
import { sendMail } from "@/lib/email/mailer";
import { env } from "@/lib/env";

const BATCH = 50; // BCC chunk size

export const POST = guarded("broadcast:send", async (ctx) => {
  const parsed = broadcastSchema.safeParse(await ctx.req.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid body");
  const d = parsed.data;

  const emails = new Set<string>();
  if (d.allInstructors || d.instructorIds.length) {
    const rows = await db.instructor.findMany({
      where: {
        deletedAt: null, email: { not: null },
        ...(d.allInstructors ? {} : { id: { in: d.instructorIds } }),
      },
      select: { email: true },
    });
    rows.forEach((r) => r.email && emails.add(r.email.toLowerCase()));
  }
  if (d.allStudents || d.sectionIds.length || d.groupIds.length || d.studentIds.length) {
    const rows = await db.student.findMany({
      where: {
        deletedAt: null,
        ...(d.allStudents ? {} : {
          OR: [
            ...(d.sectionIds.length ? [{ sectionId: { in: d.sectionIds } }] : []),
            ...(d.groupIds.length ? [{ groupId: { in: d.groupIds } }] : []),
            ...(d.studentIds.length ? [{ id: { in: d.studentIds } }] : []),
          ],
        }),
      },
      select: { email: true },
    });
    rows.forEach((r) => emails.add(r.email.toLowerCase()));
  }
  if (emails.size === 0) throw new HttpError(400, "No recipients matched (do they have email addresses?)");

  const list = [...emails];
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:16px;white-space:pre-wrap">${
    d.body.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  }<p style="color:#999;font-size:12px;margin-top:24px">Sent via HiLCoE Scheduler</p></div>`;

  let sent = 0, failed = 0;
  for (let i = 0; i < list.length; i += BATCH) {
    const chunk = list.slice(i, i + BATCH);
    try {
      await sendMail({ to: env.MAIL_FROM, subject: d.subject, text: d.body, html, bcc: chunk } as any);
      sent += chunk.length;
    } catch {
      failed += chunk.length;
    }
  }

  await ctx.log({
    action: "broadcast.sent",
    meta: {
      subject: d.subject, recipients: list.length, sent, failed,
      audience: { allStudents: d.allStudents, allInstructors: d.allInstructors,
                  sections: d.sectionIds.length, groups: d.groupIds.length,
                  instructors: d.instructorIds.length, students: d.studentIds.length },
    },
  });
  if (failed > 0 && sent === 0) throw new HttpError(502, `SMTP failed for all ${failed} recipients — check mail settings`);
  return NextResponse.json({ sent, failed, recipients: list.length });
});
