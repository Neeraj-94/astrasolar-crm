"use client";

import * as React from "react";
import {
  Bell,
  Calendar as CalendarIcon,
  CheckCircle2,
  Circle,
  ClipboardList,
  Mic2,
  Search,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Kpi,
  KpiRow,
  PageHeader,
  Section,
  StatusBadge,
} from "@/components/leads/shared";

/**
 * Admin → Overview tab.
 *
 * Ported from astrasolar-app `#admin-tab-overview` (index.html ~8503-8617).
 * The legacy tab is a stats grid + drill-downs + "Today's Installations" grid
 * + a Team Status widget. Here we render the same building blocks against
 * static placeholder data — the API hooks land in a follow-up.
 */

interface AdminStat {
  key: string;
  label: string;
  value: number;
  trend: string;
  tone: "primary" | "success" | "warning" | "info" | "danger" | "default";
}

const ADMIN_STATS: AdminStat[] = [
  { key: "installed", label: "Total Installed", value: 0, trend: "All time", tone: "success" },
  { key: "booked", label: "Installations Booked", value: 0, trend: "Scheduled", tone: "primary" },
  { key: "ready", label: "Ready to Be Booked", value: 0, trend: "Ready for scheduling", tone: "warning" },
  { key: "pending", label: "Pending Approval", value: 0, trend: "Waiting for review", tone: "info" },
  { key: "unassigned", label: "Unassigned", value: 0, trend: "Between pipeline stages", tone: "danger" },
];

interface InstallRow {
  id: string;
  customer: string;
  region: string;
  installer: string;
  status: "scheduled" | "in_progress" | "complete";
}

const TODAYS_INSTALLS: InstallRow[] = [];

interface TeamMember {
  id: string;
  name: string;
  role: string;
  online: boolean;
}

const TEAM_STATUS: TeamMember[] = [];

export function AdminOverviewTab() {
  const [drilldown, setDrilldown] = React.useState<string | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Overview"
        description="Live pipeline counts, today's installations, and team status — the admin's morning snapshot."
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-2">
              <Bell className="h-4 w-4" />
              Set Reminder
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
              <Mic2 className="h-4 w-4" />
              Astra Voice
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
              <Search className="h-4 w-4" />
              Data Corrections
            </Button>
          </>
        }
      />

      <KpiRow>
        {ADMIN_STATS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() =>
              setDrilldown((d) => (d === s.key ? null : s.key))
            }
            className="text-left"
          >
            <Kpi
              label={s.label}
              value={s.value}
              hint={s.trend}
              tone={s.tone}
              icon={<TrendingUp className="h-4 w-4" />}
            />
          </button>
        ))}
      </KpiRow>

      {drilldown && (
        <Section
          title={
            ADMIN_STATS.find((s) => s.key === drilldown)?.label ?? "Drill down"
          }
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDrilldown(null)}
            >
              Close
            </Button>
          }
        >
          <p className="text-sm text-muted-foreground">
            Drill-down details land here. In astrasolar-app this panel lists the
            matching pipeline rows (Pending Approval, Ready to Be Booked,
            Unassigned, Installation Due, or Installed Sales depending on which
            card you clicked).
          </p>
        </Section>
      )}

      <Section
        title="Today's Installations"
        description="Installations scheduled to start today across every region."
        actions={
          <Button variant="outline" size="sm" className="gap-2">
            <CalendarIcon className="h-4 w-4" />
            Open Calendar
          </Button>
        }
      >
        {TODAYS_INSTALLS.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-sm text-muted-foreground">
            <ClipboardList className="h-8 w-8 mb-2 opacity-60" />
            <p>No installations scheduled today.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {TODAYS_INSTALLS.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <p className="font-medium text-sm">{r.customer}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.region} · {r.installer}
                  </p>
                </div>
                <StatusBadge tone={r.status === "complete" ? "success" : "warning"}>
                  {r.status.replace("_", " ")}
                </StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Team Status"
        description="Live online / offline status across the consultant team."
      >
        {TEAM_STATUS.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Circle className="h-3 w-3" />
            <span>0 online — team status feed will appear here.</span>
          </div>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {TEAM_STATUS.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div>
                  <p className="text-sm font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.role}</p>
                </div>
                <span
                  className={
                    "inline-flex items-center gap-1 text-xs font-medium " +
                    (m.online
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground")
                  }
                >
                  {m.online ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <Circle className="h-3 w-3" />
                  )}
                  {m.online ? "Online" : "Offline"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
