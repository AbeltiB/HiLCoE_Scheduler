"use client";
import { use, useCallback, useEffect, useState } from "react";
import { Alert, Btn } from "@/components/ui";

type SlotDef = { id: string; day: number; index: number; startTime: string; endTime: string; blocked: boolean };
type Status = "AVAILABLE" | "AVOID" | "UNAVAILABLE";
type Entry = { status: Status; reason: string };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CYCLE: Record<Status, Status> = { AVAILABLE: "AVOID", AVOID: "UNAVAILABLE", UNAVAILABLE: "AVAILABLE" };

export default function AvailabilityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [instructor, setInstructor] = useState<any | null>(null);
  const [slots, setSlots] = useState<SlotDef[]>([]);
  const [grid, setGrid] = useState<Map<string, Entry>>(new Map());
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

    const saved: { slotDefId: string; status: Status; reason: string | null }[] = (await avRes.json()).rows ?? [];
    const defaultStatus: Status = ins?.employment === "FULL_TIME" ? "AVAILABLE" : "UNAVAILABLE";
    const map = new Map<string, Entry>();
    for (const s of defs) map.set(s.id, { status: defaultStatus, reason: "" });
    for (const r of saved) if (map.has(r.slotDefId)) map.set(r.slotDefId, { status: r.status, reason: r.reason ?? "" });
    setGrid(map);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    setBusy(true); setMsg(null);
    const entries = [...grid.entries()].map(([slotDefId, e]) => ({
      slotDefId, status: e.status, reason: e.reason || null,
    }));
    const res = await fetch(`/api/entities/instructors/${id}/availability`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "error", text: d.error ?? "Save failed" });
    setMsg({ kind: "success", text: "Availability saved" });
  }

  const maxIndex = Math.max(0, ...slots.map((s) => s.index));
  const at = (day: number, index: number) => slots.find((s) => s.day === day && s.index === index);
  const setAll = (status: Status) =>
    setGrid(new Map(slots.map((s) => [s.id, { status, reason: grid.get(s.id)?.reason ?? "" }])));
  const setEntry = (sid: string, patch: Partial<Entry>) =>
    setGrid(new Map(grid).set(sid, { ...(grid.get(sid) ?? { status: "AVAILABLE" as Status, reason: "" }), ...patch }));

  const styles: Record<Status, string> = {
    AVAILABLE: "border-success-soft bg-success-soft text-success",
    AVOID: "border-warning-soft bg-warning-soft text-warning",
    UNAVAILABLE: "border-line bg-surface text-ink-faint",
  };
  const label: Record<Status, string> = { AVAILABLE: "available", AVOID: "avoid", UNAVAILABLE: "—" };
  const flagged = [...grid.entries()].filter(([, e]) => e.status !== "AVAILABLE");

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-semibold">Availability — {instructor?.fullName ?? "…"}</h1>
          <p className="text-[12.5px] text-ink-muted">
            Click a cell to cycle: <b className="text-success">available</b> →{" "}
            <b className="text-warning">avoid</b> (soft — solver tries not to, but can) →{" "}
            <b>unavailable</b> (hard — never scheduled).
            {instructor?.employment === "PART_TIME"
              ? " Part-time default is unavailable."
              : " Full-time default is available."}
          </p>
        </div>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={() => setAll("AVAILABLE")}>All available</Btn>
          <Btn variant="ghost" onClick={() => setAll("UNAVAILABLE")}>None</Btn>
          <Btn onClick={save} disabled={busy || slots.length === 0}>{busy ? "Saving…" : "Save"}</Btn>
        </div>
      </div>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

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
                    const e = grid.get(s.id) ?? { status: "AVAILABLE" as Status, reason: "" };
                    return (
                      <td key={di}>
                        <button
                          onClick={() => setEntry(s.id, { status: CYCLE[e.status] })}
                          title={e.reason || undefined}
                          className={`h-12 w-full rounded-control border text-[11px] font-medium cursor-pointer transition-colors ${styles[e.status]}`}
                        >
                          {s.startTime}<br />{label[e.status]}{e.reason ? " ✎" : ""}
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

      {flagged.length > 0 && (
        <div className="mt-5 rounded-card border border-line bg-card p-4">
          <h2 className="mb-1 text-[14px] font-semibold">Reasons</h2>
          <p className="mb-3 text-[12.5px] text-ink-muted">
            Optional note per avoided/unavailable slot — visible to schedulers and kept in the audit trail.
          </p>
          {flagged
            .sort(([a], [b]) => {
              const sa = slots.find((s) => s.id === a)!; const sb = slots.find((s) => s.id === b)!;
              return sa.day - sb.day || sa.index - sb.index;
            })
            .map(([sid, e]) => {
              const s = slots.find((x) => x.id === sid)!;
              return (
                <div key={sid} className="mb-2 flex items-center gap-3">
                  <span className={`w-44 shrink-0 rounded-full border px-2 py-0.5 text-center text-[11.5px] font-medium ${styles[e.status]}`}>
                    {DAYS[s.day - 1]} P{s.index} · {e.status === "UNAVAILABLE" ? "unavailable" : "avoid"}
                  </span>
                  <input className="!w-full" placeholder="Reason (e.g. teaches at another campus Monday mornings)"
                    value={e.reason} onChange={(ev) => setEntry(sid, { reason: ev.target.value })} />
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
