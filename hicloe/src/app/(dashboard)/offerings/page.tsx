"use client";
import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Btn, Modal, MultiSelect, Td, Th, type Option } from "@/components/ui";

type Offering = {
  id: string;
  course: { id: string; code: string; name: string };
  batch: { id: string; name: string; program: { code: string } };
  sections: { id: string; name: string }[];
  sharedLecture: boolean;
  instructors: { kind: "LECTURE" | "LAB"; instructor: { id: string; fullName: string } }[];
};

export default function OfferingsPage() {
  const [batches, setBatches] = useState<any[]>([]);
  const [batchId, setBatchId] = useState<string>("");
  const [rows, setRows] = useState<Offering[]>([]);
  const [courses, setCourses] = useState<Option[]>([]);
  const [sections, setSections] = useState<Option[]>([]);
  const [instructors, setInstructors] = useState<Option[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Offering | null>(null);
  const [form, setForm] = useState<any>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/entities/batches").then((r) => r.json()).then((d) => setBatches(d.rows ?? []));
    fetch("/api/entities/courses").then((r) => r.json()).then((d) =>
      setCourses((d.rows ?? []).map((c: any) => ({ value: c.id, label: `${c.code} — ${c.name}` }))));
    fetch("/api/entities/instructors").then((r) => r.json()).then((d) =>
      setInstructors((d.rows ?? []).map((i: any) => ({ value: i.id, label: i.fullName }))));
  }, []);

  const load = useCallback(async () => {
    const url = batchId ? `/api/entities/offerings?batchId=${batchId}` : "/api/entities/offerings";
    const d = await (await fetch(url)).json();
    setRows(d.rows ?? []);
  }, [batchId]);
  useEffect(() => { load(); }, [load]);

  // Sections belong to the selected batch (of the form, not the filter).
  useEffect(() => {
    if (!form.batchId) return setSections([]);
    fetch(`/api/entities/sections?batchId=${form.batchId}`)
      .then((r) => r.json())
      .then((d) => setSections((d.rows ?? []).map((s: any) => ({ value: s.id, label: `Section ${s.name} (${s.headcount})` }))));
  }, [form.batchId]);

  const openCreate = () => {
    setEditing(null);
    setForm({ batchId: batchId || "", courseId: "", sectionIds: [], sharedLecture: false, lectureInstructorIds: [], labInstructorIds: [] });
    setError(null);
    setOpen(true);
  };
  const openEdit = (o: Offering) => {
    setEditing(o);
    setForm({
      batchId: o.batch.id,
      courseId: o.course.id,
      sectionIds: o.sections.map((s) => s.id),
      sharedLecture: o.sharedLecture,
      lectureInstructorIds: o.instructors.filter((x) => x.kind === "LECTURE").map((x) => x.instructor.id),
      labInstructorIds: o.instructors.filter((x) => x.kind === "LAB").map((x) => x.instructor.id),
    });
    setError(null);
    setOpen(true);
  };

  async function save() {
    setBusy(true); setError(null);
    const res = await fetch(editing ? `/api/entities/offerings/${editing.id}` : "/api/entities/offerings", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(d.error ?? "Save failed");
    setOpen(false); load();
  }

  async function remove(o: Offering) {
    if (!confirm(`Remove offering ${o.course.code} for ${o.batch.name}?`)) return;
    const res = await fetch(`/api/entities/offerings/${o.id}`, { method: "DELETE" });
    if (!res.ok) return alert((await res.json().catch(() => ({}))).error ?? "Delete failed");
    load();
  }

  const names = (o: Offering, kind: "LECTURE" | "LAB") =>
    o.instructors.filter((x) => x.kind === kind).map((x) => x.instructor.fullName).join(", ") || "—";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[19px] font-semibold">Course offerings</h1>
        <div className="flex items-center gap-2">
          <select className="!w-56" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            <option value="">All batches</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>{b.program?.code} {b.name}</option>
            ))}
          </select>
          <Btn onClick={openCreate}>+ New offering</Btn>
        </div>
      </div>

      <div className="overflow-x-auto rounded-card border border-line bg-card">
        <table className="w-full min-w-[720px]">
          <thead className="border-b border-line bg-surface/60">
            <tr>
              <Th>Course</Th><Th>Batch</Th><Th>Sections</Th><Th>Lecture instructor(s)</Th><Th>Lab instructor(s)</Th><Th>Shared</Th><Th> </Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-[13px] text-ink-faint">No offerings yet.</td></tr>
            )}
            {rows.map((o) => (
              <tr key={o.id} className="border-b border-line last:border-0 hover:bg-surface/50">
                <Td><span className="font-medium">{o.course.code}</span> <span className="text-ink-muted">{o.course.name}</span></Td>
                <Td>{o.batch.program.code} {o.batch.name}</Td>
                <Td>{o.sections.map((s) => s.name).join(", ")}</Td>
                <Td>{names(o, "LECTURE")}</Td>
                <Td>{names(o, "LAB")}</Td>
                <Td>{o.sharedLecture ? <Badge tone="blue">shared</Badge> : "—"}</Td>
                <Td>
                  <div className="flex justify-end gap-1.5">
                    <Btn small variant="ghost" onClick={() => openEdit(o)}>Edit</Btn>
                    <Btn small variant="danger" onClick={() => remove(o)}>Delete</Btn>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal title={editing ? "Edit offering" : "New offering"} open={open} onClose={() => setOpen(false)} wide>
        <div className="grid gap-x-5 sm:grid-cols-2">
          <div>
            <label>Batch</label>
            <select value={form.batchId ?? ""} disabled={!!editing}
              onChange={(e) => setForm({ ...form, batchId: e.target.value, sectionIds: [] })}>
              <option value="">— select —</option>
              {batches.map((b) => <option key={b.id} value={b.id}>{b.program?.code} {b.name}</option>)}
            </select>
            <label>Course</label>
            <select value={form.courseId ?? ""} onChange={(e) => setForm({ ...form, courseId: e.target.value })}>
              <option value="">— select —</option>
              {courses.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <label>Sections taking this course</label>
            <MultiSelect options={sections} value={form.sectionIds ?? []}
              onChange={(v) => setForm({ ...form, sectionIds: v })} />
            <label className="flex items-center gap-2 font-normal">
              <input type="checkbox" className="!w-auto" checked={!!form.sharedLecture}
                onChange={(e) => setForm({ ...form, sharedLecture: e.target.checked })} />
              <span className="text-[13px]">Shared lecture — all sections attend one combined lecture</span>
            </label>
          </div>
          <div>
            <label>Lecture instructor(s)</label>
            <MultiSelect options={instructors} value={form.lectureInstructorIds ?? []}
              onChange={(v) => setForm({ ...form, lectureInstructorIds: v })} />
            <p className="mt-1 text-[12px] text-ink-faint">Select two or more for co-teaching.</p>
            <label>Lab instructor(s)</label>
            <MultiSelect options={instructors} value={form.labInstructorIds ?? []}
              onChange={(v) => setForm({ ...form, labInstructorIds: v })} />
          </div>
        </div>
        {error && <Alert kind="error">{error}</Alert>}
        <div className="mt-5 flex justify-end gap-2">
          <Btn variant="ghost" onClick={() => setOpen(false)}>Cancel</Btn>
          <Btn onClick={save} disabled={busy || !form.batchId || !form.courseId}>{busy ? "Saving…" : "Save"}</Btn>
        </div>
      </Modal>
    </div>
  );
}
