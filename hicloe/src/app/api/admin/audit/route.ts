import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded } from "@/lib/auth/guard";

/** Filterable audit browser: ?actorId=&action=&entityType=&entityId=&from=&to=&cursor= */
export const GET = guarded("audit:read", async (ctx) => {
  const q = ctx.req.nextUrl.searchParams;
  const take = Math.min(Number(q.get("take") ?? 50), 200);
  const cursor = q.get("cursor");

  const rows = await db.auditLog.findMany({
    where: {
      actorId: q.get("actorId") ?? undefined,
      action: q.get("action") ?? undefined,
      entityType: q.get("entityType") ?? undefined,
      entityId: q.get("entityId") ?? undefined,
      at: {
        gte: q.get("from") ? new Date(q.get("from")!) : undefined,
        lte: q.get("to") ? new Date(q.get("to")!) : undefined,
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
