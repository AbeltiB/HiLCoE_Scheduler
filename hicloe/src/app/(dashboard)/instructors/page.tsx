"use client";
import Link from "next/link";
import { Badge } from "@/components/ui";
import { CrudPage } from "@/components/crud-page";

export default function Page() {
  return (
    <CrudPage
      title="Instructors"
      endpoint="/api/entities/instructors"
      columns={[
        { key: "fullName", label: "Name" },
        { key: "email", label: "Email", render: (r) => r.email ?? "—" },
        { key: "employment", label: "Employment", render: (r) =>
          <Badge tone={r.employment === "FULL_TIME" ? "green" : "amber"}>
            {r.employment === "FULL_TIME" ? "Full-time" : "Part-time"}
          </Badge> },
        { key: "coursePool", label: "Course pool", render: (r) =>
          (r.coursePool ?? []).map((c: any) => c.code).join(", ") || "—" },
        { key: "availability", label: "", render: (r) =>
          <Link className="text-[13px] text-brand hover:underline" href={`/instructors/${r.id}/availability`}>
            Availability grid →
          </Link> },
      ]}
      fields={[
        { name: "fullName", label: "Full name", type: "text" },
        { name: "email", label: "Email", type: "text", placeholder: "name@hilcoe.edu.et",
          hint: "Used for broadcasts and future notifications" },
        { name: "employment", label: "Employment", type: "select", options: [
          { value: "FULL_TIME", label: "Full-time" }, { value: "PART_TIME", label: "Part-time" },
        ]},
        { name: "coursePoolIds", label: "Course pool (courses they can teach)", type: "multiselect",
          optionsFrom: "/api/entities/courses", optionLabel: (c) => `${c.code} — ${c.name}`,
          hint: "Emergency assignments outside the pool are still possible at offering level" },
      ]}
      toForm={(r) => ({
        fullName: r.fullName, email: r.email ?? "", employment: r.employment,
        coursePoolIds: (r.coursePool ?? []).map((c: any) => c.id),
      })}
    />
  );
}
