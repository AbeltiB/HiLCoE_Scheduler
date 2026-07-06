"use client";
import Link from "next/link";
import { Badge } from "@/components/ui";
import { CrudPage } from "@/components/crud-page";

export default function Page() {
  return (
    <CrudPage
      title="Slot templates"
      endpoint="/api/entities/slot-templates"
      columns={[
        { key: "name", label: "Name" },
        { key: "active", label: "Status", render: (r) => r.active ? <Badge tone="green">active</Badge> : <Badge>draft</Badge> },
        { key: "_count", label: "Slots", render: (r) => r._count?.slots ?? 0 },
        { key: "open", label: "", render: (r) =>
          <Link className="text-[13px] text-brand hover:underline" href={`/slot-templates/${r.id}`}>Open builder →</Link> },
      ]}
      fields={[
        { name: "name", label: "Template name", type: "text", placeholder: "Standard 2026 (6 periods)" },
        { name: "active", label: "Active", type: "checkbox",
          hint: "Only one template can be active; activating this deactivates others" },
      ]}
      toForm={(r) => ({ name: r.name, active: r.active })}
    />
  );
}
