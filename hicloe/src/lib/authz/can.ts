import type { SessionUser } from "@/lib/auth/session";

/**
 * Two-layer authorization.
 *
 * Layer 1 — RBAC: does any of the user's roles carry this permission action?
 * Layer 2 — ABAC: if a policy is registered for the action, does it pass for
 *           this specific resource, given the user's attributes?
 *
 * Result always carries a `reason` so denials can be audited meaningfully.
 */

export type AuthzResult = { allowed: boolean; reason: string };

export type AbacPolicy = (
  user: SessionUser,
  resource: unknown
) => AuthzResult;

const abacPolicies = new Map<string, AbacPolicy>();

export function registerPolicy(action: string, policy: AbacPolicy) {
  abacPolicies.set(action, policy);
}

export function can(
  user: SessionUser,
  action: string,
  resource?: unknown
): AuthzResult {
  // RBAC
  if (!user.permissions.has(action) && !user.permissions.has("*")) {
    return { allowed: false, reason: `rbac: missing permission '${action}'` };
  }
  // ABAC — only evaluated when a resource is supplied and a policy exists.
  const policy = abacPolicies.get(action);
  if (policy && resource !== undefined) {
    return policy(user, resource);
  }
  return { allowed: true, reason: "rbac: permitted" };
}

/** Convenience: string[] attribute reader with safe default. */
export function attrList(user: SessionUser, key: string): string[] {
  const v = user.attributes[key];
  return Array.isArray(v) ? (v as string[]) : [];
}
