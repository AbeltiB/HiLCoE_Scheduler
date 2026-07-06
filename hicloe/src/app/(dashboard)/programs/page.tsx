"use client";
import { Badge } from "@/components/ui";
import { CrudPage } from "@/components/crud-page";

export default function Page() {
  return (
    <CrudPage
      title="Programs"
      endpoint="/api/entities/programs"
      columns={[
        { key: "code", label: "Code" },
        { key: "name", label: "Name" },
        { key: "level", label: "Level", render: (r) => <Badge tone={r.level === "UG" ? "blue" : "green"}>{r.level}</Badge> },
      ]}
      fields={[
        { name: "code", label: "Code", type: "text", placeholder: "SE-UG" },
        { name: "name", label: "Name", type: "text", placeholder: "Software Engineering (Undergraduate)" },
        { name: "level", label: "Level", type: "select", options: [
          { value: "UG", label: "Undergraduate" }, { value: "PG", label: "Postgraduate" },
        ]},
      ]}
    />
  );
}
