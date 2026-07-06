"use client";
import { use, useCallback, useEffect, useState } from "react";
import { Alert, Btn } from "@/components/ui";

type SlotDef = { id: string; day: number; index: number; startTime: string; endTime: string; blocked: boolean };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function AvailabilityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [instructor, setInstructor] = useState<any | null>(null);
  const [slots, setSlots] = useState<SlotDef[]>([]);
  const [avail, setAvail] = useState<Map<string, boolean>>(new Map());
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [insRes, tplRes, avRes] = await Promise.all([
      fetch("/api/entities/instructors"),
      fetch("/api/entities/slot-templates"),
      fetch(`/api/entities/instructors/${id}/availability`),
    ]);
    const ins = (await insRes.json()).rows?.find((i: any) => i.id === id) ?? null;
    setInstructor(ins);

    const templates = (await tplRes.json()).rows ?? [];
    const active = templates.find((t: any) => t.active);
    if (!active) return setMsg({ kind: "error", text: "No active slot template — activate one under Slot templates first." });
    const detail = await (await fetch(`/api/entities/slot-templates/${active.id}`)).json();
    const defs: SlotDef[] = (detail.row?.slots ?? []).filter((s: any) => !s.blocked);
    setSlots(defs);

    const saved: { slotDefId: string; available: boolean }[] = (await avRes.json()).rows ?? [];
    const map = new Map<string, boolean>();
    const fullTime = ins?.employment === "FULL_TIME";
    for (const s of defs) map.set(s.id, fullTime); // FT default all-available, PT all-unavailable
    for (const r of saved) if (map.has(r.slotDefId)) map.set(r.slotDefId, r.available);
    setAvail(map);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    setBusy(true); setMsg(null);
    const entries = [...avail.entries()].map(([slotDefId, available]) => ({ slotDefId, available }));
    const res = await fetch(`/api/entities/instructors/${id}/availability`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "error", text: d.error ?? "Save failed" });
    setMsg({ kind: "success", text: "Availability saved" });
  }

  const maxIndex = Math.max(0, ...slots.map((s) => s.index));
  const at = (day: number, index: number) => slots.find((s) => s.day === day && s.index === index);
  const setAll = (v: boolean) => setAvail(new Map(slots.map((s) => [s.id, v])));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-semibold">
            Availability — {instructor?.fullName ?? "…"}
          </h1>
          <p className="text-[12.5px] text-ink-muted">
            {instructor?.employment === "PART_TIME"
              ? "Part-time: mark the slots this instructor CAN teach."
              : "Full-time: all slots available by default — unmark exceptions."}
          </p>
        </div>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={() => setAll(true)}>All available</Btn>
          <Btn variant="ghost" onClick={() => setAll(false)}>None</Btn>
          <Btn onClick={save} disabled={busy || slots.length === 0}>{busy ? "Saving…" : "Save"}</Btn>
        </div>
      </div>
      {msg && <Alert kind={msg.kind === "error" ? "error" : "success"}>{msg.text}</Alert>}

      {slots.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-card border border-line bg-card p-3">
          <table className="w-full min-w-[720px] border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="w-10"></th>
                {DAYS.map((d) => <th key={d} className="pb-1 text-[12px] font-semibold text-ink-muted">{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: maxIndex }, (_, i) => i + 1).map((index) => (
                <tr key={index}>
                  <td className="pr-1 text-right text-[11.5px] font-semibold text-ink-faint">P{index}</td>
                  {DAYS.map((_, di) => {
                    const s = at(di + 1, index);
                    if (!s) return <td key={di}><div className="h-12 rounded-control bg-surface/40" /></td>;
                    const on = avail.get(s.id) ?? false;
                    return (
                      <td key={di}>
                        <button
                          onClick={() => setAvail(new Map(avail).set(s.id, !on))}
                          className={`h-12 w-full rounded-control border text-[11px] font-medium cursor-pointer transition-colors
                            ${on ? "border-success-soft bg-success-soft text-success"
                                 : "border-line bg-surface text-ink-faint hover:border-line-strong"}`}
                        >
                          {s.startTime}<br />{on ? "available" : "—"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
