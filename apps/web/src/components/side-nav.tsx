"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SunMedium, PanelLeftClose, PanelLeftOpen, Plug } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardIcon } from "@/components/dashboard-icon";

interface NavDashboard {
  key: string;
  name: string;
  iconKey?: string | null;
}

interface Props {
  dashboards: NavDashboard[];
  collapsed: boolean;
  onToggle: () => void;
  /** Show the Integrations link in the bottom corner (CEO/Super Admin/Finance). */
  canManageIntegrations?: boolean;
  /** Whether the mobile slide-in drawer is open (<md screens). */
  mobileOpen?: boolean;
  /** Called to close the mobile drawer (backdrop tap / link navigation). */
  onMobileClose?: () => void;
}

export function SideNav({
  dashboards,
  collapsed,
  onToggle,
  canManageIntegrations,
  mobileOpen = false,
  onMobileClose,
}: Props) {
  const pathname = usePathname();
  const integrationsActive = pathname.startsWith("/integrations");

  return (
    <>
      {/* Mobile backdrop */}
      <div
        onClick={onMobileClose}
        aria-hidden="true"
        className={cn(
          "fixed inset-0 z-40 bg-black/50 md:hidden transition-opacity duration-200",
          mobileOpen
            ? "opacity-100"
            : "opacity-0 pointer-events-none",
        )}
      />
      <aside
        className={cn(
          "flex flex-col border-r bg-card",
          // Mobile: fixed slide-in drawer (always full width content).
          "fixed inset-y-0 left-0 z-50 w-60 max-w-[80vw] transform transition-transform duration-200 ease-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          // Desktop: static, collapsible by width.
          "md:static md:z-auto md:translate-x-0 md:max-w-none md:transition-[width]",
          collapsed ? "md:w-16" : "md:w-60",
        )}
      >
      <div
        className={cn(
          "h-16 flex items-center border-b",
          collapsed ? "justify-center px-2" : "justify-between px-4",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 min-w-0",
            collapsed && "justify-center",
          )}
        >
          <div className="h-8 w-8 shrink-0 rounded-md bg-primary/10 text-primary flex items-center justify-center">
            <SunMedium className="h-4 w-4" />
          </div>
          {!collapsed && (
            <span className="font-semibold tracking-tight truncate">
              AstraSolar
            </span>
          )}
        </div>
        {!collapsed && (
          <button
            type="button"
            onClick={onToggle}
            aria-label="Collapse sidebar"
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {collapsed && (
        <div className="flex justify-center py-2 border-b">
          <button
            type="button"
            onClick={onToggle}
            aria-label="Expand sidebar"
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </div>
      )}

      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {!collapsed && (
          <p className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
            Dashboards
          </p>
        )}
        {dashboards.map((d) => {
          const href = `/${d.key}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={d.key}
              href={href}
              onClick={onMobileClose}
              title={collapsed ? d.name : undefined}
              aria-label={d.name}
              className={cn(
                "flex items-center rounded-md text-sm transition-colors",
                collapsed
                  ? "justify-center h-10 w-10 mx-auto"
                  : "gap-3 px-3 py-2",
                active
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent",
              )}
            >
              <DashboardIcon iconKey={d.iconKey} className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{d.name}</span>}
            </Link>
          );
        })}
      </nav>

      {canManageIntegrations && (
        <div className={cn("border-t p-2", collapsed && "flex justify-center")}>
          <Link
            href="/integrations"
            onClick={onMobileClose}
            title={collapsed ? "Integrations" : undefined}
            aria-label="Integrations"
            className={cn(
              "flex items-center rounded-md text-sm transition-colors",
              collapsed
                ? "justify-center h-10 w-10"
                : "gap-3 px-3 py-2",
              integrationsActive
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-accent",
            )}
          >
            <Plug className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate">Integrations</span>}
          </Link>
        </div>
      )}

      {!collapsed && (
        <div className="p-3 text-[11px] text-muted-foreground border-t">
          v0.1.0 — internal use only
        </div>
      )}
      </aside>
    </>
  );
}
