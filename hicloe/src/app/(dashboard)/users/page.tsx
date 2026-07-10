"use client";
import { useCallback, useEffect, useState } from "react";
import { UserPlus, ShieldOff, ShieldCheck as ShieldCheckIcon } from "lucide-react";
import { Alert, Badge, Btn, Modal, MultiSelect, Th, Td, type Option } from "@/components/ui";

type Role = { id: string; name: string };
type User = {
  id: string; fullName: string; email: string; status: "INVITED" | "ACTIVE" | "SUSPENDED";
  attributes: { instructorId?: string; programIds?: string[]; batchIds?: string[] };
  roles: Role[]; createdAt: string;
};

const statusTone: Record<User["status"], "gray" | "blue" | "green" | "red"> = {
  INVITED: "blue", ACTIVE: "green", SUSPENDED: "red",
};

const blankForm = {
  fullName: "", email: "", roleIds: [] as string[],
  instructorId: "", programIds: [] as string[], batchIds: [] as string[],
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Option[]>([]);
  const [instructors, setInstructors] = useState<Option[]>([]);
  const [programs, setPrograms] = useState<Option[]>([]);
  const [batches, setBatches] = useState<Option[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState(blankForm);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/users");
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return setError(data.error ?? "Failed to load users");
    setUsers(data.users ?? []);
  }, []);

  useEffect(() => {
    load();
    fetch("/api/admin/roles").then((r) => r.json()).then((d) =>
      setRoles((d.roles ?? []).map((r: any) => ({ value: r.id, label: r.name }))));
    fetch("/api/entities/instructors").then((r) => r.json()).then((d) =>
      setInstructors((d.rows ?? []).map((i: any) => ({ value: i.id, label: i.fullName }))));
    fetch("/api/entities/programs").then((r) => r.json()).then((d) =>
      setPrograms((d.rows ?? []).map((p: any) => ({ value: p.id, label: `${p.name} (${p.code})` }))));
    fetch("/api/entities/batches").then((r) => r.json()).then((d) =>
      setBatches((d.rows ?? []).map((b: any) => ({ value: b.id, label: b.name }))));
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setMeId(d.id ?? null)).catch(() => {});
  }, [load]);

  const openInvite = () => { setEditing(null); setForm(blankForm); setError(null); setOpen(true); };
  const openEdit = (u: User) => {
    setEditing(u);
    setForm({
      fullName: u.fullName, email: u.email, roleIds: u.roles.map((r) => r.id),
      instructorId: u.attributes.instructorId ?? "",
      programIds: u.attributes.programIds ?? [], batchIds: u.attributes.batchIds ?? [],
    });
    setError(null);
    setOpen(true);
  };

  function buildAttributes() {
    const attrs: Record<string, unknown> = {};
    if (form.instructorId) attrs.instructorId = form.instructorId;
    if (form.programIds.length) attrs.programIds = form.programIds;
    if (form.batchIds.length) attrs.batchIds = form.batchIds;
    return attrs;
  }

  async function save() {
    setBusy(true); setError(null);
    const attributes = buildAttributes();
    const res = editing
      ? await fetch(`/api/admin/users/${editing.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fullName: form.fullName, roleIds: form.roleIds, attributes }),
        })
      : await fetch("/api/admin/users", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fullName: form.fullName, email: form.email, roleIds: form.roleIds, attributes }),
        });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Save failed");
    setOpen(false);
    load();
  }

  async function toggleStatus(u: User) {
    const next = u.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
    if (next === "SUSPENDED" && !confirm(`Suspend ${u.fullName}? This immediately signs them out everywhere.`)) return;
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error ?? "Update failed");
    load();
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-[21px] font-bold tracking-tight">Users</h1>
          <p className="text-[13px] text-ink-muted">Invite staff, assign roles, and scope access.</p>
        </div>
        <Btn onClick={openInvite}><UserPlus size={15} /> Invite user</Btn>
      </div>

      <div className="glass-panel overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead className="border-b border-line">
            <tr>
              <Th>Name</Th><Th>Email</Th><Th>Status</Th><Th>Roles</Th><Th>Scope</Th><Th> </Th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td className="px-4 py-8 text-center text-[13px] text-ink-faint" colSpan={6}>Loading…</td></tr>}
            {!loading && users.length === 0 && (
              <tr><td className="px-4 py-10 text-center text-[13px] text-ink-faint" colSpan={6}>No users yet.</td></tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="border-b border-line last:border-0 transition-colors hover:bg-brand-soft/40">
                <Td>
                  <span className="font-medium">{u.fullName}</span>
                  {u.id === meId && <span className="ml-1.5 text-[11px] text-ink-faint">(you)</span>}
                </Td>
                <Td>{u.email}</Td>
                <Td><Badge tone={statusTone[u.status]}>{u.status.toLowerCase()}</Badge></Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {u.roles.map((r) => <Badge key={r.id} tone="gray">{r.name}</Badge>)}
                    {u.roles.length === 0 && <span className="text-ink-faint">—</span>}
                  </div>
                </Td>
                <Td>
                  <span className="text-[12px] text-ink-faint">
                    {u.attributes.instructorId ? "instructor-scoped" :
                     (u.attributes.programIds?.length || u.attributes.batchIds?.length) ? "scoped" : "unrestricted"}
                  </span>
                </Td>
                <Td>
                  <div className="flex justify-end gap-1.5">
                    <Btn small variant="ghost" onClick={() => openEdit(u)}>Edit</Btn>
                    {u.id !== meId && (
                      <Btn small variant={u.status === "SUSPENDED" ? "primary" : "danger"} onClick={() => toggleStatus(u)}>
                        {u.status === "SUSPENDED"
                          ? <><ShieldCheckIcon size={13} /> Reactivate</>
                          : <><ShieldOff size={13} /> Suspend</>}
                      </Btn>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal title={editing ? `Edit ${editing.fullName}` : "Invite a user"} open={open} onClose={() => setOpen(false)} wide>
        <label>Full name</label>
        <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />

        <label>Email</label>
        <input type="email" value={form.email} disabled={!!editing}
          placeholder="name@hilcoe.edu.et"
          onChange={(e) => setForm({ ...form, email: e.target.value })} />
        {!editing && <p className="mt-1 text-[12px] text-ink-faint">An activation email is sent immediately — they set their own password.</p>}

        <label>Roles</label>
        <MultiSelect options={roles} value={form.roleIds} onChange={(v) => setForm({ ...form, roleIds: v })} />

        <div className="mt-4 rounded-control border border-line bg-surface/40 p-3">
          <p className="mb-2 text-[12.5px] font-semibold text-ink-muted">Access scope (optional — leave blank for unrestricted)</p>
          <label className="!mt-0">Link to instructor record</label>
          <select value={form.instructorId} onChange={(e) => setForm({ ...form, instructorId: e.target.value })}>
            <option value="">— none —</option>
            {instructors.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <p className="mt-1 text-[12px] text-ink-faint">Lets an Instructor-role user edit only their own availability grid.</p>

          <label>Restrict review scope to programs</label>
          <MultiSelect options={programs} value={form.programIds} onChange={(v) => setForm({ ...form, programIds: v })} />

          <label>Restrict review scope to batches</label>
          <MultiSelect options={batches} value={form.batchIds} onChange={(v) => setForm({ ...form, batchIds: v })} />
          <p className="mt-1 text-[12px] text-ink-faint">Used by the Verifier role — leave both empty for an unrestricted verifier.</p>
        </div>

        {error && <Alert kind="error">{error}</Alert>}
        <div className="mt-5 flex justify-end gap-2">
          <Btn variant="ghost" onClick={() => setOpen(false)}>Cancel</Btn>
          <Btn onClick={save} disabled={busy || !form.fullName || (!editing && !form.email) || form.roleIds.length === 0}>
            {busy ? "Saving…" : editing ? "Save changes" : "Send invite"}
          </Btn>
        </div>
      </Modal>
    </div>
  );
}
