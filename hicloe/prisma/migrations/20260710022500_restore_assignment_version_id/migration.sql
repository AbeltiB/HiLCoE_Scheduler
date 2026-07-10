-- Forward-fix: the immediately-preceding migration (20260710021754_assignment_updated_at)
-- unintentionally dropped `version_id` and its unique index. That column had
-- only ever existed as hand-written SQL with no representation in
-- schema.prisma, so `prisma migrate dev` treated it as drift when Assignment
-- gained `updatedAt` and silently removed it. Re-adding it here as a real,
-- Prisma-declared field (see Assignment.versionId in schema.prisma) so this
-- can't happen again — and as TEXT (not the original hand-written `uuid`) to
-- match what Prisma actually generates for String fields elsewhere in this
-- schema (see schedule_sessions.version_id), removing the type mismatch
-- entirely rather than just re-creating it.

ALTER TABLE "assignments" ADD COLUMN "version_id" TEXT;

-- Backfill from the owning session, same logic the trigger applies going forward.
UPDATE "assignments" a
SET "version_id" = s."version_id"
FROM "schedule_sessions" s
WHERE s."id" = a."session_id";

CREATE UNIQUE INDEX "uq_assignment_room_slot_per_version"
  ON "assignments" ("version_id", "slot_def_id", "room_id");
