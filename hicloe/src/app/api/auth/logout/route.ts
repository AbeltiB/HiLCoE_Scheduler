import { NextResponse } from "next/server";
import { getSessionUser, destroySession } from "@/lib/auth/session";
import { audit } from "@/lib/audit/audit";

export async function POST() {
  const user = await getSessionUser();
  await destroySession();
  if (user) await audit({ action: "auth.logout", actorId: user.id });
  return NextResponse.json({ ok: true });
}
