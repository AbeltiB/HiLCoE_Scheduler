import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, HttpError } from "@/lib/auth/guard";

function parseDateParam(raw: string | null, label: string): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, `Invalid '${label}' date`);
  return d;
}

/** Filterable audit browser: ?actorId=&action=&entityType=&entityId=&from=&to=&cursor= */
export const GET = guarded("audit:read", async (ctx) => {
  const q = ctx.req.nextUrl.searchParams;
  const take = Math.min(Number(q.get("take") ?? 50), 200);
  const cursor = q.get("cursor");
  if (cursor && !/^\d+$/.test(cursor)) throw new HttpError(400, "Invalid 'cursor' value");

  const rows = await db.auditLog.findMany({
    where: {
      actorId: q.get("actorId") ?? undefined,
      action: q.get("action") ?? undefined,
      entityType: q.get("entityType") ?? undefined,
      entityId: q.get("entityId") ?? undefined,
      at: {
        gte: parseDateParam(q.get("from"), "from"),
        lte: parseDateParam(q.get("to"), "to"),
      },
    },
    orderBy: { id: "desc" },
    take,
    ...(cursor ? { skip: 1, cursor: { id: BigInt(cursor) } } : {}),
    include: { actor: { select: { fullName: true, email: true } } },
  });

  // Viewing the audit log is itself audited.
  await ctx.log({ action: "audit.viewed", meta: { filters: Object.fromEntries(q) } });

  return NextResponse.json({
    rows: rows.map((r) => ({ ...r, id: r.id.toString() })),
    nextCursor: rows.length === take ? rows[rows.length - 1].id.toString() : null,
  });
});
