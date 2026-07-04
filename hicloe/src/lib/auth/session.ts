import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { newOpaqueToken, sha256 } from "@/lib/auth/tokens";

const ttlMs = () => env.SESSION_TTL_HOURS * 3600_000;

export async function createSession(userId: string, ip?: string, userAgent?: string) {
  const { raw, hash } = newOpaqueToken();
  await db.authSession.create({
    data: {
      id: hash, // store only the hash; the raw token lives in the cookie
      userId,
      expiresAt: new Date(Date.now() + ttlMs()),
      ip,
      userAgent,
    },
  });
  const jar = await cookies();
  jar.set(env.SESSION_COOKIE_NAME, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: env.SESSION_TTL_HOURS * 3600,
  });
}

export type SessionUser = {
  id: string;
  fullName: string;
  email: string;
  status: string;
  attributes: Record<string, unknown>;
  roles: string[];
  permissions: Set<string>;
};

/** Validates the cookie, slides expiry, returns the hydrated user or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const raw = jar.get(env.SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;

  const session = await db.authSession.findUnique({
    where: { id: sha256(raw) },
    include: {
      user: { include: { roles: { include: { permissions: true } } } },
    },
  });
  if (!session || session.expiresAt < new Date()) {
    if (session) await db.authSession.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (session.user.status !== "ACTIVE") return null;

  // Sliding expiry, throttled to at most one write per 5 minutes.
  if (Date.now() - session.lastSeen.getTime() > 5 * 60_000) {
    db.authSession
      .update({
        where: { id: session.id },
        data: { lastSeen: new Date(), expiresAt: new Date(Date.now() + ttlMs()) },
      })
      .catch(() => {});
  }

  const permissions = new Set<string>();
  const roles: string[] = [];
  for (const role of session.user.roles) {
    roles.push(role.name);
    for (const p of role.permissions) permissions.add(p.action);
  }
  return {
    id: session.user.id,
    fullName: session.user.fullName,
    email: session.user.email,
    status: session.user.status,
    attributes: (session.user.attributes ?? {}) as Record<string, unknown>,
    roles,
    permissions,
  };
}

export async function destroySession() {
  const jar = await cookies();
  const raw = jar.get(env.SESSION_COOKIE_NAME)?.value;
  if (raw) await db.authSession.delete({ where: { id: sha256(raw) } }).catch(() => {});
  jar.delete(env.SESSION_COOKIE_NAME);
}
