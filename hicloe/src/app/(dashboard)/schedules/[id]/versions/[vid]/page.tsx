"use client";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Btn, Modal } from "@/components/ui";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
type Filter = { kind: "ALL" | "UNIT" | "INSTRUCTOR" | "ROOM"; id?: string };

export default function TimetablePage({ params }: { params: Promise<{ id: string; vid: string }> }) {
  const { id, vid } = use(params);
  const [data, setData] = useState<any | null>(null);
  const [filter, setFilter] = useState<Filter>({ kind: "ALL" });
  const [selected, setSelected] = useState<any | null>(null); // session being moved
  const [moves, setMoves] = useState<{ slotDefId: string; roomIds: string[] }[] | null>(null);
  const [targetSlot, setTargetSlot] = useState("");
  const [targetRoom, setTargetRoom] = useState("");
  const [pinned, setPinned] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/schedules/${id}/versions/${vid}`);
    const d = await res.json();
    if (res.ok) setData(d);
  }, [id, vid]);
  useEffect(() => { load(); }, [load]);

  const slotByDayIndex = useMemo(() => {
    const m = new Map<string, any>();
    for (const s of data?.slots ?? []) m.set(`${s.day}:${s.index}`, s);
    return m;
  }, [data]);

  const maxIndex = useMemo(
    () => Math.max(0, ...(data?.slots ?? []).map((s: any) => s.index)),
    [data]
  );

  const roomName = (rid: string) => data?.rooms.find((r: any) => r.id === rid)?.name ?? rid;
  const insName = (iid: string) => data?.instructors.find((i: any) => i.id === iid)?.fullName ?? iid;
  const unitLabel = (uid: string) => data?.unitNames[uid] ?? uid;

  const matchesFilter = useCallback((s: any) => {
    if (filter.kind === "ALL") return true;
    if (filter.kind === "UNIT") {
      // A section filter also matches its groups' sessions and vice versa via name prefix.
      return s.audienceUnits.some((u: any) =>
        u.id === filter.id ||
        unitLabel(u.id).startsWith(unitLabel(filter.id!)) ||
        unitLabel(filter.id!).startsWith(unitLabel(u.id)));
    }
    if (filter.kind === "INSTRUCTOR") return (s.instructorIds ?? []).includes(filter.id);
    if (filter.kind === "ROOM") return s.assignment?.roomId === filter.id;
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, data]);

  // sessions occupying a given slot (expanding double periods)
  const sessionsAt = useCallback((slot: any) => {
    return (data?.sessions ?? []).filter((s: any) => {
      if (!s.assignment) return false;
      const start = (data.slots as any[]).find((x) => x.id === s.assignment.slotDefId);
      if (!start || start.day !== slot.day) return false;
      const span = s.periods === 2 ? [start.index, start.index + 1] : [start.index];
      return span.includes(slot.index) && matchesFilter(s);
    });
  }, [data, matchesFilter]);

  async function openMove(session: any) {
    setSelected(session);
    setTargetSlot(session.assignment.slotDefId);
    setTargetRoom(session.assignment.roomId);
    setPinned(session.assignment.pinned);
    setMoves(null);
    const res = await fetch(`/api/schedules/${id}/versions/${vid}/valid-moves?sessionId=${session.id}`);
    const d = await res.json().catch(() => ({}));
    // Current placement is always selectable (pin toggle without moving).
    const list = d.moves ?? [];
    if (!list.some((m: any) => m.slotDefId === session.assignment.slotDefId)) {
      list.push({ slotDefId: session.assignment.slotDefId, roomIds: [session.assignment.roomId] });
    }
    setMoves(list);
  }

  async function saveMove() {
    if (!selected) return;
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/schedules/${id}/versions/${vid}/assignments/${selected.assignment.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slotDefId: targetSlot, roomId: targetRoom, pinned }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "error", text: d.error ?? "Move failed" });
    setSelected(null);
    setMsg({ kind: "success", text: "Assignment updated" });
    load();
  }

  if (!data) return <div className="text-[13px] text-ink-muted">Loading…</div>;

  const validSlotIds = new Set((moves ?? []).map((m) => m.slotDefId));
  const roomsForTarget = (moves ?? []).find((m) => m.slotDefId === targetSlot)?.roomIds ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-semibold">
            {data.schedule.period} — v{data.version.number}
          </h1>
          <p className="text-[12.5px] text-ink-muted">
            {data.solver?.status && <>Solver: {data.solver.status.toLowerCase()} · </>}
            penalty {data.version.objectivePenalty ?? "—"} · click a session to move or pin it
          </p>
        </div>
        <select
          className="!w-72"
          value={filter.kind === "ALL" ? "ALL" : `${filter.kind}:${filter.id}`}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "ALL") return setFilter({ kind: "ALL" });
            const [kind, fid] = v.split(":");
            setFilter({ kind: kind as Filter["kind"], id: fid });
          }}
        >
          <option value="ALL">All sessions</option>
          <optgroup label="Sections & groups">
            {Object.entries(data.unitNames).sort((a: any, b: any) => a[1].localeCompare(b[1])).map(([uid, name]: any) => (
              <option key={uid} value={`UNIT:${uid}`}>{name}</option>
            ))}
          </optgroup>
          <optgroup label="Instructors">
            {data.instructors.map((i: any) => (
              <option key={i.id} value={`INSTRUCTOR:${i.id}`}>{i.fullName}</option>
            ))}
          </optgroup>
          <optgroup label="Rooms">
            {data.rooms.map((r: any) => (
              <option key={r.id} value={`ROOM:${r.id}`}>{r.name}</option>
            ))}
          </optgroup>
        </select>
      </div>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      <div className="mt-3 overflow-x-auto rounded-card border border-line bg-card p-3">
        <table className="w-full min-w-[960px] border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="w-9"></th>
              {DAYS.map((d) => <th key={d} className="pb-1 text-[12px] font-semibold text-ink-muted">{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxIndex }, (_, i) => i + 1).map((index) => (
              <tr key={index}>
                <td className="pr-1 text-right align-top text-[11.5px] font-semibold text-ink-faint">P{index}</td>
                {DAYS.map((_, di) => {
                  const slot = slotByDayIndex.get(`${di + 1}:${index}`);
                  if (!slot) return <td key={di}><div className="min-h-16 rounded-control bg-surface/30" /></td>;
                  if (slot.blocked) {
                    return <td key={di}>
                      <div className="grid min-h-16 place-items-center rounded-control bg-surface/70 text-[11px] text-ink-faint">blocked</div>
                    </td>;
                  }
                  const here = sessionsAt(slot);
                  return (
                    <td key={di} className="align-top">
                      <div className="min-h-16 space-y-1 rounded-control border border-line/60 bg-surface/30 p-1">
                        {here.map((s: any) => (
                          <button key={s.id} onClick={() => openMove(s)}
                            className={`block w-full rounded px-1.5 py-1 text-left text-[10.5px] leading-tight cursor-pointer
                              ${s.kind === "LAB" ? "bg-warning-soft text-warning" : "bg-brand-soft text-brand-dark"}
                              ${s.assignment.manuallyEdited ? "ring-1 ring-brand" : ""}`}>
                            <span className="font-semibold">{s.course.code}</span>
                            {s.assignment.pinned && " 📌"}
                            {s.periods === 2 && " ⏩"}
                            <br />
                            {s.audienceUnits.map((u: any) => unitLabel(u.id)).join(", ")}
                            <br />
                            <span className="opacity-75">{roomName(s.assignment.roomId)}</span>
                          </button>
                        ))}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Objective breakdown */}
      {data.solver?.objective?.breakdown?.length > 0 && (
        <div className="mt-5 rounded-card border border-line bg-card p-4">
          <h2 className="mb-2 text-[14px] font-semibold">Accepted soft-constraint costs</h2>
          {data.solver.objective.breakdown.map((b: any) => (
            <div key={b.constraint} className="mb-1 text-[13px]">
              <Badge tone="amber">{b.constraint}</Badge>{" "}
              <span className="text-ink-muted">{b.occurrences} occurrence(s) · penalty {b.penalty}</span>
            </div>
          ))}
        </div>
      )}

      {/* Move modal */}
      <Modal title={selected ? `${selected.course.code} — ${selected.kind.toLowerCase()} (${selected.batch})` : ""}
        open={!!selected} onClose={() => setSelected(null)}>
        {selected && (
          <div>
            <p className="text-[13px] text-ink-muted">
              {selected.audienceUnits.map((u: any) => unitLabel(u.id)).join(", ")} ·{" "}
              {(selected.instructorIds ?? []).map(insName).join(", ") || "no instructor"}
              {selected.periods === 2 && " · double period"}
            </p>
            {moves === null && <p className="mt-3 text-[13px] text-ink-faint">Computing valid placements…</p>}
            {moves !== null && (
              <>
                <label>Slot ({validSlotIds.size} valid)</label>
                <select value={targetSlot} onChange={(e) => {
                  setTargetSlot(e.target.value);
                  const rms = (moves ?? []).find((m) => m.slotDefId === e.target.value)?.roomIds ?? [];
                  setTargetRoom(rms[0] ?? "");
                }}>
                  {(data.slots as any[])
                    .filter((s) => validSlotIds.has(s.id))
                    .sort((a, b) => a.day - b.day || a.index - b.index)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {DAYS[s.day - 1]} P{s.index} ({s.startTime}–{s.endTime})
                      </option>
                    ))}
                </select>
                <label>Room ({roomsForTarget.length} valid at this slot)</label>
                <select value={targetRoom} onChange={(e) => setTargetRoom(e.target.value)}>
                  {roomsForTarget.map((rid) => (
                    <option key={rid} value={rid}>{roomName(rid)}</option>
                  ))}
                </select>
                <label className="flex items-center gap-2 font-normal">
                  <input type="checkbox" className="!w-auto" checked={pinned}
                    onChange={(e) => setPinned(e.target.checked)} />
                  <span className="text-[13px]">Pin — regenerations keep this session exactly here</span>
                </label>
                <div className="mt-5 flex justify-end gap-2">
                  <Btn variant="ghost" onClick={() => setSelected(null)}>Cancel</Btn>
                  <Btn onClick={saveMove} disabled={busy || !targetSlot || !targetRoom}>
                    {busy ? "Saving…" : "Apply"}
                  </Btn>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
