"use client";
import { Badge } from "@/components/ui";
import { CrudPage } from "@/components/crud-page";

export default function Page() {
  return (
    <CrudPage
      title="Courses"
      endpoint="/api/entities/courses"
      columns={[
        { key: "code", label: "Code" },
        { key: "name", label: "Name" },
        { key: "credits", label: "Credits (lec+lab)", render: (r) => `${r.lectureCreditHrs}+${r.labCreditHrs}` },
        { key: "weekly", label: "Weekly sessions", render: (r) => `${r.lectureSessionsPerWeek} lec · ${r.labSessionsPerWeek} lab` },
        { key: "labNeedsDoublePeriod", label: "Double lab", render: (r) => r.labNeedsDoublePeriod ? <Badge tone="amber">yes</Badge> : "—" },
      ]}
      fields={[
        { name: "code", label: "Course code", type: "text", placeholder: "CS301" },
        { name: "name", label: "Course name", type: "text" },
        { name: "lectureCreditHrs", label: "Lecture credit hours", type: "number" },
        { name: "labCreditHrs", label: "Lab credit hours", type: "number" },
        { name: "lectureSessionsPerWeek", label: "Lecture sessions / week", type: "number" },
        { name: "labSessionsPerWeek", label: "Lab sessions / week", type: "number" },
        { name: "labNeedsDoublePeriod", label: "Lab needs a consecutive double period", type: "checkbox" },
      ]}
    />
  );
}
