import { NextResponse } from "next/server";
import { getSessionUser, destroySession } from "@/lib/auth/session";
import { audit } from "@/lib/audit/audit";
import { publicRoute, type PublicRouteResult } from "@/lib/audit/access-log";

export const POST = publicRoute(async (_req, { requestId, ip, userAgent }): Promise<PublicRouteResult> => {
  const user = await getSessionUser();
  await destroySession();
  if (user) await audit({ action: "auth.logout", actorId: user.id, requestId, ip, userAgent });
  return { response: NextResponse.json({ ok: true, requestId }), actorId: user?.id ?? null };
});
