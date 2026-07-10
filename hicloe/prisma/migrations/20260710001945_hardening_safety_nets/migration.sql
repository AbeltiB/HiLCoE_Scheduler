-- Postgres safety nets under the app layer. Previously applied out-of-band
-- via `npm run db:harden` (prisma/sql/hardening.sql) — folded into the real
-- migration chain so `prisma migrate deploy` can never skip it on a fresh
-- environment. Written idempotently since it may re-run against a database
-- where the standalone script already applied it once.

-- Audit log is append-only for the app role: no UPDATE/DELETE ever.
CREATE OR REPLACE FUNCTION forbid_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_logs_immutable ON audit_logs;
CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_mutation();

-- Hard invariant: within one schedule version, a (slot, room) pair is used once.
-- Assignment doesn't carry version_id directly, so enforce via a helper column
-- maintained by trigger + a unique index.
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS version_id uuid;

CREATE OR REPLACE FUNCTION assignments_set_version() RETURNS trigger AS $$
BEGIN
  SELECT version_id INTO NEW.version_id
  FROM schedule_sessions WHERE id = NEW.session_id;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS assignments_version_fill ON assignments;
CREATE TRIGGER assignments_version_fill
  BEFORE INSERT OR UPDATE OF session_id ON assignments
  FOR EACH ROW EXECUTE FUNCTION assignments_set_version();

CREATE UNIQUE INDEX IF NOT EXISTS uq_assignment_room_slot_per_version
  ON assignments (version_id, slot_def_id, room_id);

-- Basic sanity CHECKs
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS chk_room_capacity;
ALTER TABLE rooms ADD CONSTRAINT chk_room_capacity CHECK (capacity > 0);
ALTER TABLE sections DROP CONSTRAINT IF EXISTS chk_section_headcount;
ALTER TABLE sections ADD CONSTRAINT chk_section_headcount CHECK (headcount > 0);
ALTER TABLE academic_periods DROP CONSTRAINT IF EXISTS chk_period_dates;
ALTER TABLE academic_periods ADD CONSTRAINT chk_period_dates CHECK (end_date > start_date);
