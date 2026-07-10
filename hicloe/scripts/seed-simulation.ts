/**
 * Seeds a full realistic HiLCoE simulation dataset into the live app via its
 * real HTTP API (entity CRUD + the registration import pipeline) — not a
 * direct DB write — so every one of the audit-fix code paths (validation,
 * partial unique indexes, import commit, offering instructor assignment,
 * availability defaults, solver generate/poll) gets exercised by real data.
 * Also writes the same dataset out as an .xlsx workbook for reference.
 *
 * One semester (batches suffixed "01" — first/regular intake) and one term
 * (batches suffixed "02" — mid-year intake) run concurrently, per HiLCoE's
 * own batch-naming convention.
 *
 * Run from hicloe/:  npx tsx scripts/seed-simulation.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { randomBytes, createHash } from "crypto";
import * as XLSX from "xlsx";
import * as path from "path";
import * as fs from "fs";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }) });
// Deliberately not process.env.APP_URL — that's the app's configured default
// (port 3000) which may not be where this particular server instance is
// actually listening (e.g. it fell back to 3001 because 3000 was in use).
const BASE = process.env.SEED_APP_URL ?? "http://127.0.0.1:3001";
const stamp = Date.now();

let cookie = "";
async function api(method: string, apiPath: string, body?: unknown) {
  // This box runs at very tight free memory, and the dev server periodically
  // gets busy enough (Turbopack recompiling a page, a live browser session)
  // that its accept queue refuses new connections for tens of seconds at a
  // stretch — retry with real patience rather than giving up after a blip.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 15; attempt++) {
    try {
      const res = await fetch(`${BASE}${apiPath}`, {
        method,
        headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const setCookie = res.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";")[0];
      let json: any = null;
      try { json = await res.json(); } catch { /* no body */ }
      return { status: res.status, json };
    } catch (e) {
      lastErr = e;
      console.log(`    (transient fetch error on ${method} ${apiPath}, retrying in 5s: ${(e as Error).message})`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  throw lastErr;
}

/** Poll the app until it answers quickly, before touching any real endpoint. */
async function waitForServerReady() {
  for (let attempt = 0; attempt < 30; attempt++) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${BASE}/login`, { signal: AbortSignal.timeout(5000) });
      console.log(`    [preflight ${attempt}] status=${res.status} after ${Date.now() - t0}ms`);
      if (res.status === 200) return;
    } catch (e) {
      console.log(`    [preflight ${attempt}] error after ${Date.now() - t0}ms: ${(e as Error).message} cause=${(e as any).cause?.message ?? (e as any).cause}`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("dev server never became ready");
}

function ok(res: { status: number; json: any }, label: string, ...acceptable: number[]) {
  const accept = acceptable.length ? acceptable : [200, 201];
  if (!accept.includes(res.status)) {
    throw new Error(`${label}: expected ${accept.join("/")}, got ${res.status} ${JSON.stringify(res.json)}`);
  }
  return res.json;
}

// ── Reference dataset ───────────────────────────────────────────────────
const PROGRAMS = [
  { code: "CS-UG", name: "Computer Science (Undergraduate)", level: "UG" },
  { code: "SE-UG", name: "Software Engineering (Undergraduate)", level: "UG" },
  { code: "CS-PG", name: "Computer Science (Postgraduate)", level: "PG" },
  { code: "SE-PG", name: "Software Engineering (Postgraduate)", level: "PG" },
];

const SEMESTER_NAME = "Semester I 2026/27";
const TERM_NAME = "Term I 2026/27";

const ROOMS = [
  ["LR 201", "LECTURE", 35], ["LR 202", "LECTURE", 50], ["LR 203", "LECTURE", 35],
  ["LR 301", "LECTURE", 40], ["LR 302", "LECTURE", 35], ["LR 303", "LECTURE", 40],
  ["LR 401", "LECTURE", 35], ["LR 402", "LECTURE", 40], ["LR 403", "LECTURE", 35],
  ["LR 601", "LECTURE", 70],
  ["Lab 201", "LAB", 30], ["Lab 301", "LAB", 30], ["Lab 401", "LAB", 30], ["Lab 501", "LAB", 28],
] as const;

// code, name, lec_credit, lab_credit, lec/wk, lab/wk, double_lab
const COURSES = [
  ["CC1234", "Communication Skills", 3, 0, 2, 0, "N"],
  ["CC2050", "Entrepreneurship", 2, 0, 2, 0, "N"],
  ["CS222", "Computer Organization", 2, 1, 2, 1, "N"],
  ["CS2210", "Object-Oriented Programming", 3, 1, 2, 1, "N"],
  ["CS2343", "Data Structures & Algorithms", 3, 1, 2, 1, "N"],
  ["CS3320", "Database Systems", 3, 1, 2, 1, "N"],
  ["CS3341", "Computer Networks", 3, 1, 2, 1, "N"],
  ["CS3350", "Operating Systems", 3, 1, 2, 1, "Y"],
  ["CS4410", "Artificial Intelligence", 3, 1, 2, 1, "N"],
  ["CS4460", "Compiler Design", 3, 0, 2, 0, "N"],
  ["CS5510", "Distributed Systems", 3, 0, 2, 0, "N"],
  ["CS5520", "Machine Learning", 3, 1, 2, 1, "N"],
  ["CS5544", "Computer Security", 3, 1, 2, 1, "N"],
  ["SE1233", "Fundamentals of Software Engineering", 3, 0, 2, 0, "N"],
  ["SE444", "Software Design & Architecture", 3, 1, 2, 1, "N"],
  ["SE3330", "Requirements Engineering", 3, 0, 2, 0, "N"],
  ["SE3360", "Web Development", 3, 1, 2, 1, "N"],
  ["CS6110", "Advanced Machine Learning", 3, 1, 2, 1, "N"],
  ["CS6130", "Big Data Analytics", 3, 0, 2, 0, "N"],
  ["CS6150", "Research Methods", 2, 0, 1, 0, "N"],
  ["CS6170", "Advanced Algorithms", 3, 0, 2, 0, "N"],
  ["SE6210", "Advanced Software Architecture", 3, 0, 2, 0, "N"],
  ["SE6230", "DevOps & Cloud Engineering", 3, 1, 2, 1, "N"],
  ["SE6250", "Software Project Management", 2, 0, 1, 0, "N"],
] as const;

// batch, program, period ("SEMESTER"|"TERM"), sections{name: headcount}
// "01" suffix = first/regular intake -> Semester; "02" suffix = mid-year
// intake -> the concurrent Term. Year-in-program = 2026 - entry year.
const BATCHES: [string, string, "SEMESTER" | "TERM", Record<string, number>][] = [
  ["DRB2202", "CS-UG", "TERM", { A: 36, B: 34 }],       // entry 2022 -> UG year 5
  ["DRB2302", "CS-UG", "TERM", { A: 34, B: 33 }],       // entry 2023 -> UG year 4
  ["DRB2401", "CS-UG", "SEMESTER", { A: 38, B: 36 }],   // entry 2024 -> UG year 3
  ["DRBSE2401", "SE-UG", "SEMESTER", { A: 32, B: 31, C: 30 }], // year 3, 3-section test
  ["DRBSE2501", "SE-UG", "SEMESTER", { A: 45, B: 43 }], // year 2, big-room test
  ["PGB2601", "CS-PG", "SEMESTER", { A: 28 }],          // entry 2026 -> PG year 1
  ["PGBSE2601", "SE-PG", "SEMESTER", { A: 26 }],        // entry 2026 -> PG year 1
];

const FT = "FULL_TIME", PT = "PART_TIME";
const INSTRUCTORS = [
  ["Dr. Abebe Bekele", "abebe.bekele", FT], ["Dr. Almaz Tesfaye", "almaz.tesfaye", FT],
  ["Mr. Dawit Haile", "dawit.haile", FT], ["Ms. Hanna Girma", "hanna.girma", FT],
  ["Dr. Kebede Alemu", "kebede.alemu", FT], ["Mr. Samuel Tadesse", "samuel.tadesse", FT],
  ["Ms. Selam Worku", "selam.worku", FT], ["Dr. Tewodros Assefa", "tewodros.assefa", FT],
  ["Mr. Yonas Mekonnen", "yonas.mekonnen", FT], ["Ms. Meron Abera", "meron.abera", FT],
  ["Mr. Henok Assefa", "henok.assefa", FT], ["Ms. Bethlehem Tadesse", "bethlehem.tadesse", FT],
  ["Dr. Fikru Gebremedhin", "fikru.gebremedhin", PT], ["Ms. Rahel Negash", "rahel.negash", PT],
  ["Mr. Binyam Kassa", "binyam.kassa", PT], ["Dr. Saba Alemayehu", "saba.alemayehu", PT],
] as const;
const EMAIL = (name: string) => `${INSTRUCTORS.find((i) => i[0] === name)![1]}@hilcoe.edu.et`;
const EMP = (name: string) => INSTRUCTORS.find((i) => i[0] === name)![2];

// batch, course_code, shared_lecture, lecture_instructors[], lab_instructors[]
const OFFERINGS: [string, string, "Y" | "N", string[], string[]][] = [
  ["DRB2202", "CS5510", "N", ["Dr. Abebe Bekele"], []],
  ["DRB2202", "CS5544", "N", ["Dr. Kebede Alemu"], ["Dr. Kebede Alemu"]],
  ["DRB2202", "CS5520", "N", ["Dr. Tewodros Assefa"], ["Dr. Tewodros Assefa"]],
  ["DRB2202", "CS4460", "N", ["Mr. Yonas Mekonnen"], []],
  ["DRB2202", "CC2050", "Y", ["Ms. Meron Abera"], []],
  ["DRB2302", "CS4410", "N", ["Dr. Abebe Bekele"], ["Ms. Hanna Girma"]],
  ["DRB2302", "CS4460", "N", ["Mr. Yonas Mekonnen"], []],
  ["DRB2302", "CS3341", "N", ["Mr. Samuel Tadesse"], ["Mr. Samuel Tadesse"]],
  ["DRB2302", "CS3320", "N", ["Dr. Almaz Tesfaye"], ["Mr. Dawit Haile"]],
  ["DRB2302", "CC2050", "Y", ["Ms. Meron Abera"], []],
  ["DRB2401", "CS3320", "N", ["Dr. Almaz Tesfaye"], ["Mr. Dawit Haile"]],
  ["DRB2401", "CS3350", "N", ["Dr. Kebede Alemu"], ["Mr. Yonas Mekonnen"]],
  ["DRB2401", "CS3341", "N", ["Mr. Samuel Tadesse"], ["Mr. Dawit Haile"]],
  ["DRB2401", "CS2343", "N", ["Dr. Tewodros Assefa"], ["Ms. Hanna Girma"]],
  ["DRB2401", "CC1234", "N", ["Ms. Selam Worku"], []],
  ["DRBSE2401", "SE3330", "N", ["Mr. Henok Assefa"], []],
  ["DRBSE2401", "SE3360", "N", ["Ms. Bethlehem Tadesse"], ["Mr. Henok Assefa"]],
  ["DRBSE2401", "SE444", "N", ["Mr. Henok Assefa"], ["Ms. Bethlehem Tadesse"]],
  ["DRBSE2401", "CS3320", "N", ["Dr. Almaz Tesfaye"], ["Ms. Hanna Girma"]],
  ["DRBSE2401", "CC1234", "N", ["Ms. Selam Worku"], []],
  ["DRBSE2501", "SE1233", "N", ["Mr. Samuel Tadesse"], []],
  ["DRBSE2501", "CS2210", "N", ["Ms. Meron Abera"], ["Ms. Meron Abera"]],
  ["DRBSE2501", "CS2343", "N", ["Dr. Tewodros Assefa"], ["Ms. Hanna Girma"]],
  ["DRBSE2501", "CS222", "N", ["Dr. Abebe Bekele"], ["Dr. Abebe Bekele"]],
  ["DRBSE2501", "CC1234", "N", ["Ms. Selam Worku"], []],
  ["PGB2601", "CS6110", "N", ["Dr. Fikru Gebremedhin"], ["Dr. Fikru Gebremedhin"]],
  ["PGB2601", "CS6130", "N", ["Ms. Rahel Negash"], []],
  ["PGB2601", "CS6150", "N", ["Ms. Rahel Negash", "Dr. Saba Alemayehu"], []],
  ["PGB2601", "CS6170", "N", ["Dr. Saba Alemayehu"], []],
  ["PGBSE2601", "SE6210", "N", ["Mr. Binyam Kassa"], []],
  ["PGBSE2601", "SE6230", "N", ["Dr. Saba Alemayehu"], ["Dr. Saba Alemayehu"]],
  ["PGBSE2601", "SE6250", "N", ["Mr. Binyam Kassa"], []],
  ["PGBSE2601", "CS6150", "N", ["Ms. Rahel Negash"], []],
];

const FIRST = ["Hana", "Dawit", "Selam", "Yonas", "Meron", "Abel", "Lidya", "Nahom", "Sara", "Bereket",
  "Ruth", "Eyob", "Mahlet", "Kaleb", "Tsion", "Natnael", "Feven", "Amanuel", "Rediet", "Elias"];
const FATHER = ["Alemu", "Bekele", "Tesfaye", "Girma", "Haile", "Kebede", "Tadesse", "Worku", "Assefa",
  "Mekonnen", "Abera", "Negash", "Kassa", "Desta", "Fikre", "Gebre", "Lemma", "Mulu"];

function buildGroupsAndStudents() {
  const groups: { batch: string; section: string; group: string; headcount: number }[] = [];
  const students: { batch: string; section: string; group: string; fullName: string; email: string }[] = [];
  let i = 0;
  for (const [batch, , , sections] of BATCHES) {
    let gnum = 0;
    for (const [sec, h] of Object.entries(sections)) {
      for (const [, part] of [[1, Math.ceil(h / 2)], [2, Math.floor(h / 2)]] as const) {
        gnum += 1;
        const gname = `G${gnum}`;
        groups.push({ batch, section: sec, group: gname, headcount: part });
        for (let k = 0; k < 6; k++) {
          const fn = FIRST[i % FIRST.length], fa = FATHER[Math.floor(i / FIRST.length) % FATHER.length];
          students.push({
            batch, section: sec, group: gname,
            fullName: `${fn} ${fa}`,
            email: `${fn.toLowerCase()}.${fa.toLowerCase()}${String(i).padStart(3, "0")}@stu.hilcoe.edu.et`,
          });
          i++;
        }
      }
    }
  }
  return { groups, students };
}

function buildWorkbook() {
  const wb = XLSX.utils.book_new();
  const sheet = (name: string, rows: Record<string, unknown>[]) =>
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);

  sheet("Courses", COURSES.map(([code, name, lc, lb, lw, bw, dl]) => ({
    code, name, lecture_credit: lc, lab_credit: lb, lecture_per_week: lw, lab_per_week: bw, double_lab: dl,
  })));
  sheet("Batches", BATCHES.map(([batch, prog, per]) => ({
    batch, program_code: prog, period_name: per === "SEMESTER" ? SEMESTER_NAME : TERM_NAME,
  })));
  sheet("Sections", BATCHES.flatMap(([batch, , , secs]) =>
    Object.entries(secs).map(([s, h]) => ({ batch, section: s, headcount: h }))));
  const { groups, students } = buildGroupsAndStudents();
  sheet("Groups", groups.map((g) => ({ batch: g.batch, section: g.section, group: g.group, headcount: g.headcount })));
  sheet("Offerings", OFFERINGS.map(([batch, code, shared, lec, lab]) => ({
    batch, course_code: code,
    sections: Object.keys(BATCHES.find((b) => b[0] === batch)![3]).join(","),
    shared_lecture: shared,
    // Reference-only columns — the import pipeline doesn't parse instructor
    // assignment from the workbook; this script sets it afterward via the
    // offerings API. Kept here so the file stands alone as documentation.
    lecture_instructors: lec.map(EMAIL).join(","),
    lab_instructors: lab.map(EMAIL).join(","),
  })));
  sheet("Instructors", INSTRUCTORS.map(([name, , emp]) => ({ full_name: name, email: EMAIL(name), employment: emp })));
  sheet("Students", students.map((s) => ({ batch: s.batch, section: s.section, group: s.group, full_name: s.fullName, email: s.email })));

  const dir = path.resolve(__dirname, "..", "seed-data");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "hilcoe-simulation-data.xlsx");
  XLSX.writeFile(wb, file);
  return file;
}

// The commit endpoint runs one Prisma transaction with a fixed 60s budget;
// at ~270 sequential upsert round-trips (courses+instructors+batches+
// sections+groups+students+offerings) over a remote pooled Postgres
// connection that budget is exceeded (confirmed: P2028 timeout at exactly
// 60s). Splitting into a small "core" import (no Students) plus several
// chunked Student-only imports keeps each transaction comfortably under
// budget — a legitimate way to use the existing import feature for a
// dataset this size, no different from a registrar uploading per-batch.
function sheetHelper(wb: XLSX.WorkBook) {
  return (name: string, rows: Record<string, unknown>[]) =>
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
}

function buildCourseInstructorWorkbook() {
  const wb = XLSX.utils.book_new();
  const sheet = sheetHelper(wb);
  sheet("Courses", COURSES.map(([code, name, lc, lb, lw, bw, dl]) => ({
    code, name, lecture_credit: lc, lab_credit: lb, lecture_per_week: lw, lab_per_week: bw, double_lab: dl,
  })));
  sheet("Instructors", INSTRUCTORS.map(([name, , emp]) => ({ full_name: name, email: EMAIL(name), employment: emp })));
  return wb;
}

function buildBatchSectionGroupWorkbook() {
  const wb = XLSX.utils.book_new();
  const sheet = sheetHelper(wb);
  sheet("Batches", BATCHES.map(([batch, prog, per]) => ({
    batch, program_code: prog, period_name: per === "SEMESTER" ? SEMESTER_NAME : TERM_NAME,
  })));
  sheet("Sections", BATCHES.flatMap(([batch, , , secs]) =>
    Object.entries(secs).map(([s, h]) => ({ batch, section: s, headcount: h }))));
  const { groups } = buildGroupsAndStudents();
  sheet("Groups", groups.map((g) => ({ batch: g.batch, section: g.section, group: g.group, headcount: g.headcount })));
  return wb;
}

function buildOfferingsWorkbook() {
  const wb = XLSX.utils.book_new();
  const sheet = sheetHelper(wb);
  // Batches/Sections re-declared for validateImport's section-membership
  // check; Courses/Instructors aren't needed here since by this point
  // they're already committed and validateImport checks those against the
  // live DB (knownCourses), not just the workbook's own sheets.
  sheet("Batches", BATCHES.map(([batch, prog, per]) => ({
    batch, program_code: prog, period_name: per === "SEMESTER" ? SEMESTER_NAME : TERM_NAME,
  })));
  sheet("Sections", BATCHES.flatMap(([batch, , , secs]) =>
    Object.entries(secs).map(([s, h]) => ({ batch, section: s, headcount: h }))));
  sheet("Offerings", OFFERINGS.map(([batch, code, shared]) => ({
    batch, course_code: code,
    sections: Object.keys(BATCHES.find((b) => b[0] === batch)![3]).join(","),
    shared_lecture: shared,
  })));
  return wb;
}

function buildStudentChunkWorkbook(chunk: { batch: string; section: string; group: string; fullName: string; email: string }[]) {
  const wb = XLSX.utils.book_new();
  const sheet = (name: string, rows: Record<string, unknown>[]) =>
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
  // Batches/Sections/Groups must be re-declared in every import —
  // validateImport only cross-checks a workbook's own sheets, not rows
  // already committed by an earlier import.
  sheet("Batches", BATCHES.map(([batch, prog, per]) => ({
    batch, program_code: prog, period_name: per === "SEMESTER" ? SEMESTER_NAME : TERM_NAME,
  })));
  sheet("Sections", BATCHES.flatMap(([batch, , , secs]) =>
    Object.entries(secs).map(([s, h]) => ({ batch, section: s, headcount: h }))));
  const { groups } = buildGroupsAndStudents();
  sheet("Groups", groups.map((g) => ({ batch: g.batch, section: g.section, group: g.group, headcount: g.headcount })));
  sheet("Students", chunk.map((s) => ({ batch: s.batch, section: s.section, group: s.group, full_name: s.fullName, email: s.email })));
  return wb;
}

async function uploadAndCommitOnce(wb: XLSX.WorkBook, label: string) {
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  let upload: any, uploadStatus = 0;
  for (let attempt = 0; attempt < 15; attempt++) {
    try {
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(buf)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${label}.xlsx`);
      const uploadRes = await fetch(`${BASE}/api/imports`, { method: "POST", headers: { cookie }, body: form });
      uploadStatus = uploadRes.status;
      upload = await uploadRes.json();
      break;
    } catch (e) {
      console.log(`    (transient fetch error on ${label} upload, retrying in 5s: ${(e as Error).message})`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  if (uploadStatus !== 201 || upload.status !== "VALIDATED") {
    throw new Error(`${label}: import validation failed: ${JSON.stringify(upload?.report ?? upload, null, 2)}`);
  }
  ok(await api("POST", `/api/imports/${upload.id}/commit`, {}), `${label} commit`, 200);
  return upload.report.summary;
}

// The DB host itself is intermittently unreachable from this network (real
// connectivity flakiness, confirmed separately) — a failed commit doesn't
// corrupt anything (the ImportBatch just sits FAILED), so retrying the whole
// upload+validate+commit sequence is safe and the right response here.
async function uploadAndCommit(wb: XLSX.WorkBook, label: string) {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await uploadAndCommitOnce(wb, label);
    } catch (e) {
      lastErr = e;
      console.log(`    (${label} failed on attempt ${attempt + 1}, retrying in 10s: ${(e as Error).message.slice(0, 200)})`);
      await new Promise((r) => setTimeout(r, 10000));
    }
  }
  throw lastErr;
}

