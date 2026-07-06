"use client";
import { CrudPage } from "@/components/crud-page";

export default function Page() {
  return (
    <CrudPage
      title="Sections"
      endpoint="/api/entities/sections"
      columns={[
        { key: "batch", label: "Batch", render: (r) => `${r.batch?.program?.code ?? ""} ${r.batch?.name ?? ""}` },
        { key: "name", label: "Section" },
        { key: "headcount", label: "Headcount" },
        { key: "_count", label: "Lab groups", render: (r) => r._count?.groups ?? 0 },
      ]}
      fields={[
        { name: "batchId", label: "Batch", type: "select", optionsFrom: "/api/entities/batches",
          optionLabel: (b) => `${b.program?.code ?? ""} ${b.name}` },
        { name: "name", label: "Section name", type: "text", placeholder: "A" },
        { name: "headcount", label: "Headcount", type: "number" },
      ]}
      toForm={(r) => ({ batchId: r.batchId, name: r.name, headcount: r.headcount })}
    />
  );
}
