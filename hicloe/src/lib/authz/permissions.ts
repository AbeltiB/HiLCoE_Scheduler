/**
 * Canonical permission catalog. The seed script inserts these; the superadmin
 * console composes them into roles. Keep this file as the single source of
 * truth — new features add their actions here first.
 */
export const PERMISSIONS = [
  // identity & governance
  "users:manage",        // create/invite users, assign roles & attributes, suspend
  "roles:manage",        // create/edit roles and their permission sets
  "audit:read",          // browse the audit log
  // data
  "data:import",         // upload & commit registration imports
  "entities:write",      // CRUD on programs, batches, sections, courses, rooms, instructors, slot templates
  "entities:read",
  // scheduling lifecycle
  "schedule:configure",  // constraint weights/options, calendars
  "schedule:generate",
  "schedule:edit",       // manual drag-drop adjustments on drafts
  "schedule:review",     // approve/reject versions (ABAC-scoped)
  "schedule:publish",
  // self-service
  "availability:edit_own",
  "timetable:view_published",
  // communication
  "broadcast:send",     // email students/instructors by section, group, or everyone
] as const;

export type PermissionAction = (typeof PERMISSIONS)[number];

/** Default system roles → permission sets (seeded; editable in console later). */
export const SYSTEM_ROLES: Record<string, PermissionAction[] | ["*"]> = {
  SUPER_ADMIN: ["*"],
  SCHEDULER: [
    "entities:read", "entities:write", "data:import",
    "schedule:configure", "schedule:generate", "schedule:edit",
    "timetable:view_published",
  ],
  VERIFIER: ["entities:read", "schedule:review", "timetable:view_published"],
  REGISTRAR: ["entities:read", "data:import", "timetable:view_published"],
  INSTRUCTOR: ["availability:edit_own", "timetable:view_published"],
  VIEWER: ["timetable:view_published"],
};
