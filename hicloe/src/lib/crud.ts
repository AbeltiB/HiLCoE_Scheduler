import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, HttpError, type Ctx } from "@/lib/auth/guard";
import { audit } from "@/lib/audit/audit";

/**
 * Generic audited CRUD for simple entities. Custom endpoints (offerings,
 * slot templates, availability, imports) are hand-written; everything else
 * goes through here so validation + audit + soft delete stay uniform.
 */

type CrudOpts = {
  model: string; // prisma delegate name, e.g. "program"
  entityType: string; // audit label, e.g. "Program"
  schema: z.ZodTypeAny;
  /**
   * Schema for PATCH bodies. Defaults to `schema.partial()`, which only works
   * for a plain ZodObject — a refined (ZodEffects) schema throws if you call
   * `.partial()` on it. Any entity whose `schema` has a top-level `.refine()`
   * must supply an explicit sibling schema here (see courseUpdateSchema /
   * periodUpdateSchema in validation/entities.ts).
   */
  updateSchema?: z.ZodTypeAny;
  include?: Record<string, unknown>;
  orderBy?: Record<string, unknown>;
  softDelete?: boolean;
  /** Map validated data to prisma create/update payload (relations etc.) */
  toData?: (input: any) => Record<string, unknown>;
  /**
   * Optional soft check run after a successful create/update (outside the
   * transaction — read-only). A returned string is surfaced as `warning` in
   * the response; the write itself is never blocked by this.
   */
  warn?: (row: any) => Promise<string | undefined>;
};

const delegate = (model: string) => (db as any)[model];

function prismaError(e: unknown): never {
  const err = e as { code?: string; meta?: { target?: string[] } };
  if (err?.code === "P2002") {
    throw new HttpError(409, `Duplicate value for unique field(s): ${err.meta?.target?.join(", ") ?? "unknown"}`);
  }
  if (err?.code === "P2003") {
    throw new HttpError(409, "Operation violates a relation (record is referenced elsewhere)");
  }
  throw e;
}

export function crudCollection(o: CrudOpts) {
  const GET = guarded("entities:read", async (ctx) => {
    const q = ctx.req.nextUrl.searchParams;
    const where: Record<string, unknown> = o.softDelete ? { deletedAt: null } : {};
    // simple relation filters, e.g. ?batchId=…&sectionId=…
    for (const key of ["batchId", "sectionId", "programId", "periodId", "templateId", "courseId"]) {
      const v = q.get(key);
      if (v) where[key] = v;
    }
    // Opt-in pagination via ?take=&skip=. Existing callers that don't pass
    // these keep getting one page — but bounded (default 500, capped at
    // 1000), so a growing table can no longer make this an unbounded payload.
    const take = Math.min(Number(q.get("take")) || 500, 1000);
    const skip = Math.max(Number(q.get("skip")) || 0, 0);
    const [rows, total] = await Promise.all([
      delegate(o.model).findMany({
        where,
        include: o.include,
        orderBy: o.orderBy ?? { createdAt: "desc" },
        take,
        skip,
      }),
      delegate(o.model).count({ where }),
    ]);
    return NextResponse.json({ rows, total, take, skip });
  });

  const POST = guarded("entities:write", async (ctx) => {
    const parsed = o.schema.safeParse(await ctx.req.json().catch(() => ({})));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid body");
    const data = o.toData ? o.toData(parsed.data) : parsed.data;
    try {
      const row = await db.$transaction(async (tx) => {
        const created = await (tx as any)[o.model].create({ data, include: o.include });
        await audit(
          {
            action: `${o.model}.created`, actorId: ctx.user.id,
            entityType: o.entityType, entityId: created.id, after: parsed.data,
            requestId: ctx.requestId, ip: ctx.ip, userAgent: ctx.userAgent,
          },
          tx
        );
        return created;
      });
      const warning = await o.warn?.(row);
      return NextResponse.json({ row, ...(warning ? { warning } : {}) }, { status: 201 });
    } catch (e) {
      prismaError(e);
    }
  });

  return { GET, POST };
}

export function crudItem(o: CrudOpts) {
  const PATCH = guarded("entities:write", async (ctx: Ctx, params) => {
    const id = params?.id;
    if (!id) throw new HttpError(400, "Missing id");
    const partial = o.updateSchema ?? (o.schema as any).partial();
    const parsed = partial.safeParse(await ctx.req.json().catch(() => ({})));
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid body");

    const before = await delegate(o.model).findUnique({ where: { id } });
    if (!before || (o.softDelete && before.deletedAt)) throw new HttpError(404, `${o.entityType} not found`);

    const data = o.toData ? o.toData(parsed.data) : parsed.data;
    try {
      const row = await db.$transaction(async (tx) => {
        const updated = await (tx as any)[o.model].update({ where: { id }, data, include: o.include });
        await audit(
          {
            action: `${o.model}.updated`, actorId: ctx.user.id,
            entityType: o.entityType, entityId: id, before, after: parsed.data,
            requestId: ctx.requestId, ip: ctx.ip, userAgent: ctx.userAgent,
          },
          tx
        );
        return updated;
      });
      const warning = await o.warn?.(row);
      return NextResponse.json({ row, ...(warning ? { warning } : {}) });
    } catch (e) {
      prismaError(e);
    }
  });

  const DELETE = guarded("entities:write", async (ctx: Ctx, params) => {
    const id = params?.id;
    if (!id) throw new HttpError(400, "Missing id");
    const before = await delegate(o.model).findUnique({ where: { id } });
    if (!before || (o.softDelete && before.deletedAt)) throw new HttpError(404, `${o.entityType} not found`);

    try {
      await db.$transaction(async (tx) => {
        if (o.softDelete) {
          await (tx as any)[o.model].update({ where: { id }, data: { deletedAt: new Date() } });
        } else {
          await (tx as any)[o.model].delete({ where: { id } });
        }
        await audit(
          {
            action: `${o.model}.deleted`, actorId: ctx.user.id,
            entityType: o.entityType, entityId: id, before,
            meta: { soft: !!o.softDelete },
            requestId: ctx.requestId, ip: ctx.ip, userAgent: ctx.userAgent,
          },
          tx
        );
      });
      return NextResponse.json({ ok: true });
    } catch (e) {
      prismaError(e);
    }
  });

  return { PATCH, DELETE };
}
