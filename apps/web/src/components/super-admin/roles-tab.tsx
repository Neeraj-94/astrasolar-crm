"use client";

import { useMemo, useState } from "react";
import { useApi } from "@/lib/api/use-api";
import { apiPost, apiPatch, apiDelete } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PermissionRow {
  id: string;
  key: string;
  description?: string | null;
}
interface RoleRow {
  id: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  permissions: { permission: PermissionRow }[];
}

/** Group permission keys by their first segment (e.g. "dashboard", "leads"). */
function groupByPrefix(perms: PermissionRow[]) {
  const groups: Record<string, PermissionRow[]> = {};
  for (const p of perms) {
    const prefix = p.key.split(/[:.]/)[0] || "other";
    (groups[prefix] ||= []).push(p);
  }
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
}

export function SuperAdminRolesTab() {
  const roles = useApi<RoleRow[]>("/rbac/roles");
  const permissions = useApi<PermissionRow[]>("/rbac/permissions");

  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newRole, setNewRole] = useState<{
    name: string;
    description: string;
    keys: Set<string>;
  }>({ name: "", description: "", keys: new Set() });

  const [editId, setEditId] = useState<string | null>(null);
  const [editState, setEditState] = useState<{
    description: string;
    keys: Set<string>;
  }>({ description: "", keys: new Set() });

  const grouped = useMemo(
    () => groupByPrefix(permissions.data ?? []),
    [permissions.data],
  );

  function flash(setter: (v: string | null) => void, value: string) {
    setter(value);
    window.setTimeout(() => setter(null), 4000);
  }

  function toggle(set: Set<string>, key: string): Set<string> {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  }

  async function createRole(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiPost("/rbac/roles", {
        name: newRole.name,
        description: newRole.description || undefined,
        permissionKeys: Array.from(newRole.keys),
      });
      flash(setMsg, `Created role ${newRole.name}`);
      setNewRole({ name: "", description: "", keys: new Set() });
      setCreating(false);
      roles.reload();
    } catch (e) {
      flash(setErr, e instanceof Error ? e.message : "Could not create role");
    }
  }

  function startEdit(role: RoleRow) {
    setEditId(role.id);
    setEditState({
      description: role.description ?? "",
      keys: new Set(role.permissions.map((p) => p.permission.key)),
    });
    setErr(null);
    setMsg(null);
  }

  async function saveEdit(id: string) {
    try {
      await apiPatch(`/rbac/roles/${id}`, {
        description: editState.description,
        permissionKeys: Array.from(editState.keys),
      });
      flash(setMsg, "Role updated");
      setEditId(null);
      roles.reload();
    } catch (e) {
      flash(setErr, e instanceof Error ? e.message : "Could not update role");
    }
  }

  async function deleteRole(role: RoleRow) {
    if (!window.confirm(`Delete role "${role.name}"? This cannot be undone.`))
      return;
    try {
      await apiDelete(`/rbac/roles/${role.id}`);
      flash(setMsg, `Deleted role ${role.name}`);
      roles.reload();
    } catch (e) {
      flash(setErr, e instanceof Error ? e.message : "Could not delete role");
    }
  }

  function PermissionPicker({
    selected,
    onToggle,
  }: {
    selected: Set<string>;
    onToggle: (key: string) => void;
  }) {
    return (
      <div className="max-h-80 space-y-3 overflow-y-auto rounded-md border bg-background p-3">
        {grouped.map(([prefix, perms]) => (
          <div key={prefix}>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {prefix}
            </p>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {perms.map((p) => (
                <label
                  key={p.id}
                  className="flex items-start gap-2 rounded px-1 py-0.5 hover:bg-muted/50"
                  title={p.description ?? undefined}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={selected.has(p.key)}
                    onChange={() => onToggle(p.key)}
                  />
                  <span className="font-mono text-[11px] leading-tight">
                    {p.key}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {roles.data ? `${roles.data.length} roles` : "Roles"}
        </p>
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          {creating ? "Close" : "New role"}
        </Button>
      </div>

      {msg && <p className="text-sm text-emerald-600">{msg}</p>}
      {err && <p className="text-sm text-destructive">{err}</p>}

      {creating && (
        <form
          onSubmit={createRole}
          className="space-y-3 rounded-xl border bg-card p-5"
        >
          <h3 className="text-sm font-semibold">Create role</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="r-name">Name (key)</Label>
              <Input
                id="r-name"
                required
                placeholder="e.g. regional_manager"
                value={newRole.name}
                onChange={(e) =>
                  setNewRole({ ...newRole, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="r-desc">Description</Label>
              <Input
                id="r-desc"
                value={newRole.description}
                onChange={(e) =>
                  setNewRole({ ...newRole, description: e.target.value })
                }
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Permissions ({newRole.keys.size})</Label>
            <PermissionPicker
              selected={newRole.keys}
              onToggle={(key) =>
                setNewRole((s) => ({ ...s, keys: toggle(s.keys, key) }))
              }
            />
          </div>
          <Button type="submit">Create role</Button>
        </form>
      )}

      {roles.loading ? (
        <p className="text-sm text-muted-foreground">Loading roles…</p>
      ) : roles.error ? (
        <p className="text-sm text-destructive">{roles.error}</p>
      ) : (
        (roles.data ?? []).map((role) => {
          const editing = editId === role.id;
          return (
            <section key={role.id} className="rounded-xl border bg-card p-5">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">{role.name}</h3>
                  {editing ? (
                    <Input
                      className="mt-1"
                      placeholder="Description"
                      value={editState.description}
                      onChange={(e) =>
                        setEditState({
                          ...editState,
                          description: e.target.value,
                        })
                      }
                    />
                  ) : (
                    role.description && (
                      <p className="text-xs text-muted-foreground">
                        {role.description}
                      </p>
                    )
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {role.isSystem && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                      system
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {editing
                      ? `${editState.keys.size} selected`
                      : `${role.permissions.length} permissions`}
                  </span>
                </div>
              </div>

              {editing ? (
                <div className="space-y-3">
                  <PermissionPicker
                    selected={editState.keys}
                    onToggle={(key) =>
                      setEditState((s) => ({ ...s, keys: toggle(s.keys, key) }))
                    }
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveEdit(role.id)}>
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
                <>
                  <div className="flex flex-wrap gap-1">
                    {role.permissions.length === 0 ? (
                      <span className="text-xs text-muted-foreground">
                        No permissions
                      </span>
                    ) : (
                      role.permissions
                        .map((p) => p.permission.key)
                        .sort()
                        .map((k) => (
                          <span
                            key={k}
                            className="rounded bg-muted px-2 py-0.5 font-mono text-[11px]"
                          >
                            {k}
                          </span>
                        ))
                    )}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => startEdit(role)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={role.isSystem}
                      title={
                        role.isSystem
                          ? "System roles cannot be deleted"
                          : undefined
                      }
                      onClick={() => deleteRole(role)}
                    >
                      Delete
                    </Button>
                  </div>
                </>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
