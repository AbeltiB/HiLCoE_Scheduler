import { z } from "zod";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24h)");

const periodBase = z.object({
  name: z.string().min(2).max(80),
  type: z.enum(["SEMESTER", "TERM"]),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});
export const periodSchema = periodBase.refine((d) => d.endDate > d.startDate, {
  path: ["endDate"], message: "End date must be after start date",
});
// .partial() can't be called on a refined (ZodEffects) schema — Zod throws.
// Kept as an explicit sibling schema for PATCH rather than probing schema
// internals at runtime. Only re-checks the date ordering when an edit
// actually touches both dates together; a single-field edit is validated
// against whichever date it changes without re-fetching the other from the DB.
export const periodUpdateSchema = periodBase.partial().refine(
  (d) => !(d.startDate && d.endDate) || d.endDate > d.startDate,
  { path: ["endDate"], message: "End date must be after start date" }
);

export const programSchema = z.object({
  code: z.string().min(2).max(20),
  name: z.string().min(2).max(120),
  level: z.enum(["UG", "PG"]),
});

export const batchSchema = z.object({
  name: z.string().min(1).max(60),
  programId: z.string().uuid(),
  periodId: z.string().uuid(),
});

export const sectionSchema = z.object({
  name: z.string().min(1).max(20),
  batchId: z.string().uuid(),
  headcount: z.coerce.number().int().positive(),
});

export const groupSchema = z.object({
  name: z.string().min(1).max(20),
  sectionId: z.string().uuid(),
  headcount: z.coerce.number().int().positive(),
});

const courseBase = z.object({
  code: z.string().min(2).max(20),
  name: z.string().min(2).max(160),
  lectureCreditHrs: z.coerce.number().int().min(0).max(12),
  labCreditHrs: z.coerce.number().int().min(0).max(12),
  lectureSessionsPerWeek: z.coerce.number().int().min(0).max(6),
  labSessionsPerWeek: z.coerce.number().int().min(0).max(6),
  labNeedsDoublePeriod: z.coerce.boolean().default(false),
});
export const courseSchema = courseBase.refine((c) => c.lectureSessionsPerWeek + c.labSessionsPerWeek > 0, {
  path: ["lectureSessionsPerWeek"],
  message: "A course must have at least one weekly session",
});
// See periodUpdateSchema above for why this is a sibling schema, not a
// derived .partial(). Only re-checks the weekly-session-count invariant when
// an edit touches both session-count fields together.
export const courseUpdateSchema = courseBase.partial().refine(
  (c) =>
    c.lectureSessionsPerWeek === undefined ||
    c.labSessionsPerWeek === undefined ||
    c.lectureSessionsPerWeek + c.labSessionsPerWeek > 0,
  { path: ["lectureSessionsPerWeek"], message: "A course must have at least one weekly session" }
);

export const studentSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email(),
  sectionId: z.string().uuid(),
  groupId: z.string().uuid().nullable().optional(),
});

export const roomSchema = z.object({
  name: z.string().min(1).max(60),
  type: z.enum(["LECTURE", "LAB"]),
  capacity: z.coerce.number().int().positive(),
  active: z.coerce.boolean().default(true),
});

export const instructorSchema = z.object({
  fullName: z.string().min(2).max(120),
  employment: z.enum(["FULL_TIME", "PART_TIME"]),
  coursePoolIds: z.array(z.string().uuid()).default([]),
  userId: z.string().uuid().nullable().optional(),
});

export const offeringSchema = z.object({
  courseId: z.string().uuid(),
  batchId: z.string().uuid(),
  sectionIds: z.array(z.string().uuid()).min(1),
  sharedLecture: z.coerce.boolean().default(false),
  lectureInstructorIds: z.array(z.string().uuid()).default([]),
  labInstructorIds: z.array(z.string().uuid()).default([]),
});

export const slotTemplateSchema = z.object({
  name: z.string().min(2).max(80),
  active: z.coerce.boolean().default(false),
});

export const slotDefSchema = z.object({
  day: z.coerce.number().int().min(1).max(7),
  index: z.coerce.number().int().min(1).max(12),
  startTime: time,
  endTime: time,
  audience: z.array(z.enum(["UG", "PG"])).min(1),
  blocked: z.coerce.boolean().default(false),
});

export const slotsBulkSchema = z.object({ slots: z.array(slotDefSchema) });

export const availabilityBulkSchema = z.object({
  entries: z.array(z.object({
    slotDefId: z.string().uuid(),
    status: z.enum(["AVAILABLE", "AVOID", "UNAVAILABLE"]),
    reason: z.string().max(300).nullable().optional(),
  })),
});

export const scheduleSchema = z.object({
  periodId: z.string().uuid(),
  slotTemplateId: z.string().uuid(),
  effectiveFrom: z.coerce.date().optional(),
  effectiveTo: z.coerce.date().optional(),
});

export const scheduleConfigSchema = z.object({
  weights: z.object({
    student_gap: z.coerce.number().int().min(0).max(50).default(5),
    single_session_day: z.coerce.number().int().min(0).max(50).default(3),
    same_course_same_day: z.coerce.number().int().min(0).max(50).default(8),
    lab_before_lecture: z.coerce.number().int().min(0).max(50).default(2),
    instructor_consecutive_4plus: z.coerce.number().int().min(0).max(50).default(4),
    instructor_daily_overload: z.coerce.number().int().min(0).max(50).default(2),
    room_instability: z.coerce.number().int().min(0).max(50).default(1),
  }),
  options: z.object({
    instructor_max_periods_per_day: z.coerce.number().int().min(1).max(8).default(4),
    max_time_seconds: z.coerce.number().int().min(5).max(600).default(60),
  }),
});

export const broadcastSchema = z.object({
  subject: z.string().min(2).max(200),
  body: z.string().min(2).max(20000),
  allStudents: z.coerce.boolean().default(false),
  allInstructors: z.coerce.boolean().default(false),
  sectionIds: z.array(z.string().uuid()).default([]),
  groupIds: z.array(z.string().uuid()).default([]),
  instructorIds: z.array(z.string().uuid()).default([]),
  studentIds: z.array(z.string().uuid()).default([]),
}).refine(
  (d) => d.allStudents || d.allInstructors || d.sectionIds.length + d.groupIds.length + d.instructorIds.length + d.studentIds.length > 0,
  { path: ["allStudents"], message: "Pick at least one audience" }
);

export const moveSchema = z.object({
  slotDefId: z.string().uuid(),
  roomId: z.string().uuid(),
  pinned: z.boolean().optional(),
});
