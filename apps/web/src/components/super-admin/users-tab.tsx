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
  aliases: string[];
  isActive: boolean;
  roleKeys: string[];
  canSendWelcome?: boolean;
  welcomeEmailSentAt?: string | null;
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
    aliases: [] as string[],
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Inline edit state keyed by user id.
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    password: "",
    aliases: [] as string[],
  });

  // Per-row "send welcome email" in-flight state.
  const [sendingId, setSendingId] = useState<string | null>(null);

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
      await apiPost("/users", {
        email: form.email,
        name: form.name,
        password: form.password,
        aliases: form.aliases,
        roleKeys: form.role ? [form.role] : [],
      });
      flash(
        setMsg,
        `Created ${form.email}. Use “Send email” in the table to notify them with their login details.`,
      );
      setForm({ email: "", name: "", password: "", role: "", aliases: [] });
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

  async function sendWelcome(u: UserRow) {
    if (
      !window.confirm(
        `Send the account-creation email to ${u.name} (${u.email}) with their login link and password?`,
      )
    )
      return;
    setSendingId(u.id);
    setErr(null);
    setMsg(null);
    try {
      const res = await apiPost<{ emailSent?: boolean }>(
        `/users/${u.id}/welcome-email`,
      );
      if (res?.emailSent) {
        flash(setMsg, `Account email sent to ${u.email}.`);
      } else {
        flash(
          setErr,
          `Could not send the email to ${u.email} — check SMTP settings.`,
        );
      }
      users.reload();
    } catch (e) {
      flash(setErr, e instanceof Error ? e.message : "Could not send email");
    } finally {
      setSendingId(null);
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
    setEditForm({
      name: u.name,
      email: u.email,
      password: "",
      aliases: u.aliases ?? [],
    });
    setErr(null);
    setMsg(null);
  }

  async function saveEdit(id: string) {
    try {
      const payload: Record<string, string | string[]> = {
        name: editForm.name,
        email: editForm.email,
        aliases: editForm.aliases,
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
          className="grid grid-cols-1 gap-3 sm:grid-cols-6"
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
          <div className="space-y-1">
            <Label htmlFor="u-aliases">Aliases</Label>
            <AliasEditor
              inputId="u-aliases"
              value={form.aliases}
              onChange={(aliases) => setForm({ ...form, aliases })}
            />
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
                <TH>Aliases</TH>
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
                        {editing ? (
                          <AliasEditor
                            value={editForm.aliases}
                            onChange={(aliases) =>
                              setEditForm({ ...editForm, aliases })
                            }
                          />
                        ) : u.aliases.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {u.aliases.map((a) => (
                              <span
                                key={a}
                                className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px]"
                              >
                                {a}
                              </span>
                            ))}
                          </div>
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
                          <div className="flex flex-wrap items-center gap-2">
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
                              disabled={
                                sendingId === u.id || u.canSendWelcome === false
                              }
                              title={
                                u.canSendWelcome === false
                                  ? "No temporary password on file — reset the user's password first, then resend."
                                  : "Email the user their account login link and password"
                              }
                              onClick={() => sendWelcome(u)}
                            >
                              {sendingId === u.id
                                ? "Sending…"
                                : u.welcomeEmailSentAt
                                  ? "Resend email"
                                  : "Send email"}
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
                            {u.welcomeEmailSentAt && (
                              <span className="text-[11px] text-muted-foreground">
                                sent{" "}
                                {new Date(
                                  u.welcomeEmailSentAt,
                                ).toLocaleDateString()}
                              </span>
                            )}
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

/** Tag-style editor for a user's aliases: removable chips + an add field
 *  (commit on Enter, comma, or blur; case-insensitive de-dupe). */
function AliasEditor({
  value,
  onChange,
  inputId,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  inputId?: string;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const v = draft.trim();
    if (v && !value.some((a) => a.toLowerCase() === v.toLowerCase())) {
      onChange([...value, v]);
    }
    setDraft("");
  }

  return (
    <div className="space-y-1">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((a) => (
            <span
              key={a}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]"
            >
              {a}
              <button
                type="button"
                title="Remove alias"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => onChange(value.filter((x) => x !== a))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <Input
        id={inputId}
        className="h-8 text-[11px]"
        placeholder="Add alias…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !draft && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={commit}
      />
    </div>
  );
}
