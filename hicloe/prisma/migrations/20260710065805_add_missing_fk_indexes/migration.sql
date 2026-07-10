-- CreateIndex
CREATE INDEX "batches_program_id_idx" ON "batches"("program_id");

-- CreateIndex
CREATE INDEX "batches_period_id_idx" ON "batches"("period_id");

-- CreateIndex
CREATE INDEX "course_offerings_batch_id_idx" ON "course_offerings"("batch_id");

-- CreateIndex
CREATE INDEX "import_batches_uploaded_by_id_idx" ON "import_batches"("uploaded_by_id");

-- CreateIndex
CREATE INDEX "instructor_availability_slot_def_id_idx" ON "instructor_availability"("slot_def_id");

-- CreateIndex
CREATE INDEX "lab_groups_section_id_idx" ON "lab_groups"("section_id");

-- CreateIndex
CREATE INDEX "offering_instructors_instructor_id_idx" ON "offering_instructors"("instructor_id");

-- CreateIndex
CREATE INDEX "schedule_sessions_version_id_idx" ON "schedule_sessions"("version_id");

-- CreateIndex
CREATE INDEX "schedule_sessions_offering_id_idx" ON "schedule_sessions"("offering_id");

-- CreateIndex
CREATE INDEX "sections_batch_id_idx" ON "sections"("batch_id");

-- CreateIndex
CREATE INDEX "students_section_id_idx" ON "students"("section_id");

-- CreateIndex
CREATE INDEX "students_group_id_idx" ON "students"("group_id");

-- CreateIndex
CREATE INDEX "verifications_version_id_idx" ON "verifications"("version_id");

-- CreateIndex
CREATE INDEX "verifications_verifier_id_idx" ON "verifications"("verifier_id");
