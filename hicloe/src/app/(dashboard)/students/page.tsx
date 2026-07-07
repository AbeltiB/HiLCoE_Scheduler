"use client";
import { CrudPage } from "@/components/crud-page";

export default function Page() {
  return (
    <CrudPage
      title="Students"
      endpoint="/api/entities/students"
      columns={[
        { key: "fullName", label: "Name" },
        { key: "email", label: "Email" },
        { key: "section", label: "Section", render: (r) =>
          r.section ? `${r.section.batch?.program?.code ?? ""} ${r.section.batch?.name ?? ""}/${r.section.name}` : "—" },
        { key: "group", label: "Lab group", render: (r) => r.group?.name ?? "—" },
      ]}
      fields={[
        { name: "fullName", label: "Full name", type: "text" },
        { name: "email", label: "Email", type: "text", placeholder: "student@example.com" },
        { name: "sectionId", label: "Section", type: "select", optionsFrom: "/api/entities/sections",
          optionLabel: (s) => `${s.batch?.program?.code ?? ""} ${s.batch?.name ?? ""} — Section ${s.name}` },
        { name: "groupId", label: "Lab group (optional)", type: "select", optionsFrom: "/api/entities/groups",
          optionLabel: (g) => `${g.section?.batch?.name ?? ""}/${g.section?.name ?? ""}-${g.name}`,
          hint: "For bulk entry, prefer the Students sheet in the import workbook" },
      ]}
      toForm={(r) => ({ fullName: r.fullName, email: r.email, sectionId: r.sectionId, groupId: r.groupId ?? "" })}
    />
  );
}
