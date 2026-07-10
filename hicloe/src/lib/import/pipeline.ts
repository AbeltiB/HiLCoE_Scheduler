import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { HttpError } from "@/lib/auth/guard";

/**
 * Registration import — canonical workbook format (CSV or XLSX).
 *
 * Sheets (CSV = one file per sheet, sheet name inferred from headers):
 *   Courses:     code, name, lecture_credit, lab_credit, lecture_per_week, lab_per_week, double_lab(Y/N)
 *   Batches:     batch, program_code, period_name
 *   Sections:    batch, section, headcount
 *   Groups:      batch, section, group, headcount
 *   Offerings:   batch, course_code, sections("A,B"), shared_lecture(Y/N)
 *   Instructors: full_name, email, employment(FULL_TIME/PART_TIME)
 *   Students:    batch, section, group(optional), full_name, email
 *
 * The same shape is what a future registration-system API adapter must emit —
 * parse() is the only format-specific layer.
 */

export type ParsedImport = {
  courses: { code: string; name: string; lectureCreditHrs: number; labCreditHrs: number; lectureSessionsPerWeek: number; labSessionsPerWeek: number; labNeedsDoublePeriod: boolean }[];
  batches: { name: string; programCode: string; periodName: string }[];
  sections: { batch: string; name: string; headcount: number }[];
  groups: { batch: string; section: string; name: string; headcount: number }[];
  offerings: { batch: string; courseCode: string; sections: string[]; sharedLecture: boolean }[];
  instructors: { fullName: string; email: string; employment: string }[];
  students: { batch: string; section: string; group: string; fullName: string; email: string }[];
};

export type Issue = { level: "error" | "warning"; sheet: string; row?: number; message: string };
export type ValidationReport = { errors: Issue[]; warnings: Issue[]; summary: Record<string, number> };

// Strip a leading formula-trigger character (=, +, -, @) so imported text
// can't turn into a live formula the moment this data is ever opened/exported
// as a spreadsheet again — no such re-export exists today, but nothing then
// has to remember to sanitize on the way out either.
const FORMULA_TRIGGER = /^[=+\-@]+/;
const S = (v: unknown) => String(v ?? "").trim().replace(FORMULA_TRIGGER, "");
const N = (v: unknown) => Number(String(v ?? "").trim());
const B = (v: unknown) => ["y", "yes", "true", "1"].includes(S(v).toLowerCase());

export function parseWorkbook(buffer: Buffer): ParsedImport {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = (name: string): Record<string, unknown>[] => {
    const key = wb.SheetNames.find((n) => n.toLowerCase() === name.toLowerCase());
    return key ? XLSX.utils.sheet_to_json(wb.Sheets[key], { defval: "" }) : [];
  };
  return {
    courses: sheet("Courses").map((r) => ({
      code: S(r["code"]).toUpperCase(),
      name: S(r["name"]),
      lectureCreditHrs: N(r["lecture_credit"]),
      labCreditHrs: N(r["lab_credit"]),
      lectureSessionsPerWeek: N(r["lecture_per_week"]),
      labSessionsPerWeek: N(r["lab_per_week"]),
      labNeedsDoublePeriod: B(r["double_lab"]),
    })),
    batches: sheet("Batches").map((r) => ({
      name: S(r["batch"]),
      programCode: S(r["program_code"]).toUpperCase(),
      periodName: S(r["period_name"]),
    })),
    sections: sheet("Sections").map((r) => ({
      batch: S(r["batch"]), name: S(r["section"]).toUpperCase(), headcount: N(r["headcount"]),
    })),
    groups: sheet("Groups").map((r) => ({
      batch: S(r["batch"]), section: S(r["section"]).toUpperCase(),
      name: S(r["group"]).toUpperCase(), headcount: N(r["headcount"]),
    })),
    offerings: sheet("Offerings").map((r) => ({
      batch: S(r["batch"]),
      courseCode: S(r["course_code"]).toUpperCase(),
      sections: S(r["sections"]).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
      sharedLecture: B(r["shared_lecture"]),
    })),
    instructors: sheet("Instructors").map((r) => ({
      fullName: S(r["full_name"]),
      email: S(r["email"]).toLowerCase(),
      employment: S(r["employment"]).toUpperCase(),
    })),
    students: sheet("Students").map((r) => ({
      batch: S(r["batch"]), section: S(r["section"]).toUpperCase(),
      group: S(r["group"]).toUpperCase(),
      fullName: S(r["full_name"]), email: S(r["email"]).toLowerCase(),
    })),
  };
}

