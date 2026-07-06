"use client";
import { Badge } from "@/components/ui";
import { CrudPage } from "@/components/crud-page";

const d = (v: string) => (v ? new Date(v).toISOString().slice(0, 10) : "—");

export default function Page() {
  return (
    <CrudPage
      title="Academic periods"
      endpoint="/api/entities/periods"
      columns={[
        { key: "name", label: "Name" },
        { key: "type", label: "Type", render: (r) => <Badge tone={r.type === "SEMESTER" ? "blue" : "amber"}>{r.type}</Badge> },
        { key: "startDate", label: "Start", render: (r) => d(r.startDate) },
        { key: "endDate", label: "End", render: (r) => d(r.endDate) },
      ]}
      fields={[
        { name: "name", label: "Name", type: "text", placeholder: "2026 Semester I" },
        { name: "type", label: "Type", type: "select", options: [
          { value: "SEMESTER", label: "Semester" }, { value: "TERM", label: "Term" },
        ]},
        { name: "startDate", label: "Start date", type: "date" },
        { name: "endDate", label: "End date", type: "date" },
      ]}
      toForm={(r) => ({ ...r, startDate: d(r.startDate), endDate: d(r.endDate) })}
    />
  );
}
