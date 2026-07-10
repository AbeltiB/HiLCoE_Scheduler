"use client";
import { useCallback, useEffect, useState } from "react";
import { ShieldPlus, Lock } from "lucide-react";
import { Alert, Badge, Btn, Modal, Th, Td } from "@/components/ui";

type Role = {
  id: string; name: string; description: string | null; system: boolean;
  permissions: { id: string; action: string }[]; _count: { users: number };
};

// Grouped for a readable checklist — mirrors the categories in permissions.ts.
const GROUPS: [string, string[]][] = [
  ["Identity & governance", ["users:manage", "roles:manage", "audit:read"]],
  ["Data", ["data:import", "entities:write", "entities:read"]],
  ["Scheduling lifecycle", ["schedule:configure", "schedule:generate", "schedule:edit", "schedule:review", "schedule:publish"]],
  ["Self-service", ["availability:edit_own", "timetable:view_published"]],
  ["Communication", ["broadcast:send"]],
];

const blankForm = { name: "", description: "", permissionActions: [] as string[] };

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [form, setForm] = useState(blankForm);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/roles");
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return setError(data.error ?? "Failed to load roles");
    setRoles(data.roles ?? []);
    setCatalog(data.catalog ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(blankForm); setError(null); setOpen(true); };
  const openEdit = (r: Role) => {
    setEditing(r);
    setForm({ name: r.name, description: r.description ?? "", permissionActions: r.permissions.map((p) => p.action) });
    setError(null);
    setOpen(true);
  };

  function toggle(action: string) {
    setForm((f) => ({
      ...f,
      permissionActions: f.permissionActions.includes(action)
        ? f.permissionActions.filter((a) => a !== action)
        : [...f.permissionActions, action],
    }));
  }

  async function save() {
    setBusy(true); setError(null);
    const res = editing
      ? await fetch(`/api/admin/roles/${editing.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editing.system ? { description: form.description } : form),
        })
      : await fetch("/api/admin/roles", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Save failed");
    setOpen(false);
    load();
  }

  async function remove(r: Role) {
    if (!confirm(`Delete role "${r.name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/roles/${r.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error ?? "Delete failed");
    load();
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-[21px] font-bold tracking-tight">Roles &amp; permissions</h1>
          <p className="text-[13px] text-ink-muted">Compose permission sets and assign them to users.</p>
        </div>
        <Btn onClick={openCreate}><ShieldPlus size={15} /> New role</Btn>
      </div>

      <div className="glass-panel overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead className="border-b border-line">
            <tr><Th>Role</Th><Th>Description</Th><Th>Permissions</Th><Th>Users</Th><Th> </Th></tr>
          </thead>
          <tbody>
            {loading && <tr><td className="px-4 py-8 text-center text-[13px] text-ink-faint" colSpan={5}>Loading…</td></tr>}
            {roles.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0 transition-colors hover:bg-brand-soft/40">
                <Td>
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    {r.name}
                    {r.system && <Lock size={12} className="text-ink-faint" />}
                  </span>
                </Td>
                <Td><span className="text-ink-muted">{r.description || "—"}</span></Td>
                <Td>
                  {r.permissions.some((p) => p.action === "*")
                    ? <Badge tone="red">all permissions</Badge>
                    : <Badge tone="blue">{r.permissions.length} permission{r.permissions.length === 1 ? "" : "s"}</Badge>}
                </Td>
                <Td>{r._count.users}</Td>
                <Td>
                  <div className="flex justify-end gap-1.5">
                    <Btn small variant="ghost" onClick={() => openEdit(r)}>Edit</Btn>
                    {!r.system && r._count.users === 0 && (
                      <Btn small variant="danger" onClick={() => remove(r)}>Delete</Btn>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal title={editing ? `Edit ${editing.name}` : "New role"} open={open} onClose={() => setOpen(false)} wide>
        <label>Name</label>
        <input value={form.name} disabled={!!editing?.system} placeholder="SCHEDULER_ASSISTANT"
          onChange={(e) => setForm({ ...form, name: e.target.value.toUpperCase() })} />
        {!editing && <p className="mt-1 text-[12px] text-ink-faint">UPPER_SNAKE_CASE — e.g. DEPARTMENT_HEAD</p>}

        <label>Description</label>
        <input value={form.description} placeholder="What this role is for"
          onChange={(e) => setForm({ ...form, description: e.target.value })} />

        <label>Permissions</label>
        {editing?.system ? (
          <Alert kind="info">System role permissions are fixed and can't be edited — only the description above.</Alert>
        ) : (
          <div className="mt-1 space-y-3 rounded-control border border-line bg-surface/40 p-3">
            {GROUPS.map(([group, actions]) => {
              const present = actions.filter((a) => catalog.includes(a));
              if (present.length === 0) return null;
              return (
                <div key={group}>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{group}</div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    {present.map((action) => (
                      <label key={action} className="flex cursor-pointer items-center gap-2 !mt-0 !mb-0 font-normal text-[13px]">
                        <input type="checkbox" className="!w-auto" checked={form.permissionActions.includes(action)}
                          onChange={() => toggle(action)} />
                        {action}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {error && <Alert kind="error">{error}</Alert>}
        <div className="mt-5 flex justify-end gap-2">
          <Btn variant="ghost" onClick={() => setOpen(false)}>Cancel</Btn>
          <Btn onClick={save} disabled={busy || !form.name || (!editing?.system && form.permissionActions.length === 0)}>
            {busy ? "Saving…" : "Save"}
          </Btn>
        </div>
      </Modal>
    </div>
  );
}