async function main() {
  console.log("=== Seeding full HiLCoE simulation dataset into the live app ===\n");

  await waitForServerReady();
  console.log("[pre] dev server is responsive");

  // ── 0. Seed-runner session (disposable admin, suspended at the end) ──
  const email = `seed-runner-${stamp}@example.invalid`;
  const superRole = await db.role.findUniqueOrThrow({ where: { name: "SUPER_ADMIN" } });
  const runner = await db.user.create({
    data: { email, fullName: "Seed Runner", status: "INVITED", roles: { connect: { id: superRole.id } } },
  });
  const rawToken = randomBytes(32).toString("base64url");
  await db.authToken.create({
    data: { tokenHash: createHash("sha256").update(rawToken).digest("hex"), purpose: "ACTIVATION", userId: runner.id, expiresAt: new Date(Date.now() + 3600_000) },
  });
  ok(await api("POST", "/api/auth/activate", { token: rawToken, password: "SeedRunner!2026", confirm: "SeedRunner!2026" }), "activate", 200);
  console.log("[0] seed-runner session established");

  // ── 1. Programs, Periods, Rooms ──
  const programId: Record<string, string> = {};
  for (const p of PROGRAMS) {
    const r = ok(await api("POST", "/api/entities/programs", p), `program ${p.code}`, 201);
    programId[p.code] = r.row.id;
  }
  const semester = ok(await api("POST", "/api/entities/periods", {
    name: SEMESTER_NAME, type: "SEMESTER", startDate: "2026-09-01", endDate: "2026-12-20",
  }), "semester period", 201).row;
  const term = ok(await api("POST", "/api/entities/periods", {
    name: TERM_NAME, type: "TERM", startDate: "2026-09-01", endDate: "2026-10-24",
  }), "term period", 201).row;
  const roomId: Record<string, string> = {};
  for (const [name, type, capacity] of ROOMS) {
    const r = ok(await api("POST", "/api/entities/rooms", { name, type, capacity }), `room ${name}`, 201);
    roomId[name] = r.row.id;
  }
  console.log(`[1] ${PROGRAMS.length} programs, 2 periods (${SEMESTER_NAME} / ${TERM_NAME}), ${ROOMS.length} rooms created`);

  // ── 2. Slot template + default grid ──
  const tmpl = ok(await api("POST", "/api/entities/slot-templates", { name: "Standard Weekly Grid 2026/27", active: true }), "slot template", 201).row;
  const genDefault = ok(await api("POST", `/api/entities/slot-templates/${tmpl.id}/generate-default`, {}), "generate-default", 200);
  console.log(`[2] slot template active with ${genDefault.count} generated slots`);

  // ── 3. Reference workbook (full dataset, for human inspection) ──
  const file = buildWorkbook();
  console.log(`[3] reference workbook written: ${file}`);

  // ── 3b. Seed via the real import pipeline, split into small imports to
  // stay well under the commit transaction's 60s budget and to keep any
  // single connectivity hiccup cheap to retry (see uploadAndCommit) ──
  const ciSummary = await uploadAndCommit(buildCourseInstructorWorkbook(), "courses-instructors");
  console.log(`[4a] courses+instructors committed: ${JSON.stringify(ciSummary)}`);

  const bsgSummary = await uploadAndCommit(buildBatchSectionGroupWorkbook(), "batches-sections-groups");
  console.log(`[4b] batches+sections+groups committed: ${JSON.stringify(bsgSummary)}`);

  const offSummary = await uploadAndCommit(buildOfferingsWorkbook(), "offerings");
  console.log(`[4c] offerings committed: ${JSON.stringify(offSummary)}`);

  const { students } = buildGroupsAndStudents();
  const CHUNK = 30;
  let studentsCommitted = 0;
  for (let i = 0; i < students.length; i += CHUNK) {
    const chunk = students.slice(i, i + CHUNK);
    const summary = await uploadAndCommit(buildStudentChunkWorkbook(chunk), `students-${i}`);
    studentsCommitted += summary.students;
    console.log(`    students ${i}-${i + chunk.length}: committed (${studentsCommitted}/${students.length} total)`);
  }
  console.log(`[4d] all ${studentsCommitted} students committed across ${Math.ceil(students.length / CHUNK)} chunks`);

  // ── 4. Wire up offering instructors (import doesn't parse those columns) ──
  const batchRows = await db.batch.findMany({ where: { name: { in: BATCHES.map((b) => b[0]) } }, select: { id: true, name: true } });
  const batchIdByName = new Map(batchRows.map((b) => [b.name, b.id]));
  const courseRows = await db.course.findMany({ where: { code: { in: COURSES.map((c) => c[0]) } }, select: { id: true, code: true } });
  const courseIdByCode = new Map(courseRows.map((c) => [c.code, c.id]));
  const instructorRows = await db.instructor.findMany({ where: { email: { in: INSTRUCTORS.map((i) => EMAIL(i[0])) } }, select: { id: true, email: true } });
  const instructorIdByEmail = new Map(instructorRows.map((i) => [i.email, i.id]));

  let wired = 0;
  for (const [batch, code, , lec, lab] of OFFERINGS) {
    const batchId = batchIdByName.get(batch)!;
    const courseId = courseIdByCode.get(code)!;
    const offering = await db.courseOffering.findUniqueOrThrow({ where: { courseId_batchId: { courseId, batchId } } });
    const lectureInstructorIds = lec.map((n) => instructorIdByEmail.get(EMAIL(n))!);
    const labInstructorIds = lab.map((n) => instructorIdByEmail.get(EMAIL(n))!);
    ok(await api("PATCH", `/api/entities/offerings/${offering.id}`, { lectureInstructorIds, labInstructorIds }), `offering ${batch}/${code} instructors`, 200);
    wired++;
  }
  console.log(`[5] ${wired} offerings wired to their lecture/lab instructors`);

  // ── 5. Instructor availability: PART_TIME instructors default to zero
  // schedulable slots (compile.ts), so every PT instructor used above needs
  // an explicit grid, mirroring a realistic "weekends + one evening period"
  // part-time window. One FULL_TIME instructor also gets a soft AVOID
  // preference to exercise that path.
  const templateSlots = (await api("GET", `/api/entities/slot-templates/${tmpl.id}`)).json.row.slots as
    { id: string; day: number; index: number; blocked: boolean }[];
  const ptWindow = templateSlots.filter((s) =>
    !s.blocked && ((s.day <= 5 && s.index === 6) || (s.day === 6 && s.index >= 4) || s.day === 7)
  ).map((s) => s.id);

  const ptInstructorNames = INSTRUCTORS.filter((i) => i[2] === PT).map((i) => i[0]);
  for (const name of ptInstructorNames) {
    const id = instructorIdByEmail.get(EMAIL(name))!;
    ok(await api("PUT", `/api/entities/instructors/${id}/availability`, {
      entries: ptWindow.map((slotDefId) => ({ slotDefId, status: "AVAILABLE" })),
    }), `availability for ${name}`, 200);
  }
  const almazId = instructorIdByEmail.get(EMAIL("Dr. Almaz Tesfaye"))!;
  const mondayMorning = templateSlots.filter((s) => s.day === 1 && (s.index === 1 || s.index === 2)).map((s) => s.id);
  ok(await api("PUT", `/api/entities/instructors/${almazId}/availability`, {
    entries: mondayMorning.map((slotDefId) => ({ slotDefId, status: "AVOID", reason: "Prefers not Monday mornings" })),
  }), "avoid-slot preference", 200);
  console.log(`[6] ${ptInstructorNames.length} part-time instructors given a real availability window; 1 soft avoid-slot preference set`);

  // ── 6. Generate + poll a real schedule for each period ──
  async function generateFor(period: { id: string; name: string }) {
    const sched = ok(await api("POST", "/api/schedules", { periodId: period.id, slotTemplateId: tmpl.id }), `schedule for ${period.name}`, 201).row;
    const gen = ok(await api("POST", `/api/schedules/${sched.id}/generate`, undefined), `generate for ${period.name}`, 202);
    const versionId = gen.versionId;
    let result: any = null;
    for (let i = 0; i < 60; i++) {
      const poll = ok(await api("POST", `/api/schedules/${sched.id}/versions/${versionId}/poll`, undefined), `poll ${period.name}`, 200);
      if (poll.done) { result = poll; break; }
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (!result) throw new Error(`solver did not finish for ${period.name} within the polling window`);
    console.log(`    ${period.name}: schedule ${sched.id} -> ${result.status}`);
    return { scheduleId: sched.id, versionId, status: result.status };
  }
  console.log("[7] generating real schedules (this calls the actual CP-SAT solver)...");
  const semResult = await generateFor(semester);
  const termResult = await generateFor(term);

  // ── 7. Wrap up ──
  await db.user.update({ where: { id: runner.id }, data: { status: "SUSPENDED" } });
  console.log("\n=== SEED COMPLETE ===");
  console.log(`Workbook:        ${file}`);
  console.log(`Semester schedule: ${semResult.scheduleId} (${semResult.status})`);
  console.log(`Term schedule:     ${termResult.scheduleId} (${termResult.status})`);
  console.log(`Programs: ${PROGRAMS.map((p) => p.code).join(", ")}`);
  console.log(`Batches:  ${BATCHES.map((b) => b[0]).join(", ")}`);
  console.log(`Rooms: ${ROOMS.length}, Courses: ${COURSES.length}, Instructors: ${INSTRUCTORS.length}`);
  console.log(`Students: ${students.length}`);
}

main()
  .catch((e) => { console.error("\n!!! SEED FAILED:", e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