export async function validateImport(p: ParsedImport): Promise<ValidationReport> {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const err = (sheet: string, row: number | undefined, message: string) => errors.push({ level: "error", sheet, row, message });
  const warn = (sheet: string, row: number | undefined, message: string) => warnings.push({ level: "warning", sheet, row, message });

  const [programs, periods, existingCourses, maxRoom] = await Promise.all([
    db.program.findMany(),
    db.academicPeriod.findMany(),
    db.course.findMany({ where: { deletedAt: null } }),
    db.room.aggregate({ _max: { capacity: true }, where: { deletedAt: null, active: true } }),
  ]);
  const programCodes = new Set(programs.map((x) => x.code));
  const periodNames = new Set(periods.map((x) => x.name));
  const knownCourses = new Set(existingCourses.map((c) => c.code));
  const biggestRoom = maxRoom._max.capacity ?? 0;

  // Courses
  const importCourses = new Set<string>();
  p.courses.forEach((c, i) => {
    const row = i + 2;
    if (!c.code) err("Courses", row, "Missing course code");
    if (importCourses.has(c.code)) err("Courses", row, `Duplicate course code ${c.code}`);
    importCourses.add(c.code);
    if (c.lectureSessionsPerWeek + c.labSessionsPerWeek <= 0) err("Courses", row, `${c.code}: no weekly sessions defined`);
    if ([c.lectureCreditHrs, c.labCreditHrs, c.lectureSessionsPerWeek, c.labSessionsPerWeek].some((n) => Number.isNaN(n) || n < 0)) {
      err("Courses", row, `${c.code}: numeric fields must be non-negative numbers`);
    }
  });

  // Batches
  const importBatches = new Map<string, { programCode: string; periodName: string }>();
  p.batches.forEach((b, i) => {
    const row = i + 2;
    if (!b.name) err("Batches", row, "Missing batch name");
    if (importBatches.has(b.name)) err("Batches", row, `Duplicate batch ${b.name}`);
    importBatches.set(b.name, b);
    if (!programCodes.has(b.programCode)) err("Batches", row, `Unknown program code '${b.programCode}' — create the program first`);
    if (!periodNames.has(b.periodName)) err("Batches", row, `Unknown academic period '${b.periodName}' — create it first`);
  });

  // Sections
  const sectionKey = (b: string, s: string) => `${b}::${s}`;
  const importSections = new Map<string, number>();
  p.sections.forEach((s, i) => {
    const row = i + 2;
    if (!importBatches.has(s.batch)) err("Sections", row, `Section ${s.name}: batch '${s.batch}' not in Batches sheet`);
    if (importSections.has(sectionKey(s.batch, s.name))) err("Sections", row, `Duplicate section ${s.batch}/${s.name}`);
    if (!Number.isInteger(s.headcount) || s.headcount <= 0) err("Sections", row, `Section ${s.batch}/${s.name}: invalid headcount`);
    importSections.set(sectionKey(s.batch, s.name), s.headcount);
    if (biggestRoom > 0 && s.headcount > biggestRoom) {
      warn("Sections", row, `Section ${s.batch}/${s.name} headcount ${s.headcount} exceeds largest room capacity ${biggestRoom} — only shared/split scheduling will fit it`);
    }
  });

  // Groups
  const groupKey = (b: string, s: string, g: string) => `${b}::${s}::${g}`;
  const importGroups = new Set<string>();
  const groupSums = new Map<string, number>();
  p.groups.forEach((g, i) => {
    const row = i + 2;
    const key = sectionKey(g.batch, g.section);
    if (!importSections.has(key)) err("Groups", row, `Group ${g.name}: section '${g.batch}/${g.section}' not in Sections sheet`);
    if (!Number.isInteger(g.headcount) || g.headcount <= 0) err("Groups", row, `Group ${g.batch}/${g.section}/${g.name}: invalid headcount`);
    importGroups.add(groupKey(g.batch, g.section, g.name));
    groupSums.set(key, (groupSums.get(key) ?? 0) + g.headcount);
  });
  for (const [key, sum] of groupSums) {
    const sec = importSections.get(key);
    if (sec !== undefined && sum !== sec) {
      warn("Groups", undefined, `Groups of ${key.replace("::", "/")} sum to ${sum} but section headcount is ${sec}`);
    }
  }

  // Offerings
  const seenOfferings = new Set<string>();
  p.offerings.forEach((o, i) => {
    const row = i + 2;
    if (!importBatches.has(o.batch)) err("Offerings", row, `Offering ${o.courseCode}: batch '${o.batch}' not in Batches sheet`);
    if (!knownCourses.has(o.courseCode) && !importCourses.has(o.courseCode)) {
      err("Offerings", row, `Course '${o.courseCode}' neither exists nor is in the Courses sheet`);
    }
    const k = `${o.batch}::${o.courseCode}`;
    if (seenOfferings.has(k)) err("Offerings", row, `Duplicate offering ${o.courseCode} for batch ${o.batch}`);
    seenOfferings.add(k);
    if (o.sections.length === 0) err("Offerings", row, `Offering ${o.courseCode}: no sections listed`);
    for (const s of o.sections) {
      if (!importSections.has(sectionKey(o.batch, s))) {
        err("Offerings", row, `Offering ${o.courseCode}: section '${s}' not defined for batch ${o.batch}`);
      }
    }
  });

  // Instructors
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const importInstructorEmails = new Set<string>();
  p.instructors.forEach((ins, i) => {
    const row = i + 2;
    if (!ins.fullName) err("Instructors", row, "Missing full name");
    if (!ins.email || !emailRe.test(ins.email)) err("Instructors", row, `${ins.fullName || "(unnamed)"}: missing or invalid email`);
    else if (importInstructorEmails.has(ins.email)) err("Instructors", row, `Duplicate instructor email ${ins.email}`);
    importInstructorEmails.add(ins.email);
    if (!["FULL_TIME", "PART_TIME"].includes(ins.employment)) {
      err("Instructors", row, `${ins.fullName || ins.email}: employment must be FULL_TIME or PART_TIME, got '${ins.employment}'`);
    }
  });

  // Students
  const importStudentEmails = new Set<string>();
  p.students.forEach((s, i) => {
    const row = i + 2;
    if (!s.fullName) err("Students", row, "Missing full name");
    if (!s.email || !emailRe.test(s.email)) err("Students", row, `${s.fullName || "(unnamed)"}: missing or invalid email`);
    else if (importStudentEmails.has(s.email)) err("Students", row, `Duplicate student email ${s.email}`);
    importStudentEmails.add(s.email);
    if (!importSections.has(sectionKey(s.batch, s.section))) {
      err("Students", row, `${s.fullName || s.email}: section '${s.batch}/${s.section}' not in Sections sheet`);
    }
    if (s.group && !importGroups.has(groupKey(s.batch, s.section, s.group))) {
      err("Students", row, `${s.fullName || s.email}: group '${s.batch}/${s.section}/${s.group}' not in Groups sheet`);
    }
  });

  return {
    errors, warnings,
    summary: {
      courses: p.courses.length, batches: p.batches.length, sections: p.sections.length,
      groups: p.groups.length, offerings: p.offerings.length,
      instructors: p.instructors.length, students: p.students.length,
      errors: errors.length, warnings: warnings.length,
    },
  };
}

