"use client";
import { CrudPage } from "@/components/crud-page";

export default function Page() {
  return (
    <CrudPage
      title="Batches"
      endpoint="/api/entities/batches"
      columns={[
        { key: "name", label: "Batch" },
        { key: "program", label: "Program", render: (r) => r.program?.code ?? "—" },
        { key: "period", label: "Period", render: (r) => r.period?.name ?? "—" },
        { key: "_count", label: "Sections", render: (r) => r._count?.sections ?? 0 },
      ]}
      fields={[
        { name: "name", label: "Batch name", type: "text", placeholder: "Batch 12" },
        { name: "programId", label: "Program", type: "select", optionsFrom: "/api/entities/programs",
          optionLabel: (p) => `${p.code} — ${p.name}` },
        { name: "periodId", label: "Academic period", type: "select", optionsFrom: "/api/entities/periods",
          optionLabel: (p) => `${p.name} (${p.type})` },
      ]}
      toForm={(r) => ({ name: r.name, programId: r.programId, periodId: r.periodId })}
    />
  );
}
