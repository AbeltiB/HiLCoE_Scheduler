import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, HttpError } from "@/lib/auth/guard";
import { parseWorkbook, validateImport } from "@/lib/import/pipeline";
import type { Prisma } from "@/generated/prisma/client";

export const GET = guarded("data:import", async () => {
  const rows = await db.importBatch.findMany({
    include: { uploadedBy: { select: { fullName: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ rows });
});

/** POST multipart/form-data { file } → parse + validate, store report. */
export const POST = guarded("data:import", async (ctx) => {
  const form = await ctx.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Attach a CSV/XLSX file under field 'file'");
  if (file.size > 10 * 1024 * 1024) throw new HttpError(400, "File too large (max 10 MB)");

  const buffer = Buffer.from(await file.arrayBuffer());
  let parsed;
  try {
    parsed = parseWorkbook(buffer);
  } catch {
    throw new HttpError(400, "Could not parse the file — is it a valid CSV/XLSX workbook?");
  }
  const report = await validateImport(parsed);
  const status = report.errors.length > 0 ? "FAILED" : "VALIDATED";

  const row = await db.importBatch.create({
    data: {
      source: "FILE",
      fileName: file.name,
      uploadedById: ctx.user.id,
      parsedPayload: parsed as unknown as Prisma.InputJsonValue,
      validationReport: report as unknown as Prisma.InputJsonValue,
      status,
    },
  });
  await ctx.log({
    action: "import.uploaded",
    entityType: "ImportBatch", entityId: row.id,
    meta: { fileName: file.name, status, ...report.summary },
  });
  return NextResponse.json({ id: row.id, status, report }, { status: 201 });
});
