"use client";
import { useEffect, useMemo, useState } from "react";
import { Alert, Btn, MultiSelect, type Option } from "@/components/ui";

export default function BroadcastPage() {
  const [sections, setSections] = useState<Option[]>([]);
  const [groups, setGroups] = useState<Option[]>([]);
  const [instructors, setInstructors] = useState<Option[]>([]);
  const [students, setStudents] = useState<Option[]>([]);

  const [allStudents, setAllStudents] = useState(false);
  const [allInstructors, setAllInstructors] = useState(false);
  const [sectionIds, setSectionIds] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [instructorIds, setInstructorIds] = useState<string[]>([]);
  const [studentIds, setStudentIds] = useState<string[]>([]);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState<{ kind: "error" | "success" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/entities/sections").then((r) => r.json()).then((d) =>
      setSections((d.rows ?? []).map((s: any) => ({
        value: s.id, label: `${s.batch?.program?.code ?? ""} ${s.batch?.name ?? ""} — Section ${s.name}`,
      }))));
    fetch("/api/entities/groups").then((r) => r.json()).then((d) =>
      setGroups((d.rows ?? []).map((g: any) => ({
        value: g.id, label: `${g.section?.batch?.name ?? ""}/${g.section?.name ?? ""}-${g.name}`,
      }))));
    fetch("/api/entities/instructors").then((r) => r.json()).then((d) =>
      setInstructors((d.rows ?? []).map((i: any) => ({
        value: i.id, label: `${i.fullName}${i.email ? "" : " (no email!)"}`,
      }))));
    fetch("/api/entities/students").then((r) => r.json()).then((d) =>
      setStudents((d.rows ?? []).map((s: any) => ({ value: s.id, label: `${s.fullName} <${s.email}>` }))));
  }, []);

  const audienceEmpty = useMemo(
    () => !allStudents && !allInstructors && sectionIds.length + groupIds.length + instructorIds.length + studentIds.length === 0,
    [allStudents, allInstructors, sectionIds, groupIds, instructorIds, studentIds]
  );

  async function send() {
    if (!confirm("Send this email to the selected audience now?")) return;
    setBusy(true); setMsg(null);
    const res = await fetch("/api/broadcast", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject, body,
        allStudents, allInstructors,
        sectionIds, groupIds, instructorIds, studentIds,
      }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "error", text: d.error ?? "Send failed" });
    setMsg({
      kind: d.failed > 0 ? "info" : "success",
      text: `Sent to ${d.sent} of ${d.recipients} recipient(s)${d.failed ? ` — ${d.failed} failed (SMTP)` : ""}. Logged in the audit trail.`,
    });
    setSubject(""); setBody("");
  }

  return (
    <div>
      <h1 className="mb-1 text-[19px] font-semibold">Broadcast</h1>
      <p className="mb-5 text-[12.5px] text-ink-muted">
        Email students and instructors — individually, by section/group, or everyone. Recipients are
        de-duplicated and addressed via BCC (nobody sees the list). Every broadcast is audited.
      </p>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <div className="rounded-card border border-line bg-card p-5">
          <h2 className="mb-3 text-[15px] font-semibold">Audience</h2>
          <div className="mb-3 flex flex-wrap gap-5">
            <label className="flex items-center gap-2 !m-0 font-normal">
              <input type="checkbox" className="!w-auto" checked={allStudents}
                onChange={(e) => setAllStudents(e.target.checked)} />
              <span className="text-[13.5px]">All students</span>
            </label>
            <label className="flex items-center gap-2 !m-0 font-normal">
              <input type="checkbox" className="!w-auto" checked={allInstructors}
                onChange={(e) => setAllInstructors(e.target.checked)} />
              <span className="text-[13.5px]">All instructors</span>
            </label>
          </div>

          {!allStudents && (
            <>
              <label>Sections (all students in them)</label>
              <MultiSelect options={sections} value={sectionIds} onChange={setSectionIds} />
              <label>Lab groups</label>
              <MultiSelect options={groups} value={groupIds} onChange={setGroupIds} />
              <label>Individual students</label>
              <MultiSelect options={students} value={studentIds} onChange={setStudentIds} />
            </>
          )}
          {!allInstructors && (
            <>
              <label>Individual instructors</label>
              <MultiSelect options={instructors} value={instructorIds} onChange={setInstructorIds} />
            </>
          )}
        </div>

        <div className="rounded-card border border-line bg-card p-5">
          <h2 className="mb-3 text-[15px] font-semibold">Message</h2>
          <label className="!mt-0">Subject</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Updated timetable for 2026 Semester I" />
          <label>Body</label>
          <textarea rows={12} value={body} onChange={(e) => setBody(e.target.value)}
            placeholder="Plain text — line breaks are preserved." />
          <div className="mt-4 flex justify-end">
            <Btn onClick={send} disabled={busy || audienceEmpty || subject.length < 2 || body.length < 2}>
              {busy ? "Sending…" : "Send broadcast"}
            </Btn>
          </div>
          {audienceEmpty && (
            <p className="mt-2 text-right text-[12px] text-ink-faint">Pick at least one audience to enable sending.</p>
          )}
        </div>
      </div>
    </div>
  );
}
