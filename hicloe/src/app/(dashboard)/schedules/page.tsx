"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui";
import { CrudPage } from "@/components/crud-page";

const stateTone: Record<string, "gray" | "blue" | "green" | "red" | "amber"> = {
  DRAFT: "gray", GENERATING: "amber", GENERATED: "blue", FAILED: "red",
  IN_REVIEW: "amber", APPROVED: "green", PUBLISHED: "green", ARCHIVED: "gray",
};

export default function Page() {
  return (
    <CrudPage
      title="Schedules"
      endpoint="/api/schedules"
      columns={[
        { key: "period", label: "Academic period", render: (r) => r.period?.name ?? "—" },
        { key: "slotTemplate", label: "Slot template", render: (r) => r.slotTemplate?.name ?? "—" },
        { key: "state", label: "State", render: (r) => <Badge tone={stateTone[r.state] ?? "gray"}>{r.state.toLowerCase()}</Badge> },
        { key: "_count", label: "Versions", render: (r) => r._count?.versions ?? 0 },
        {
          key: "open", label: "", render: (r) => {
            const ok = r.latestVersion?.solverStatus === "OPTIMAL" || r.latestVersion?.solverStatus === "FEASIBLE";
            const href = ok ? `/schedules/${r.id}/versions/${r.latestVersion.id}` : `/schedules/${r.id}`;
            return (
              <Link className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline" href={href}>
                {ok ? "View timetable" : "Open"} <ArrowRight size={13} />
              </Link>
            );
          },
        },
      ]}
      fields={[
        { name: "periodId", label: "Academic period", type: "select",
          optionsFrom: "/api/entities/periods", optionLabel: (p) => `${p.name} (${p.type})` },
        { name: "slotTemplateId", label: "Slot template", type: "select",
          optionsFrom: "/api/entities/slot-templates",
          optionLabel: (t) => `${t.name}${t.active ? " (active)" : ""}`,
          hint: "Effective dates default to the period's start/end" },
      ]}
    />
  );
}
