import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, HttpError } from "@/lib/auth/guard";
import { commitImport, type ParsedImport } from "@/lib/import/pipeline";

export const POST = guarded("data:import", async (ctx, params) => {
  const id = params?.id;
  if (!id) throw new HttpError(400, "Missing import id");
  const row = await db.importBatch.findUnique({ where: { id } });
  if (!row) throw new HttpError(404, "Import not found");
  if (row.status === "COMMITTED") throw new HttpError(409, "Already committed");
  if (row.status !== "VALIDATED") throw new HttpError(409, "Import has validation errors — fix the file and re-upload");

  await commitImport(id, row.parsedPayload as unknown as ParsedImport, ctx.user.id, ctx.requestId);
  return NextResponse.json({ ok: true });
});
