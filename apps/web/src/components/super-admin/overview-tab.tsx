"use client";

import Link from "next/link";
import { useApi } from "@/lib/api/use-api";
import { Users, ShieldCheck } from "lucide-react";

interface UserRow {
  id: string;
  name: string;
  roleKeys: string[];
}
interface RoleRow {
  id: string;
  name: string;
  isSystem?: boolean;
}

export function SuperAdminOverviewTab() {
  const users = useApi<UserRow[]>("/users");
  const roles = useApi<RoleRow[]>("/rbac/roles");

  const userCount = users.data?.length ?? null;
  const roleCount = roles.data?.length ?? null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/super-admin/users"
          className="group rounded-xl border bg-card p-5 transition-colors hover:border-primary/50"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Users</p>
              <p className="text-2xl font-semibold leading-tight">
                {userCount ?? "—"}
              </p>
            </div>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Create users, assign roles, and manage accounts.
          </p>
        </Link>

        <Link
          href="/super-admin/roles"
          className="group rounded-xl border bg-card p-5 transition-colors hover:border-primary/50"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Roles</p>
              <p className="text-2xl font-semibold leading-tight">
                {roleCount ?? "—"}
              </p>
            </div>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Roles and the permission grants behind them.
          </p>
        </Link>
      </div>

      <p className="text-sm text-muted-foreground">
        The Super Admin console is restricted to system administrators. Use the
        Users and Roles tabs above to manage access across the platform.
      </p>
    </div>
  );
}
