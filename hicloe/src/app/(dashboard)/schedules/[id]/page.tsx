"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Btn, Modal } from "@/components/ui";

const WEIGHT_LABELS: [string, string][] = [
  ["student_gap", "Student gaps between sessions"],
  ["single_session_day", "Days with a single lonely session"],
  ["same_course_same_day", "Same course twice in one day"],
  ["lab_before_lecture", "Lab scheduled before its lecture"],
  ["instructor_consecutive_4plus", "Instructor 4+ consecutive periods"],
  ["instructor_daily_overload", "Instructor over daily max"],
  ["room_instability", "Section changes rooms across week"],
  ["instructor_avoid_slot", "Instructor placed in an avoided slot"],
];

const stateTone: Record<string, "gray" | "blue" | "green" | "red" | "amber"> = {
  DRAFT: "gray", GENERATING: "amber", GENERATED: "blue", FAILED: "red",
  IN_REVIEW: "amber", APPROVED: "green", PUBLISHED: "green", ARCHIVED: "gray",
};

export default function SchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<any | null>(null);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [options, setOptions] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<{ kind: "error" | "success" | "info"; text: string } | null>(null);
  const [precheck, setPrecheck] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/schedules/${id}`);
    const d = await res.json();
    if (!res.ok) return setMsg({ kind: "error", text: d.error ?? "Failed to load" });
    setData(d.row);
    const cfg = d.row.constraintConfig;
    setWeights({
      student_gap: 5, single_session_day: 3, same_course_same_day: 8,
      lab_before_lecture: 2, instructor_consecutive_4plus: 4,
      instructor_daily_overload: 2, room_instability: 1, instructor_avoid_slot: 6,
      ...(cfg?.weights ?? {}),
    });
    setOptions({ instructor_max_periods_per_day: 4, max_time_seconds: 60, ...(cfg?.options ?? {}) });
    return d.row;
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Auto-poll while GENERATING.
  useEffect(() => {
    if (data?.state !== "GENERATING" || !data.versions?.[0]) return;
    const vid = data.versions[0].id;
    const tick = async () => {
      const res = await fetch(`/api/schedules/${id}/versions/${vid}/poll`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (d.done) {
        setMsg(d.status === "OPTIMAL" || d.status === "FEASIBLE"
          ? { kind: "success", text: `Generation complete — ${d.status}` }
          : { kind: "error", text: `Generation finished without a timetable: ${d.status}` });
        load();
      } else {
        pollTimer.current = setTimeout(tick, 2500);
      }
    };
    pollTimer.current = setTimeout(tick, 1500);
    return () => { if (pollTimer.current) clearTimeout(pollTimer.current); };
  }, [data?.state, data?.versions, id, load]);

  async function saveConfig() {
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/schedules/${id}/config`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weights, options }),
    });
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "error", text: (await res.json()).error ?? "Save failed" });
    setMsg({ kind: "success", text: "Constraint configuration saved" });
  }

  async function runPrecheck() {
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/schedules/${id}/precheck`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "error", text: d.error ?? "Precheck failed" });
    setPrecheck(d);
  }

  async function generate() {
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/schedules/${id}/generate`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "error", text: d.error ?? "Generation failed to start" });
    setMsg({ kind: "info", text: "Generation started — the solver is working…" });
    load();
  }

  if (!data) return <div className="text-[13px] text-ink-muted">Loading…</div>;
  const generating = data.state === "GENERATING";
  const latestFailed = data.state === "FAILED" ? data.versions?.[0] : null;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[19px] font-semibold">{data.period?.name}</h1>
          <p className="text-[12.5px] text-ink-muted">
            {data.slotTemplate?.name} · {new Date(data.effectiveFrom).toLocaleDateString()} → {new Date(data.effectiveTo).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={stateTone[data.state] ?? "gray"}>{data.state.toLowerCase()}</Badge>
          <Btn variant="ghost" onClick={runPrecheck} disabled={busy || generating}>Run precheck</Btn>
          <Btn onClick={generate} disabled={busy || generating}>
            {generating ? "Generating…" : data.versions?.length ? "Regenerate" : "Generate timetable"}
          </Btn>
        </div>
      </div>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {generating && (
        <Alert kind="info">The solver is running — this page polls automatically and will update when done.</Alert>
      )}
      {latestFailed?.infeasibility && (
        <div className="mt-3 rounded-card border border-danger-soft bg-danger-soft/40 p-4 text-[13px]">
          <div className="mb-1 font-semibold text-danger">No valid timetable — diagnosis</div>
          <p className="text-danger">{latestFailed.infeasibility.human_message}</p>
          {(latestFailed.infeasibility.unplaceable ?? []).slice(0, 6).map((u: any) => (
            <p key={u.session_id} className="mt-1 text-danger/90">• {u.message}</p>
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        {/* Constraint config */}
        <div className="rounded-card border border-line bg-card p-5">
          <h2 className="mb-1 text-[15px] font-semibold">Soft-constraint weights</h2>
          <p className="mb-4 text-[12.5px] text-ink-muted">
            Higher = the solver tries harder to avoid it. 0 disables the preference.
          </p>
          {WEIGHT_LABELS.map(([key, label]) => (
            <div key={key} className="mb-3 flex items-center gap-3">
              <span className="w-64 shrink-0 text-[13px]">{label}</span>
              <input type="range" min={0} max={20} value={weights[key] ?? 0}
                className="!w-full accent-brand"
                onChange={(e) => setWeights({ ...weights, [key]: Number(e.target.value) })} />
              <span className="w-6 text-right text-[13px] font-medium">{weights[key] ?? 0}</span>
            </div>
          ))}
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <label className="!mt-0">Max periods / instructor / day</label>
              <input type="number" min={1} max={8} value={options.instructor_max_periods_per_day ?? 4}
                onChange={(e) => setOptions({ ...options, instructor_max_periods_per_day: Number(e.target.value) })} />
            </div>
            <div>
              <label className="!mt-0">Solver time budget (seconds)</label>
              <input type="number" min={5} max={600} value={options.max_time_seconds ?? 60}
                onChange={(e) => setOptions({ ...options, max_time_seconds: Number(e.target.value) })} />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Btn onClick={saveConfig} disabled={busy}>Save configuration</Btn>
          </div>
        </div>

        {/* Versions */}
        <div className="rounded-card border border-line bg-card p-5">
          <h2 className="mb-3 text-[15px] font-semibold">Versions</h2>
          {(data.versions ?? []).length === 0 && (
            <p className="text-[13px] text-ink-faint">No versions yet — run a precheck, then generate.</p>
          )}
          {(data.versions ?? []).map((v: any) => (
            <div key={v.id} className="mb-2 flex items-center justify-between rounded-control border border-line px-3 py-2.5">
              <div>
                <div className="text-[13.5px] font-medium">
                  v{v.number}
                  {v.solverStatus && (
                    <Badge tone={v.solverStatus === "OPTIMAL" ? "green" : v.solverStatus === "FEASIBLE" ? "blue" : "red"}>
                      {v.solverStatus.toLowerCase()}
                    </Badge>
                  )}{" "}
                  {v.objectivePenalty !== null && <span className="text-ink-muted">penalty {v.objectivePenalty}</span>}
                </div>
                <div className="text-[11.5px] text-ink-faint">
                  {new Date(v.createdAt).toLocaleString()} · {v.createdBy?.fullName} · {v.sessionCount} sessions
                </div>
              </div>
              {(v.solverStatus === "OPTIMAL" || v.solverStatus === "FEASIBLE") && (
                <Link className="text-[13px] text-brand hover:underline" href={`/schedules/${id}/versions/${v.id}`}>
                  Open timetable →
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Precheck report */}
      <Modal title="Pre-generation sanity check" open={!!precheck} onClose={() => setPrecheck(null)} wide>
        {precheck && (
          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              {Object.entries(precheck.report.summary).map(([k, v]) => (
                <Badge key={k} tone={k === "errors" && (v as number) > 0 ? "red" : k === "warnings" && (v as number) > 0 ? "amber" : "gray"}>
                  {k}: {v as number}
                </Badge>
              ))}
            </div>
            {precheck.report.ok && precheck.report.issues.length === 0 && (
              <Alert kind="success">All clear — {precheck.sessionCount} sessions are ready to schedule.</Alert>
            )}
            {precheck.report.ok && precheck.report.issues.length > 0 && (
              <Alert kind="info">No blocking errors — warnings below are worth a look before generating.</Alert>
            )}
            <div className="mt-2 max-h-[50dvh] overflow-y-auto">
              {precheck.report.issues.map((i: any, idx: number) => (
                <div key={idx} className={`mb-1.5 rounded-control px-3 py-2 text-[13px]
                  ${i.level === "error" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"}`}>
                  <span className="font-semibold">{i.code}:</span> {i.message}
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
