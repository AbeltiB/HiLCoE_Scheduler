-- DropIndex
DROP INDEX "courses_code_key";

-- DropIndex
DROP INDEX "instructors_email_key";

-- DropIndex
DROP INDEX "rooms_name_key";

-- DropIndex
DROP INDEX "sections_name_batch_id_key";

-- DropIndex
DROP INDEX "students_email_key";

-- CreateIndex
CREATE INDEX "courses_code_idx" ON "courses"("code");

-- CreateIndex
CREATE INDEX "instructors_email_idx" ON "instructors"("email");

-- CreateIndex
CREATE INDEX "rooms_name_idx" ON "rooms"("name");

-- CreateIndex
CREATE INDEX "sections_name_batch_id_idx" ON "sections"("name", "batch_id");

-- CreateIndex
CREATE INDEX "students_email_idx" ON "students"("email");

-- Partial unique indexes: these five natural keys must only be unique among
-- non-deleted rows, so a soft-deleted "CS301"/"A303"/etc. doesn't permanently
-- block re-registering the same code/name/email. Prisma's schema DSL has no
-- syntax for a filtered (WHERE) unique index, so these exist only here, not
-- as @@unique in schema.prisma (see the comments on Course.code, Room.name,
-- Instructor.email, Student.email, and Section's index block).
--
-- IMPORTANT — read before running `prisma migrate dev` again: since nothing
-- in schema.prisma declares these as unique, Prisma's next diff will see
-- them as unrepresented and may propose dropping them. Check any future
-- generated migration for stray "DROP INDEX" lines on these five names
-- before applying it, and delete those lines if present.
CREATE UNIQUE INDEX "courses_code_key" ON "courses"("code") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "rooms_name_key" ON "rooms"("name") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "instructors_email_key" ON "instructors"("email") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "students_email_key" ON "students"("email") WHERE "deleted_at" IS NULL;
CREATE UNIQUE INDEX "sections_name_batch_id_key" ON "sections"("name", "batch_id") WHERE "deleted_at" IS NULL;
