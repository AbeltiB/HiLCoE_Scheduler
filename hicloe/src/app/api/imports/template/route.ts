import { NextResponse } from "next/server";
import { guarded } from "@/lib/auth/guard";
import * as XLSX from "xlsx";

/** Downloadable import template with example rows and exact headers. */
export const GET = guarded("data:import", async () => {
  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: Record<string, unknown>[]) =>
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);

  add("Courses", [
    { code: "CS301", name: "Database Systems", lecture_credit: 3, lab_credit: 1, lecture_per_week: 2, lab_per_week: 1, double_lab: "N" },
    { code: "SE310", name: "Software Design & Architecture", lecture_credit: 3, lab_credit: 0, lecture_per_week: 2, lab_per_week: 0, double_lab: "N" },
  ]);
  add("Batches", [{ batch: "Batch 12", program_code: "SE-UG", period_name: "2026 Semester I" }]);
  add("Sections", [
    { batch: "Batch 12", section: "A", headcount: 52 },
    { batch: "Batch 12", section: "B", headcount: 48 },
  ]);
  add("Groups", [
    { batch: "Batch 12", section: "A", group: "G1", headcount: 26 },
    { batch: "Batch 12", section: "A", group: "G2", headcount: 26 },
  ]);
  add("Offerings", [
    { batch: "Batch 12", course_code: "CS301", sections: "A,B", shared_lecture: "N" },
    { batch: "Batch 12", course_code: "SE310", sections: "A,B", shared_lecture: "Y" },
  ]);
  add("Instructors", [
    { full_name: "Abebe Kebede", email: "abebe.kebede@hilcoe.edu.et", employment: "FULL_TIME" },
    { full_name: "Sara Tesfaye", email: "sara.tesfaye@example.com", employment: "PART_TIME" },
  ]);
  add("Students", [
    { batch: "Batch 12", section: "A", group: "G1", full_name: "Hana Alemu", email: "hana.alemu@example.com" },
    { batch: "Batch 12", section: "A", group: "", full_name: "Dawit Bekele", email: "dawit.bekele@example.com" },
  ]);

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="hilcoe-import-template.xlsx"',
    },
  });
});