/** Commit a validated import in one transaction (upsert semantics, audited). */
export async function commitImport(importId: string, p: ParsedImport, actorId: string, requestId?: string) {
  await db.$transaction(async (tx) => {
    // Atomically claim the VALIDATED -> COMMITTED transition first. The
    // caller already checked status before calling this, but that check and
    // this transaction aren't the same operation — two concurrent commit
    // requests can both pass the pre-check before either writes. Doing the
    // claim as a conditional update (not a plain update) closes that window:
    // only one concurrent transaction's updateMany can match count 1.
    const claimed = await tx.importBatch.updateMany({
      where: { id: importId, status: "VALIDATED" },
      data: { status: "COMMITTED" },
    });
    if (claimed.count === 0) {
      throw new HttpError(409, "Import already committed or no longer in a committable state");
    }

    // Course/Instructor/Student/Section natural keys are only unique among
    // non-deleted rows (a partial index, not a plain Prisma @@unique — see
    // schema.prisma), so Prisma's upsert() can't target them directly. Look
    // up the active row by hand instead: match an existing *active* row to
    // update, or create a fresh one — never resurrect a soft-deleted row by
    // matching it here, since that would silently reattach history to a new
    // import rather than starting a clean record.
    for (const c of p.courses) {
      const existing = await tx.course.findFirst({ where: { code: c.code, deletedAt: null } });
      if (existing) await tx.course.update({ where: { id: existing.id }, data: c });
      else await tx.course.create({ data: c });
    }

    for (const ins of p.instructors) {
      const data = { fullName: ins.fullName, employment: ins.employment as "FULL_TIME" | "PART_TIME" };
      const existing = await tx.instructor.findFirst({ where: { email: ins.email, deletedAt: null } });
      if (existing) await tx.instructor.update({ where: { id: existing.id }, data });
      else await tx.instructor.create({ data: { ...data, email: ins.email } });
    }

    // Batches/offerings reference programs/periods/courses by natural key.
    // Those were confirmed to exist at *validation* time, but a commit can
    // happen much later (imports sit as VALIDATED until someone clicks
    // Commit) — if the reference was deleted or renamed meanwhile, fail with
    // a clean, specific 400 rather than crashing on a non-null assertion
    // inside the transaction.
    const programs = await tx.program.findMany();
    const periods = await tx.academicPeriod.findMany();
    const batchIds = new Map<string, string>();
    for (const b of p.batches) {
      const program = programs.find((x) => x.code === b.programCode);
      if (!program) throw new HttpError(400, `Batch '${b.name}': program '${b.programCode}' no longer exists — re-validate and try again`);
      const period = periods.find((x) => x.name === b.periodName);
      if (!period) throw new HttpError(400, `Batch '${b.name}': academic period '${b.periodName}' no longer exists — re-validate and try again`);
      const programId = program.id;
      const periodId = period.id;
      const row = await tx.batch.upsert({
        where: { name_programId_periodId: { name: b.name, programId, periodId } },
        update: { deletedAt: null },
        create: { name: b.name, programId, periodId },
      });
      batchIds.set(b.name, row.id);
    }

    const sectionIds = new Map<string, string>();
    for (const s of p.sections) {
      const batchId = batchIds.get(s.batch)!;
      const existing = await tx.section.findFirst({ where: { name: s.name, batchId, deletedAt: null } });
      const row = existing
        ? await tx.section.update({ where: { id: existing.id }, data: { headcount: s.headcount } })
        : await tx.section.create({ data: { name: s.name, batchId, headcount: s.headcount } });
      sectionIds.set(`${s.batch}::${s.name}`, row.id);
    }

    const groupIds = new Map<string, string>();
    for (const g of p.groups) {
      const sectionId = sectionIds.get(`${g.batch}::${g.section}`)!;
      const row = await tx.labGroup.upsert({
        where: { name_sectionId: { name: g.name, sectionId } },
        update: { headcount: g.headcount, deletedAt: null },
        create: { name: g.name, sectionId, headcount: g.headcount },
      });
      groupIds.set(`${g.batch}::${g.section}::${g.name}`, row.id);
    }

    for (const s of p.students) {
      const sectionId = sectionIds.get(`${s.batch}::${s.section}`)!;
      const groupId = s.group ? groupIds.get(`${s.batch}::${s.section}::${s.group}`) ?? null : null;
      const data = { fullName: s.fullName, sectionId, groupId };
      const existing = await tx.student.findFirst({ where: { email: s.email, deletedAt: null } });
      if (existing) await tx.student.update({ where: { id: existing.id }, data });
      else await tx.student.create({ data: { ...data, email: s.email } });
    }

    const courses = await tx.course.findMany({ where: { deletedAt: null } });
    for (const o of p.offerings) {
      const batchId = batchIds.get(o.batch)!;
      const course = courses.find((c) => c.code === o.courseCode);
      if (!course) throw new HttpError(400, `Offering for batch '${o.batch}': course '${o.courseCode}' no longer exists — re-validate and try again`);
      const courseId = course.id;
      const secIds = o.sections.map((s) => ({ id: sectionIds.get(`${o.batch}::${s}`)! }));
      const existing = await tx.courseOffering.findUnique({ where: { courseId_batchId: { courseId, batchId } } });
      if (existing) {
        await tx.courseOffering.update({
          where: { id: existing.id },
          data: { sharedLecture: o.sharedLecture, deletedAt: null, sections: { set: secIds } },
        });
      } else {
        await tx.courseOffering.create({
          data: { courseId, batchId, sharedLecture: o.sharedLecture, sections: { connect: secIds } },
        });
      }
    }

    await audit(
      {
        action: "import.committed", actorId,
        entityType: "ImportBatch", entityId: importId,
        meta: {
          courses: p.courses.length, batches: p.batches.length,
          sections: p.sections.length, groups: p.groups.length, offerings: p.offerings.length,
          instructors: p.instructors.length, students: p.students.length,
        },
        requestId,
      },
      tx
    );
  }, { timeout: 60_000 });
}
