"use client";

import { useState } from "react";
import { useApi } from "@/lib/api/use-api";
import { apiPost, apiPatch, apiDelete } from "@/lib/api/client";
import { useRowReorder } from "@/lib/api/use-reorder";
import {
  DataTable,
  THead,
  TBody,
  TR,
  TH,
  TD,
  DragTH,
} from "@/components/leads/shared/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface UserRow {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  roleKeys: string[];
}
interface RoleRow {
  id: string;
  name: string;
  description?: string | null;
}

export function SuperAdminUsersTab() {
  const users = useApi<UserRow[]>("/users");
  const roles = useApi<RoleRow[]>("/rbac/roles");
  const sortable = useRowReorder(users, (u) => u.id, "/users/reorder");

  const [form, setForm] = useState({
    email: "",
    name: "",
    password: "",
    role: "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Inline edit state keyed by user id.
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", password: "" });

  function flash(setter: (v: string | null) => void, value: string) {
    setter(value);
    window.setTimeout(() => setter(null), 4000);
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const created = await apiPost<{ emailSent?: boolean }>("/users", {
        email: form.email,
        name: form.name,
        password: form.password,
        roleKeys: form.role ? [form.role] : [],
      });
      if (created?.emailSent) {
        flash(setMsg, `Created ${form.email} — welcome email sent.`);
      } else {
        flash(
          setErr,
          `Created ${form.email}, but the welcome email could not be sent. Share the password manually (check SMTP settings).`,
        );
      }
      setForm({ email: "", name: "", password: "", role: "" });
      users.reload();
    } catch (e) {
      flash(setErr, e instanceof Error ? e.message : "Could not create user");
    } finally {
      setBusy(false);
    }
  }

  async function assignRole(userId: string, role: string) {
    if (!role) return;
    try {
      await apiPost(`/users/${userId}/roles`, { roleKeys: [role] });
      users.reload();
    } catch (e) {
      flash(setErr, e instanceof Error ? e.message : "Could not assign role");
    }
  }

  async function removeRole(userId: string, role: string) {
    try {
      await apiDelete(`/users/${userId}/roles/${encodeURIComponent(role)}`);
      users.reload();
    } catch (e) {
      flash(setErr, e instanceof Error ? e.message : "Could not remove role");
    }
  }

  async function toggleActive(u: UserRow) {
    try {
      await apiPatch(`/users/${u.id}/active`, { isActive: !u.isActive });
      users.reload();
    } catch (e) {
      flash(setErr, e instanceof Error ? e.message : "Could not update status");
    }
  }

  function startEdit(u: UserRow) {
    setEditId(u.id);
    setEditForm({ name: u.name, email: u.email, password: "" });
    setErr(null);
    setMsg(null);
  }

  async function saveEdit(id: string) {
    try {
      const payload: Record<string, string> = {
        name: editForm.name,
        email: editForm.email,
      };
      if (editForm.password) payload.password = editForm.password;
      await apiPatch(`/users/${id}`, payload);
      flash(setMsg, "User updated");
      setEditId(null);
      users.reload();
    } catch (e) {
      flash(setErr, e instanceof Error ? e.message : "Could not update user");
    }
  }

  async function deleteUser(u: UserRow) {
    if (
      !window.confirm(
        `Delete ${u.name} (${u.email})? This cannot be undone. If the user owns records, deactivate instead.`,
      )
    )
      return;
    try {
      await apiDelete(`/users/${u.id}`);
      flash(setMsg, `Deleted ${u.email}`);
      users.reload();
    } catch (e) {
      flash(setErr, e instanceof Error ? e.message : "Could not delete user");
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold">Create user</h3>
        <form
          onSubmit={createUser}
          className="grid grid-cols-1 gap-3 sm:grid-cols-5"
        >
          <div className="space-y-1">
            <Label htmlFor="u-email">Email</Label>
            <Input
              id="u-email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="u-name">Name</Label>
            <Input
              id="u-name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="u-pass">Temp password</Label>
            <Input
              id="u-pass"
              type="text"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="u-role">Role</Label>
            <select
              id="u-role"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="">—</option>
              {(roles.data ?? []).map((r) => (
                <option key={r.id} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
        {msg && <p className="mt-3 text-sm text-emerald-600">{msg}</p>}
        {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold">
          Users {users.data ? `(${users.data.length})` : ""}
        </h3>
        {users.loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : users.error ? (
          <p className="text-sm text-destructive">{users.error}</p>
        ) : (
          <DataTable sortable={sortable}>
            <THead>
              <tr>
                <DragTH />
                <TH>Name</TH>
                <TH>Email</TH>
                <TH>Status</TH>
                <TH>Roles</TH>
                <TH>Actions</TH>
              </tr>
            </THead>
            <TBody>
                {(users.data ?? []).map((u) => {
                  const editing = editId === u.id;
                  return (
                    <TR key={u.id} sortableId={u.id} className="align-top">
                      <TD className="align-top">
                        {editing ? (
                          <Input
                            value={editForm.name}
                            onChange={(e) =>
                              setEditForm({ ...editForm, name: e.target.value })
                            }
                          />
                        ) : (
                          u.name
                        )}
                      </TD>
                      <TD className="align-top">
                        {editing ? (
                          <Input
                            type="email"
                            value={editForm.email}
                            onChange={(e) =>
                              setEditForm({ ...editForm, email: e.target.value })
                            }
                          />
                        ) : (
                          <span className="text-muted-foreground">{u.email}</span>
                        )}
                      </TD>
                      <TD className="align-top">
                        <span
                          className={
                            "rounded-full px-2 py-0.5 text-[11px] " +
                            (u.isActive
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-muted text-muted-foreground")
                          }
                        >
                          {u.isActive ? "active" : "inactive"}
                        </span>
                      </TD>
                      <TD className="align-top">
                        <div className="flex flex-wrap gap-1">
                          {u.roleKeys.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            u.roleKeys.map((r) => (
                              <span
                                key={r}
                                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]"
                              >
                                {r}
                                <button
                                  type="button"
                                  title="Remove role"
                                  className="text-muted-foreground hover:text-destructive"
                                  onClick={() => removeRole(u.id, r)}
                                >
                                  ×
                                </button>
                              </span>
                            ))
                          )}
                          <select
                            className="h-6 rounded-md border bg-background px-1 text-[11px]"
                            defaultValue=""
                            onChange={(e) => {
                              assignRole(u.id, e.target.value);
                              e.target.value = "";
                            }}
                          >
                            <option value="">+ role</option>
                            {(roles.data ?? [])
                              .filter((r) => !u.roleKeys.includes(r.name))
                              .map((r) => (
                                <option key={r.id} value={r.name}>
                                  {r.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      </TD>
                      <TD className="align-top">
                        {editing ? (
                          <div className="space-y-2">
                            <Input
                              type="text"
                              placeholder="New password (optional)"
                              value={editForm.password}
                              onChange={(e) =>
                                setEditForm({
                                  ...editForm,
                                  password: e.target.value,
                                })
                              }
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => saveEdit(u.id)}
                              >
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => startEdit(u)}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => toggleActive(u)}
                            >
                              {u.isActive ? "Deactivate" : "Activate"}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => deleteUser(u)}
                            >
                              Delete
                            </Button>
                          </div>
                        )}
                      </TD>
                    </TR>
                  );
                })}
            </TBody>
          </DataTable>
        )}
      </section>
    </div>
  );
}
