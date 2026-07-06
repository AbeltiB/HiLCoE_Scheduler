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
  include?: Record<string, unknown>;
  orderBy?: Record<string, unknown>;
  softDelete?: boolean;
  /** Map validated data to prisma create/update payload (relations etc.) */
  toData?: (input: any) => Record<string, unknown>;
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
    const rows = await delegate(o.model).findMany({
      where,
      include: o.include,
      orderBy: o.orderBy ?? { createdAt: "desc" },
    });
    return NextResponse.json({ rows });
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
      return NextResponse.json({ row }, { status: 201 });
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
    const partial = (o.schema as any).partial ? (o.schema as any).partial() : o.schema;
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
      return NextResponse.json({ row });
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
