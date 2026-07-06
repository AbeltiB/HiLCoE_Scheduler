"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Btn, Modal, MultiSelect, Td, Th, type Option } from "@/components/ui";

/**
 * Config-driven CRUD page. Powers periods, programs, batches, sections,
 * groups, courses, rooms, instructors, offerings — anything list + modal-form.
 */

export type Field = {
  name: string;
  label: string;
  type: "text" | "number" | "date" | "checkbox" | "select" | "multiselect";
  optionsFrom?: string; // endpoint returning { rows }
  optionLabel?: (row: any) => string;
  options?: Option[]; // static options
  placeholder?: string;
  hint?: string;
};

export type Column = { key: string; label: string; render?: (row: any) => React.ReactNode };

export function CrudPage({ title, endpoint, columns, fields, toForm, canWrite = true }: {
  title: string;
  endpoint: string; // /api/entities/xxx
  columns: Column[];
  fields: Field[];
  /** Map a row → initial form values when editing. */
  toForm?: (row: any) => Record<string, any>;
  canWrite?: boolean;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<Record<string, Option[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(endpoint);
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return setError(data.error ?? "Failed to load");
    setRows(data.rows ?? []);
  }, [endpoint]);

  useEffect(() => { load(); }, [load]);

  // Load select/multiselect options once.
  useEffect(() => {
    for (const f of fields) {
      if (f.optionsFrom) {
        fetch(f.optionsFrom)
          .then((r) => r.json())
          .then((d) =>
            setOptions((prev) => ({
              ...prev,
              [f.name]: (d.rows ?? []).map((row: any) => ({
                value: row.id,
                label: f.optionLabel ? f.optionLabel(row) : row.name ?? row.code ?? row.id,
              })),
            }))
          )
          .catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  const blank = useMemo(() => {
    const b: Record<string, any> = {};
    for (const f of fields) b[f.name] = f.type === "multiselect" ? [] : f.type === "checkbox" ? false : "";
    return b;
  }, [fields]);

  const openCreate = () => { setEditing(null); setForm(blank); setError(null); setOpen(true); };
  const openEdit = (row: any) => {
    setEditing(row);
    setForm({ ...blank, ...(toForm ? toForm(row) : row) });
    setError(null);
    setOpen(true);
  };

  async function save() {
    setBusy(true);
    setError(null);
    const payload: Record<string, any> = {};
    for (const f of fields) {
      let v = form[f.name];
      if (f.type === "number") v = v === "" ? undefined : Number(v);
      if (v !== undefined && v !== "") payload[f.name] = v;
      if (f.type === "checkbox") payload[f.name] = !!form[f.name];
      if (f.type === "multiselect") payload[f.name] = form[f.name] ?? [];
    }
    const res = await fetch(editing ? `${endpoint}/${editing.id}` : endpoint, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Save failed");
    setOpen(false);
    load();
  }

  async function remove(row: any) {
    if (!confirm(`Delete this ${title.toLowerCase().replace(/s$/, "")}? This can be undone only by an admin.`)) return;
    const res = await fetch(`${endpoint}/${row.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error ?? "Delete failed");
    load();
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-[19px] font-semibold">{title}</h1>
        {canWrite && <Btn onClick={openCreate}>+ New</Btn>}
      </div>

      <div className="overflow-x-auto rounded-card border border-line bg-card">
        <table className="w-full min-w-[560px] border-collapse">
          <thead className="border-b border-line bg-surface/60">
            <tr>
              {columns.map((c) => <Th key={c.key}>{c.label}</Th>)}
              {canWrite && <Th> </Th>}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><Td>Loading…</Td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td className="px-3 py-8 text-center text-[13px] text-ink-faint" colSpan={columns.length + 1}>
                Nothing here yet. {canWrite ? "Create the first one." : ""}
              </td></tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-0 hover:bg-surface/50">
                {columns.map((c) => (
                  <Td key={c.key}>{c.render ? c.render(row) : String(row[c.key] ?? "—")}</Td>
                ))}
                {canWrite && (
                  <Td>
                    <div className="flex justify-end gap-1.5">
                      <Btn small variant="ghost" onClick={() => openEdit(row)}>Edit</Btn>
                      <Btn small variant="danger" onClick={() => remove(row)}>Delete</Btn>
                    </div>
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal title={editing ? `Edit ${title.replace(/s$/, "").toLowerCase()}` : `New ${title.replace(/s$/, "").toLowerCase()}`} open={open} onClose={() => setOpen(false)}>
        {fields.map((f) => (
          <div key={f.name}>
            <label>{f.label}</label>
            {f.type === "text" && (
              <input value={form[f.name] ?? ""} placeholder={f.placeholder}
                onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} />
            )}
            {f.type === "number" && (
              <input type="number" value={form[f.name] ?? ""}
                onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} />
            )}
            {f.type === "date" && (
              <input type="date" value={form[f.name] ?? ""}
                onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} />
            )}
            {f.type === "checkbox" && (
              <label className="flex items-center gap-2 !mt-1 font-normal">
                <input type="checkbox" className="!w-auto" checked={!!form[f.name]}
                  onChange={(e) => setForm({ ...form, [f.name]: e.target.checked })} />
                <span className="text-[13px] text-ink-muted">{f.hint ?? "Enabled"}</span>
              </label>
            )}
            {f.type === "select" && (
              <select value={form[f.name] ?? ""} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}>
                <option value="">— select —</option>
                {(f.options ?? options[f.name] ?? []).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            )}
            {f.type === "multiselect" && (
              <MultiSelect options={f.options ?? options[f.name] ?? []} value={form[f.name] ?? []}
                onChange={(v) => setForm({ ...form, [f.name]: v })} />
            )}
            {f.hint && f.type !== "checkbox" && <p className="mt-1 text-[12px] text-ink-faint">{f.hint}</p>}
          </div>
        ))}
        {error && <Alert kind="error">{error}</Alert>}
        <div className="mt-5 flex justify-end gap-2">
          <Btn variant="ghost" onClick={() => setOpen(false)}>Cancel</Btn>
          <Btn onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Btn>
        </div>
      </Modal>
    </div>
  );
}

export { Badge };
