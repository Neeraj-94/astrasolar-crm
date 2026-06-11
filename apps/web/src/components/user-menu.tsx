"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { LogOut, UserCircle } from "lucide-react";

interface Props {
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  roleLabels: string[];
}

export function UserMenu({ email, displayName, avatarUrl, roleLabels }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const initials =
    (displayName ?? email)
      .split(/\s|@/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || "U";

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      router.push("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="User menu"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="h-9 w-9 rounded-full object-cover border"
            />
          ) : (
            <span className="h-9 w-9 rounded-full bg-primary/10 text-primary text-sm font-medium flex items-center justify-center border">
              {initials}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{displayName ?? email}</span>
            <span className="text-xs text-muted-foreground">{email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
            Roles
          </p>
          {roleLabels.length === 0 ? (
            <p className="text-xs text-muted-foreground">No roles assigned</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {roleLabels.map((r) => (
                <span
                  key={r}
                  className="text-[11px] rounded-full bg-muted px-2 py-0.5"
                >
                  {r}
                </span>
              ))}
            </div>
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile" className="cursor-pointer">
            <UserCircle className="h-4 w-4 mr-2" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={logout}
          disabled={busy}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="h-4 w-4 mr-2" />
          {busy ? "Signing out..." : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
