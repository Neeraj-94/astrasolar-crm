"use client";

import * as React from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Package,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PageHeader,
  Section,
  StatusBadge,
  SubTabs,
  type SubTab,
} from "@/components/leads/shared";
import { cn } from "@/lib/utils";

/**
 * Admin → Installation Calendar tab.
 *
 * Ported from astrasolar-app `#admin-tab-calendar` (index.html ~8628-8964).
 * The original is a multi-region day/week/month grid with a booking modal
 * and a weekly stock requirements section. The v2 port renders the same
 * chrome — region tabs, view toggle, calendar nav, weekly stock summary —
 * and leaves the booking modal + live data for a follow-up wire-up.
 */

type RegionKey = "all" | "tas-south" | "tas-north" | "act" | "nsw";
type CalendarView = "day" | "week" | "month";

const REGIONS: { key: RegionKey; label: string }[] = [
  { key: "all", label: "🌏 All Regions" },
  { key: "tas-south", label: "TAS South" },
  { key: "tas-north", label: "TAS North" },
  { key: "act", label: "ACT" },
  { key: "nsw", label: "NSW" },
];

const VIEW_TABS: SubTab[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

interface CrewChip {
  id: string;
  name: string;
  available: boolean;
}

const CREW_CHIPS: CrewChip[] = [
  { id: "crew-1", name: "Crew A", available: true },
  { id: "crew-2", name: "Crew B", available: true },
  { id: "crew-3", name: "Crew C", available: false },
];

interface CalendarCell {
  day: number;
  inMonth: boolean;
  bookings: { id: string; customer: string; status: "booked" | "needs_booking" }[];
}

function monthLabel(d: Date): string {
  return d.toLocaleString("en-AU", { month: "long", year: "numeric" });
}

function buildMonth(anchor: Date): CalendarCell[] {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const first = new Date(y, m, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: CalendarCell[] = [];
  // Lead in
  for (let i = 0; i < startDow; i++) {
    cells.push({
      day: new Date(y, m, -startDow + i + 1).getDate(),
      inMonth: false,
      bookings: [],
    });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, inMonth: true, bookings: [] });
  }
  // Pad to 6 rows
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const last = cells[cells.length - 1];
    cells.push({
      day: last && last.inMonth ? 1 : (last?.day ?? 0) + 1,
      inMonth: false,
      bookings: [],
    });
  }
  return cells.slice(0, 42);
}

export function InstallationCalendarTab() {
  const [region, setRegion] = React.useState<RegionKey>("all");
  const [view, setView] = React.useState<CalendarView>("week");
  const [anchor, setAnchor] = React.useState(() => new Date());
  const [search, setSearch] = React.useState("");

  const cells = React.useMemo(() => buildMonth(anchor), [anchor]);

  function shift(delta: number) {
    setAnchor((d) => {
      const next = new Date(d);
      if (view === "day") next.setDate(next.getDate() + delta);
      else if (view === "week") next.setDate(next.getDate() + 7 * delta);
      else next.setMonth(next.getMonth() + delta);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Installation Calendar"
        description="Day / week / month grid of every booked installation across regions, with crew availability and weekly stock totals."
      />

      <Section flush>
        <div className="border-b px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {REGIONS.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRegion(r.key)}
                className={cn(
                  "h-8 rounded-md border px-3 text-xs font-medium transition-colors",
                  region === r.key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card hover:bg-accent",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="border-b px-5 py-3 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-sm">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search installs by name, address, installer…"
              className="pl-8 h-9"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => setSearch("")}>
            Clear
          </Button>
        </div>

        <div className="border-b px-5 py-3 flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Crew Availability
          </span>
          <div className="flex flex-wrap gap-2">
            {CREW_CHIPS.map((c) => (
              <StatusBadge
                key={c.id}
                tone={c.available ? "success" : "danger"}
                dot
              >
                {c.name}
              </StatusBadge>
            ))}
          </div>
          <Button variant="outline" size="sm" className="ml-auto">
            Edit Schedule
          </Button>
        </div>

        <div className="px-5 py-3 flex flex-wrap items-center gap-3 border-b">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold tracking-tight">
              {monthLabel(anchor)}
            </span>
            <SubTabs
              tabs={VIEW_TABS}
              value={view}
              onChange={(k) => setView(k as CalendarView)}
            />
            <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>
              Today
            </Button>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => shift(-1)}
              aria-label="Previous"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => shift(1)}
              aria-label="Next"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="p-5">
          {view === "month" ? (
            <div className="grid grid-cols-7 gap-px rounded-md border bg-border overflow-hidden">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div
                  key={d}
                  className="bg-muted px-2 py-1.5 text-xs font-medium text-muted-foreground"
                >
                  {d}
                </div>
              ))}
              {cells.map((c, i) => (
                <div
                  key={i}
                  className={cn(
                    "min-h-[88px] bg-card p-2 text-xs",
                    !c.inMonth && "text-muted-foreground/50",
                  )}
                >
                  <div className="font-medium">{c.day}</div>
                  {c.bookings.map((b) => (
                    <div
                      key={b.id}
                      className="mt-1 truncate rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary"
                    >
                      {b.customer}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-md border border-dashed py-12 text-center text-sm text-muted-foreground">
              <CalendarDays className="h-8 w-8 mb-2 opacity-60" />
              <p>
                {view === "day" ? "Day" : "Week"} view — installations for{" "}
                {monthLabel(anchor)} land here once wired to the bookings feed.
              </p>
            </div>
          )}
        </div>
      </Section>

      <Section
        title="Weekly Stock Requirement"
        description="Panels, inverters, batteries and extras needed for installations booked this week."
        actions={
          <Button variant="outline" size="sm" className="gap-2">
            <Package className="h-4 w-4" />
            Recompute
          </Button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Panels", value: "—" },
            { label: "Inverters", value: "—" },
            { label: "Batteries", value: "—" },
            { label: "Extras", value: "—" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-md border p-4"
            >
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {s.label}
              </p>
              <p className="text-xl font-semibold mt-1">{s.value}</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
