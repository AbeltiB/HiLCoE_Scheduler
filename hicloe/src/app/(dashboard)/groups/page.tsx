"use client";
import { CrudPage } from "@/components/crud-page";

export default function Page() {
  return (
    <CrudPage
      title="Lab groups"
      endpoint="/api/entities/groups"
      columns={[
        { key: "section", label: "Section", render: (r) => `${r.section?.batch?.name ?? ""} / ${r.section?.name ?? ""}` },
        { key: "name", label: "Group" },
        { key: "headcount", label: "Headcount" },
      ]}
      fields={[
        { name: "sectionId", label: "Section", type: "select", optionsFrom: "/api/entities/sections",
          optionLabel: (s) => `${s.batch?.program?.code ?? ""} ${s.batch?.name ?? ""} — Section ${s.name}` },
        { name: "name", label: "Group name", type: "text", placeholder: "G1" },
        { name: "headcount", label: "Headcount", type: "number" },
      ]}
      toForm={(r) => ({ sectionId: r.sectionId, name: r.name, headcount: r.headcount })}
    />
  );
}
