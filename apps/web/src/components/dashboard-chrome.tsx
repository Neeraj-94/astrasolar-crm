"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { SideNav } from "@/components/side-nav";
import { UserMenu } from "@/components/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notification-bell";
import { NotificationsProvider } from "@/components/notifications/notifications-context";
import { FloatingDock } from "@/components/floating-dock";

interface ChromeDashboard {
  key: string;
  name: string;
  iconKey?: string | null;
}

interface Props {
  dashboards: ChromeDashboard[];
  showSideNav: boolean;
  user: {
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  roleLabels: string[];
  /** Whether the signed-in user may use Nova (drives the floating assistant). */
  canUseNova?: boolean;
  /** Whether to show the floating System Price Calculator (internal staff). */
  canUsePriceCalc?: boolean;
  /** Whether the user may manage integrations (shows the side-nav link). */
  canManageIntegrations?: boolean;
  children: React.ReactNode;
}

const STORAGE_KEY = "astrasolar:sidenav-collapsed";

/**
 * Client-side chrome around every dashboard: side nav (collapsible), header,
 * and main content area. The dashboard layout stays a server component and
 * passes serializable props in.
 */
export function DashboardChrome({
  dashboards,
  showSideNav,
  user,
  roleLabels,
  canUseNova,
  canUsePriceCalc,
  canManageIntegrations,
  children,
}: Props) {
  // Start collapsed=false so the server-rendered HTML and the first client
  // render match. We hydrate the persisted value in an effect below.
  const [collapsed, setCollapsed] = useState(false);
  // Mobile (<md) slide-in drawer open state. Separate from `collapsed`, which
  // only controls the desktop sidebar width.
  const [mobileOpen, setMobileOpen] = useState(false);
  // Whether we're on a mobile viewport. On mobile the drawer always shows the
  // full (expanded) nav, regardless of the persisted desktop collapse state.
  const [isMobile, setIsMobile] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "true") setCollapsed(true);
    } catch {
      // localStorage may be unavailable (private mode, etc.) — ignore.
    }
  }, []);

  // Track viewport so the mobile drawer renders expanded content. md = 768px.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  // On mobile the drawer is always expanded; collapse only applies to desktop.
  const effectiveCollapsed = isMobile ? false : collapsed;

  return (
    <NotificationsProvider>
    <div className="min-h-screen flex">
      {showSideNav && (
        <SideNav
          dashboards={dashboards}
          collapsed={effectiveCollapsed}
          onToggle={toggle}
          canManageIntegrations={canManageIntegrations}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b bg-card flex items-center justify-between px-6 sticky top-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            {showSideNav && (
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation menu"
                aria-expanded={mobileOpen}
                className="md:hidden h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <Menu className="h-4 w-4" />
              </button>
            )}
            {!showSideNav && (
              <span className="font-semibold tracking-tight">AstraSolar</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <ThemeToggle />
            <UserMenu
              email={user.email}
              displayName={user.displayName}
              avatarUrl={user.avatarUrl}
              roleLabels={roleLabels}
            />
          </div>
        </header>

        <main className="flex-1 px-6 py-6">{children}</main>
      </div>

      <FloatingDock
        userName={user.displayName ?? undefined}
        canUseNova={canUseNova}
        canUsePriceCalc={canUsePriceCalc}
      />
    </div>
    </NotificationsProvider>
  );
}
