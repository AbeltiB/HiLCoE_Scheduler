import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guarded, HttpError } from "@/lib/auth/guard";

export const GET = guarded("data:import", async (_ctx, params) => {
  const row = await db.importBatch.findUnique({
    where: { id: params?.id },
    include: { uploadedBy: { select: { fullName: true, email: true } } },
  });
  if (!row) throw new HttpError(404, "Import not found");
  return NextResponse.json({ row });
});
