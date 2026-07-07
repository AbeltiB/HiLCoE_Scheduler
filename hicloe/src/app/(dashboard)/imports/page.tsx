"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Btn, Modal, Td, Th } from "@/components/ui";

type Issue = { level: "error" | "warning"; sheet: string; row?: number; message: string };
type Report = { errors: Issue[]; warnings: Issue[]; summary: Record<string, number> };
type ImportRow = {
  id: string; fileName: string | null; status: string; createdAt: string;
  uploadedBy: { fullName: string }; validationReport: Report | null;
};

const tone = (s: string) =>
  s === "COMMITTED" ? "green" : s === "VALIDATED" ? "blue" : s === "FAILED" ? "red" : "gray";

export default function ImportsPage() {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success" | "info"; text: string } | null>(null);
  const [report, setReport] = useState<{ row: ImportRow; report: Report } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const d = await (await fetch("/api/imports")).json();
    setRows(d.rows ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function upload(file: File) {
    setBusy(true); setMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/imports", { method: "POST", body: fd });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "error", text: d.error ?? "Upload failed" });
    setMsg(
      d.status === "VALIDATED"
        ? { kind: "success", text: `Validated — ${d.report.summary.warnings} warning(s). Review, then commit.` }
        : { kind: "error", text: `Validation failed with ${d.report.summary.errors} error(s). Open the report for details.` }
    );
    load();
  }

  async function commit(row: ImportRow) {
    if (!confirm(`Commit "${row.fileName}" into the database? Existing records with matching keys will be updated.`)) return;
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/imports/${row.id}/commit`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg({ kind: "error", text: d.error ?? "Commit failed" });
    setMsg({ kind: "success", text: "Import committed — batches, sections, groups, courses, and offerings are in." });
    load();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[19px] font-semibold">Registration imports</h1>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={() => { window.location.href = "/api/imports/template"; }}>
            ⇩ Download template
          </Btn>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <Btn onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? "Working…" : "⇪ Upload CSV / Excel"}
          </Btn>
        </div>
      </div>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      <div className="mt-3 overflow-x-auto rounded-card border border-line bg-card">
        <table className="w-full min-w-[640px]">
          <thead className="border-b border-line bg-surface/60">
            <tr><Th>File</Th><Th>Uploaded by</Th><Th>When</Th><Th>Status</Th><Th> </Th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-[13px] text-ink-faint">
                No imports yet. Upload a registration workbook to begin.
              </td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0 hover:bg-surface/50">
                <Td><span className="font-medium">{r.fileName ?? "API"}</span></Td>
                <Td>{r.uploadedBy?.fullName}</Td>
                <Td>{new Date(r.createdAt).toLocaleString()}</Td>
                <Td><Badge tone={tone(r.status) as any}>{r.status.toLowerCase()}</Badge></Td>
                <Td>
                  <div className="flex justify-end gap-1.5">
                    {r.validationReport && (
                      <Btn small variant="ghost" onClick={() => setReport({ row: r, report: r.validationReport! })}>
                        Report
                      </Btn>
                    )}
                    {r.status === "VALIDATED" && (
                      <Btn small onClick={() => commit(r)} disabled={busy}>Commit</Btn>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 rounded-card border border-line bg-card p-4 text-[13px] leading-relaxed text-ink-muted">
        <div className="mb-1 font-semibold text-ink">Expected workbook format</div>
        One Excel file with these sheets (or matching CSVs) — headers exactly as shown:
        <code className="mt-2 block whitespace-pre rounded-control bg-surface p-3 text-[12px] text-ink">
{`Courses:    code | name | lecture_credit | lab_credit | lecture_per_week | lab_per_week | double_lab (Y/N)
Batches:    batch | program_code | period_name
Sections:   batch | section | headcount
Groups:     batch | section | group | headcount
Offerings:  batch | course_code | sections (e.g. "A,B") | shared_lecture (Y/N)
Instructors: full_name | email | employment (FULL_TIME/PART_TIME)
Students:   batch | section | group (optional) | full_name | email`}
        </code>
        Programs and academic periods must exist in the system before importing — the validator will flag unknown codes.
        Re-uploading updates matching records (upsert), so a corrected file can be safely re-imported.
      </div>

      <Modal title={`Validation report — ${report?.row.fileName ?? ""}`} open={!!report} onClose={() => setReport(null)} wide>
        {report && (
          <div>
            <div className="mb-3 flex flex-wrap gap-2 text-[12.5px]">
              {Object.entries(report.report.summary).map(([k, v]) => (
                <Badge key={k} tone={k === "errors" && v > 0 ? "red" : k === "warnings" && v > 0 ? "amber" : "gray"}>
                  {k}: {v}
                </Badge>
              ))}
            </div>
            {[...report.report.errors, ...report.report.warnings].length === 0 && (
              <Alert kind="success">Clean — no issues found.</Alert>
            )}
            <div className="max-h-[50dvh] overflow-y-auto">
              {[...report.report.errors, ...report.report.warnings].map((i, idx) => (
                <div key={idx} className={`mb-1.5 rounded-control px-3 py-2 text-[13px]
                  ${i.level === "error" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"}`}>
                  <span className="font-semibold">{i.sheet}{i.row ? ` · row ${i.row}` : ""}:</span> {i.message}
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
