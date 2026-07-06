"use client";
import { Badge } from "@/components/ui";
import { CrudPage } from "@/components/crud-page";

export default function Page() {
  return (
    <CrudPage
      title="Rooms"
      endpoint="/api/entities/rooms"
      columns={[
        { key: "name", label: "Room" },
        { key: "type", label: "Type", render: (r) => <Badge tone={r.type === "LAB" ? "amber" : "blue"}>{r.type}</Badge> },
        { key: "capacity", label: "Capacity" },
        { key: "active", label: "Status", render: (r) => r.active ? <Badge tone="green">active</Badge> : <Badge>inactive</Badge> },
      ]}
      fields={[
        { name: "name", label: "Room name", type: "text", placeholder: "LH-201" },
        { name: "type", label: "Type", type: "select", options: [
          { value: "LECTURE", label: "Lecture hall" }, { value: "LAB", label: "Lab" },
        ]},
        { name: "capacity", label: "Capacity", type: "number" },
        { name: "active", label: "Active", type: "checkbox", hint: "Inactive rooms are excluded from scheduling" },
      ]}
    />
  );
}
