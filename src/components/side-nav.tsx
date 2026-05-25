"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SunMedium } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardIcon } from "@/components/dashboard-icon";

interface NavDashboard {
  key: string;
  name: string;
  iconKey?: string | null;
}

interface Props {
  dashboards: NavDashboard[];
}

export function SideNav({ dashboards }: Props) {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-60 flex-col border-r bg-card">
      <div className="h-16 flex items-center gap-2 px-6 border-b">
        <div className="h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center">
          <SunMedium className="h-4 w-4" />
        </div>
        <span className="font-semibold tracking-tight">AstraSolar</span>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        <p className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
          Dashboards
        </p>
        {dashboards.map((d) => {
          const href = `/${d.key}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={d.key}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent",
              )}
            >
              <DashboardIcon iconKey={d.iconKey} className="h-4 w-4" />
              {d.name}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 text-[11px] text-muted-foreground border-t">
        v0.1.0 — internal use only
      </div>
    </aside>
  );
}
