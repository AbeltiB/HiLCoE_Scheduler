"use client";
import { use, useCallback, useEffect, useState } from "react";
import { Alert, Btn } from "@/components/ui";

type Slot = { day: number; index: number; startTime: string; endTime: string; audience: ("UG" | "PG")[]; blocked: boolean };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function TemplateBuilder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [name, setName] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const d = await (await fetch(`/api/entities/slot-templates/${id}`)).json();
    setName(d.row?.name ?? "");
    setSlots((d.row?.slots ?? []).map((s: Slot) => ({ ...s })));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const maxIndex = Math.max(6, ...slots.map((s) => s.index));
  const at = (day: number, index: number) => slots.find((s) => s.day === day && s.index === index);

  function toggleExists(day: number, index: number) {
    const s = at(day, index);
    if (s) return setSlots(slots.filter((x) => x !== s));
    const sibling = slots.find((x) => x.index === index); // copy times from any same-period slot
    setSlots([...slots, {
      day, index,
      startTime: sibling?.startTime ?? "08:00",
      endTime: sibling?.endTime ?? "09:30",
      audience: ["UG", "PG"], blocked: false,
    }]);
  }
  const update = (s: Slot, patch: Partial<Slot>) =>
    setSlots(slots.map((x) => (x === s ? { ...x, ...patch } : x)));

  function cycleAudience(s: Slot) {
    const next: Record<string, ("UG" | "PG")[]> = { "UG,PG": ["UG"], "UG": ["PG"], "PG": ["UG", "PG"] };
    update(s, { audience: next[s.audience.join(",")] ?? ["UG", "PG"] });
  }

  async function generateDefault() {
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/entities/slot-templates/${id}/generate-default`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "error", text: d.error ?? "Generation failed" });
    load();
  }

  async function save() {
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/entities/slot-templates/${id}/slots`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slots }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "error", text: d.error ?? "Save failed" });
    setMsg({ kind: "success", text: "Slot grid saved" });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-semibold">{name || "Slot template"}</h1>
          <p className="text-[12.5px] text-ink-muted">
            Click a cell to add/remove a period · click the audience chip to cycle UG+PG → UG → PG · ⛔ toggles blocked.
          </p>
        </div>
        <div className="flex gap-2">
          {slots.length === 0 && (
            <Btn variant="ghost" onClick={generateDefault} disabled={busy}>Generate HiLCoE default</Btn>
          )}
          <Btn onClick={save} disabled={busy}>{busy ? "Saving…" : "Save grid"}</Btn>
        </div>
      </div>
      {msg && <Alert kind={msg.kind === "error" ? "error" : "success"}>{msg.text}</Alert>}

      <div className="mt-3 overflow-x-auto rounded-card border border-line bg-card p-3">
        <table className="w-full min-w-[860px] border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="w-10"></th>
              {DAYS.map((d) => <th key={d} className="pb-1 text-[12px] font-semibold text-ink-muted">{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxIndex }, (_, i) => i + 1).map((index) => (
              <tr key={index}>
                <td className="pr-1 text-right align-top text-[11.5px] font-semibold text-ink-faint">P{index}</td>
                {DAYS.map((_, di) => {
                  const day = di + 1;
                  const s = at(day, index);
                  if (!s) {
                    return (
                      <td key={day}>
                        <button onClick={() => toggleExists(day, index)}
                          className="grid h-[74px] w-full place-items-center rounded-control border border-dashed border-line text-[18px] text-ink-faint hover:border-brand hover:text-brand cursor-pointer">
                          +
                        </button>
                      </td>
                    );
                  }
                  return (
                    <td key={day}>
                      <div className={`rounded-control border p-1.5 text-[11px] leading-tight
                        ${s.blocked ? "border-danger-soft bg-danger-soft/60" : "border-line bg-surface/60"}`}>
                        <div className="flex items-center gap-1">
                          <input className="!w-[52px] !px-1 !py-0.5 !text-[11px]" value={s.startTime}
                            onChange={(e) => update(s, { startTime: e.target.value })} />
                          <span className="text-ink-faint">–</span>
                          <input className="!w-[52px] !px-1 !py-0.5 !text-[11px]" value={s.endTime}
                            onChange={(e) => update(s, { endTime: e.target.value })} />
                        </div>
                        <div className="mt-1 flex items-center justify-between">
                          <button onClick={() => cycleAudience(s)}
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold cursor-pointer
                              ${s.audience.length === 2 ? "bg-brand-soft text-brand-dark"
                                : s.audience[0] === "UG" ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>
                            {s.audience.join("+")}
                          </button>
                          <div className="flex gap-1">
                            <button title="Toggle blocked" onClick={() => update(s, { blocked: !s.blocked })}
                              className={`cursor-pointer text-[12px] ${s.blocked ? "" : "opacity-30 hover:opacity-100"}`}>⛔</button>
                            <button title="Remove slot" onClick={() => toggleExists(day, index)}
                              className="cursor-pointer text-[12px] opacity-30 hover:opacity-100">✕</button>
                          </div>
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
