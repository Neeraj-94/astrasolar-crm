"use client";

import * as React from "react";
import { CalendarDays, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PageHeader,
  Section,
  SubTabs,
  type SubTab,
} from "@/components/leads/shared";
import { cn } from "@/lib/utils";

/**
 * Admin → Inbound Leads tab.
 *
 * Ported from astrasolar-app `#admin-tab-leads` (index.html ~8998-9051).
 * Shows a shared leads schedule with week navigation, quick-jump filters
 * (Next Available / Day / Evening / Weekend) and cross-week global search.
 */

type WeekKey = "prev" | "this" | "next" | "fwd";
type JumpKey = "any" | "day" | "evening" | "weekend";

const WEEK_TABS: SubTab[] = [
  { key: "prev", label: "◀ Prev" },
  { key: "this", label: "This Week" },
  { key: "next", label: "Next Week" },
  { key: "fwd", label: "Fwd ▶" },
];

const JUMPS: { key: JumpKey; label: string }[] = [
  { key: "any", label: "Next Available" },
  { key: "day", label: "Next Day" },
  { key: "evening", label: "Next Evening" },
  { key: "weekend", label: "Next Weekend" },
];

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const dow = x.getDay();
  x.setDate(x.getDate() - dow);
  x.setHours(0, 0, 0, 0);
  return x;
}

function fmt(d: Date): string {
  return d.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function weekRangeLabel(anchor: Date): string {
  const s = startOfWeek(anchor);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  return `${fmt(s)} → ${fmt(e)}`;
}

export function AdminInboundLeadsTab() {
  const [week, setWeek] = React.useState<WeekKey>("this");
  const [anchor, setAnchor] = React.useState(() => new Date());
  const [search, setSearch] = React.useState("");

  function applyWeek(key: WeekKey) {
    setWeek(key);
    const d = new Date();
    if (key === "prev") d.setDate(d.getDate() - 7);
    if (key === "next") d.setDate(d.getDate() + 7);
    if (key === "fwd") d.setDate(d.getDate() + 14);
    setAnchor(d);
  }

  const days = React.useMemo(() => {
    const s = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(s);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [anchor]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Inbound Leads"
        description="Shared leads schedule — admin view of consultant appointments and inbound leads, with cross-week search."
      />

      <Section flush>
        <div className="border-b px-5 py-3 flex flex-wrap items-center gap-3">
          <SubTabs
            tabs={WEEK_TABS}
            value={week}
            onChange={(k) => applyWeek(k as WeekKey)}
          />
          <span className="text-xs text-muted-foreground">
            {weekRangeLabel(anchor)}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            {JUMPS.map((j) => (
              <Button
                key={j.key}
                variant="outline"
                size="sm"
                className="h-8"
              >
                {j.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="border-b px-5 py-3">
          <div className="relative max-w-2xl">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ALL leads across all weeks — name, phone, email, address…"
              className="pl-8 h-9"
            />
          </div>
        </div>

        <div className="p-5">
          {search.trim() ? (
            <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
              Global search results for{" "}
              <span className="font-medium text-foreground">
                &ldquo;{search}&rdquo;
              </span>{" "}
              will appear here. The cross-week search hits every inbound lead,
              regardless of which week is on screen.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
              {days.map((d, i) => {
                const isToday = d.toDateString() === new Date().toDateString();
                return (
                  <div
                    key={i}
                    className={cn(
                      "rounded-md border p-3 min-h-[140px]",
                      isToday && "border-primary/60 bg-primary/5",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {d.toLocaleDateString("en-AU", { weekday: "short" })}
                      </p>
                      <span className="text-sm font-semibold">
                        {d.getDate()}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {d.toLocaleDateString("en-AU", { month: "short" })}
                    </p>
                    <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" />
                      <span>No leads</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}
