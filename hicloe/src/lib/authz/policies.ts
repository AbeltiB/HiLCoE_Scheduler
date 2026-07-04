/**
 * ABAC policies — registered per action, evaluated after RBAC passes.
 * User attributes shape (managed from the superadmin console):
 *   { programIds?: string[], batchIds?: string[], instructorId?: string }
 * Empty/missing attribute list = unrestricted scope for that dimension.
 */
import { registerPolicy, attrList } from "@/lib/authz/can";

// schedule:review — a verifier may only review versions touching their scope.
registerPolicy("schedule:review", (user, resource) => {
  const r = resource as { batchIds?: string[]; programIds?: string[]; createdById?: string };
  if (r.createdById && r.createdById === user.id) {
    return { allowed: false, reason: "abac: cannot verify a version you generated" };
  }
  const scopeBatches = attrList(user, "batchIds");
  const scopePrograms = attrList(user, "programIds");
  if (scopeBatches.length === 0 && scopePrograms.length === 0) {
    return { allowed: true, reason: "abac: unrestricted verifier scope" };
  }
  const okBatch = (r.batchIds ?? []).every((b) => scopeBatches.includes(b));
  const okProg = (r.programIds ?? []).every((p) => scopePrograms.includes(p));
  return okBatch || okProg
    ? { allowed: true, reason: "abac: within verifier scope" }
    : { allowed: false, reason: "abac: version touches batches outside verifier scope" };
});

// availability:edit_own — instructors may only edit their own grid.
registerPolicy("availability:edit_own", (user, resource) => {
  const r = resource as { instructorId?: string };
  const own = user.attributes["instructorId"];
  return own && r.instructorId === own
    ? { allowed: true, reason: "abac: own availability" }
    : { allowed: false, reason: "abac: not this user's instructor record" };
});
