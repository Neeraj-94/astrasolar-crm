"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Sun,
  Sunrise,
  Sunset,
  TreePalm,
  Users,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ConsultantAvatar,
  Kpi,
  KpiRow,
  PageHeader,
  Section,
  StatusBadge,
} from "./shared";

const FIRST_HOUR = 8;
const LAST_HOUR = 19;
const HOURS = Array.from(
  { length: LAST_HOUR - FIRST_HOUR + 1 },
  (_, i) => FIRST_HOUR + i,
);
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Status = "AVAILABLE" | "UNAVAILABLE";

interface Consultant {
  id: string;
  displayName: string | null;
  email: string;
  region: string | null;
}

interface SlotRecord {
  consultantId: string;
  date: string;
  hour: number;
  status: Status;
  note: string | null;
}

interface Props {
  consultants: Consultant[];
  initialSlots: SlotRecord[];
  initialWeekStart: string;
  canEdit: boolean;
}

function fromISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}
function slotKey(consultantId: string, date: string, hour: number): string {
  return `${consultantId}|${date}|${hour}`;
}
function consultantLabel(c: Consultant): string {
  return c.displayName || c.email;
}
function formatHourRange(h: number): string {
  const fmt = (n: number) => {
    const period = n >= 12 ? "PM" : "AM";
    const v = n % 12 === 0 ? 12 : n % 12;
    return `${v}${period}`;
  };
  return `${fmt(h)} – ${fmt(h + 1)}`;
}

export function TeamAvailabilityClient({
  consultants,
  initialSlots,
  initialWeekStart,
  canEdit,
}: Props) {
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [selectedConsultantIds, setSelectedConsultantIds] = useState<string[]>(
    consultants.length > 0 ? [consultants[0].id] : [],
  );
  const [selectedDay, setSelectedDay] = useState<string>(initialWeekStart);
  const [slots, setSlots] = useState<Map<string, Status>>(() => {
    const m = new Map<string, Status>();
    for (const s of initialSlots) {
      m.set(slotKey(s.consultantId, s.date, s.hour), s.status);
    }
    return m;
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const weekDays = useMemo(() => {
    const start = fromISODate(weekStart);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [weekStart]);

  const todayWeekStartISO = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const offset = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + offset);
    return toISODate(d);
  }, []);

  // ---------------- Data ops ----------------

  function statusFor(
    consultantId: string,
    date: string,
    hour: number,
  ): Status {
    return slots.get(slotKey(consultantId, date, hour)) ?? "AVAILABLE";
  }

  function aggregateStatus(
    date: string,
    hour: number,
  ): "AVAILABLE" | "UNAVAILABLE" | "PARTIAL" {
    if (selectedConsultantIds.length === 0) return "AVAILABLE";
    let avail = 0;
    let unavail = 0;
    for (const id of selectedConsultantIds) {
      if (statusFor(id, date, hour) === "AVAILABLE") avail++;
      else unavail++;
    }
    if (avail > 0 && unavail > 0) return "PARTIAL";
    if (unavail > 0) return "UNAVAILABLE";
    return "AVAILABLE";
  }

  async function persistUpdates(
    updates: {
      consultantId: string;
      date: string;
      hour: number;
      status: Status;
    }[],
  ) {
    const prev = new Map(slots);
    setSlots((curr) => {
      const next = new Map(curr);
      for (const u of updates)
        next.set(slotKey(u.consultantId, u.date, u.hour), u.status);
      return next;
    });
    startTransition(async () => {
      try {
        const res = await fetch("/api/leads/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ updates }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `request failed (${res.status})`);
        }
      } catch (err) {
        setSlots(prev);
        setError((err as Error).message);
      }
    });
  }

  async function quickSet(
    hours: number[],
    status: Status,
  ) {
    if (!canEdit) {
      setError("You don't have permission to change availability.");
      return;
    }
    if (selectedConsultantIds.length === 0) {
      setError("Pick at least one consultant first.");
      return;
    }
    setError(null);
    const updates = selectedConsultantIds.flatMap((id) =>
      hours.map((h) => ({
        consultantId: id,
        date: selectedDay,
        hour: h,
        status,
      })),
    );
    await persistUpdates(updates);
  }

  async function refreshRange(newWeekStart: string) {
    setWeekStart(newWeekStart);
    setSelectedDay(newWeekStart);
    setError(null);
    const start = fromISODate(newWeekStart);
    const end = addDays(start, 6);
    try {
      const res = await fetch(
        `/api/leads/availability?from=${toISODate(start)}&to=${toISODate(end)}`,
      );
      if (!res.ok) throw new Error(`load failed (${res.status})`);
      const data: { slots: SlotRecord[] } = await res.json();
      setSlots(() => {
        const m = new Map<string, Status>();
        for (const s of data.slots) {
          m.set(slotKey(s.consultantId, s.date, s.hour), s.status);
        }
        return m;
      });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function toggleConsultant(id: string) {
    setSelectedConsultantIds((curr) =>
      curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id],
    );
  }

  // Stats
  const stats = useMemo(() => {
    const hoursWeek = HOURS.length;
    let totalCells = 0;
    let availableCells = 0;
    for (const c of consultants) {
      for (const d of weekDays) {
        const iso = toISODate(d);
        for (const h of HOURS) {
          totalCells++;
          if (statusFor(c.id, iso, h) === "AVAILABLE") availableCells++;
        }
      }
    }
    const pct = totalCells > 0 ? Math.round((availableCells / totalCells) * 100) : 0;
    return {
      coverage: pct,
      availableCells,
      totalHoursWeek: hoursWeek * 7 * consultants.length,
    };
  }, [consultants, weekDays, slots]);

  const isThisWeek = weekStart === todayWeekStartISO;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Leads · Operations"
        title="Team Availability"
        description="Set when each consultant can take appointments. Changes save automatically and sync with the Leads Schedule."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={!canEdit}
              onClick={() => quickSet(HOURS, "AVAILABLE")}
            >
              <Wand2 className="h-4 w-4" />
              Reset day to available
            </Button>
          </>
        }
      />

      <KpiRow>
        <Kpi
          label="Team coverage"
          value={`${stats.coverage}%`}
          hint="Available slots / total slots this week"
          icon={<CalendarRange className="h-4 w-4" />}
          tone={stats.coverage > 80 ? "success" : stats.coverage > 50 ? "warning" : "danger"}
        />
        <Kpi
          label="Consultants"
          value={consultants.length}
          hint={`${selectedConsultantIds.length} editing`}
          icon={<Users className="h-4 w-4" />}
          tone="primary"
        />
        <Kpi
          label="Available hours"
          value={stats.availableCells.toLocaleString()}
          hint={`of ${stats.totalHoursWeek.toLocaleString()} possible`}
          tone="default"
        />
        <Kpi
          label="Permission"
          value={canEdit ? "Manager" : "View only"}
          hint={canEdit ? "Can edit team availability" : "Read-only access"}
          tone={canEdit ? "primary" : "default"}
        />
      </KpiRow>

      <Section flush>
        <div className="px-5 py-4 border-b flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center rounded-md border bg-card">
              <button
                type="button"
                onClick={() =>
                  refreshRange(toISODate(addDays(fromISODate(weekStart), -7)))
                }
                className="h-9 w-9 inline-flex items-center justify-center hover:bg-accent border-r"
                aria-label="Previous week"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => refreshRange(todayWeekStartISO)}
                className={cn(
                  "h-9 px-3 text-sm font-medium hover:bg-accent border-r",
                  isThisWeek && "text-primary",
                )}
              >
                This week
              </button>
              <button
                type="button"
                onClick={() =>
                  refreshRange(toISODate(addDays(fromISODate(weekStart), 7)))
                }
                className="h-9 w-9 inline-flex items-center justify-center hover:bg-accent"
                aria-label="Next week"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="text-sm text-muted-foreground">
              Week of{" "}
              {fromISODate(weekStart).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </div>
          </div>
          {pending && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
            </span>
          )}
        </div>
        <div className="px-5 py-4 grid grid-cols-7 gap-2">
          {weekDays.map((d, i) => {
            const iso = toISODate(d);
            const active = iso === selectedDay;
            // Show how many "Available" slots that day across selected consultants
            const availInDay =
              selectedConsultantIds.length === 0
                ? 0
                : HOURS.reduce((acc, h) => {
                    let any = false;
                    for (const cid of selectedConsultantIds) {
                      if (statusFor(cid, iso, h) === "AVAILABLE") {
                        any = true;
                        break;
                      }
                    }
                    return acc + (any ? 1 : 0);
                  }, 0);
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setSelectedDay(iso)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  active
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/40",
                )}
              >
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  {DAY_LABELS[i]}
                </div>
                <div className="text-lg font-semibold tabular-nums">
                  {d.getDate()}
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {availInDay}/{HOURS.length} hrs
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      <Section
        title="Consultants"
        description="Select one or more consultants to edit their availability for the selected day. Multi-select edits apply to all."
      >
        {consultants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active consultants yet. Add users with the Sales Consultant role.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {consultants.map((c) => {
              const on = selectedConsultantIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleConsultant(c.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                    on
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted",
                  )}
                >
                  <ConsultantAvatar
                    name={consultantLabel(c)}
                    size="xs"
                    className={cn(on && "bg-white/20 text-primary-foreground")}
                  />
                  <span>{consultantLabel(c)}</span>
                  {c.region && (
                    <span className="text-xs opacity-70">· {c.region}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </Section>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <Section
        title={`Hourly availability — ${fromISODate(selectedDay).toLocaleDateString(
          "en-AU",
          { weekday: "long", day: "numeric", month: "long" },
        )}`}
        description="Click any cell to toggle. Use quick-set buttons to bulk-apply to selected consultants."
        actions={
          canEdit ? (
            <div className="flex flex-wrap items-center gap-1">
              <QuickBtn
                label="Morning"
                icon={<Sunrise className="h-3.5 w-3.5" />}
                onClick={() => quickSet([8, 9, 10, 11], "AVAILABLE")}
              />
              <QuickBtn
                label="Afternoon"
                icon={<Sun className="h-3.5 w-3.5" />}
                onClick={() => quickSet([12, 13, 14, 15, 16], "AVAILABLE")}
              />
              <QuickBtn
                label="Evening"
                icon={<Sunset className="h-3.5 w-3.5" />}
                onClick={() => quickSet([17, 18, 19], "AVAILABLE")}
              />
              <QuickBtn
                label="Holiday"
                tone="danger"
                icon={<TreePalm className="h-3.5 w-3.5" />}
                onClick={() => quickSet(HOURS, "UNAVAILABLE")}
              />
            </div>
          ) : null
        }
        flush
      >
        {selectedConsultantIds.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            Select one or more consultants to see availability.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground border-b w-24">
                    Hour
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground border-b w-28">
                    Aggregate
                  </th>
                  {selectedConsultantIds.map((id) => {
                    const c = consultants.find((x) => x.id === id);
                    return (
                      <th
                        key={id}
                        className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground border-b border-l"
                      >
                        <div className="flex items-center gap-1.5 normal-case font-medium text-foreground">
                          <ConsultantAvatar
                            name={c ? consultantLabel(c) : id}
                            size="xs"
                          />
                          <span>
                            {c
                              ? c.displayName?.split(" ")[0] ??
                                c.email.split("@")[0]
                              : id}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {HOURS.map((h) => {
                  const agg = aggregateStatus(selectedDay, h);
                  return (
                    <tr key={h} className="hover:bg-muted/20">
                      <td className="px-4 py-2 border-b text-xs text-muted-foreground tabular-nums">
                        {formatHourRange(h)}
                      </td>
                      <td className="px-4 py-2 border-b">
                        <AggBadge status={agg} />
                      </td>
                      {selectedConsultantIds.map((id) => {
                        const s = statusFor(id, selectedDay, h);
                        return (
                          <td
                            key={id}
                            className="px-2 py-1.5 border-b border-l"
                          >
                            <button
                              type="button"
                              disabled={!canEdit}
                              onClick={() =>
                                persistUpdates([
                                  {
                                    consultantId: id,
                                    date: selectedDay,
                                    hour: h,
                                    status:
                                      s === "AVAILABLE"
                                        ? "UNAVAILABLE"
                                        : "AVAILABLE",
                                  },
                                ])
                              }
                              className={cn(
                                "h-8 w-full rounded-md text-xs font-medium border transition-colors",
                                s === "AVAILABLE"
                                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
                                  : "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300 hover:bg-red-500/20",
                                !canEdit && "cursor-not-allowed opacity-60",
                              )}
                              title={
                                canEdit
                                  ? "Click to toggle"
                                  : "View only — requires leads.availability.manage"
                              }
                            >
                              {s === "AVAILABLE" ? "Available" : "Off"}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <p className="text-xs text-muted-foreground">
        Changes save automatically and sync with Leads Schedule — unavailable
        consultants cannot be booked into those slots.
      </p>
    </div>
  );
}

function QuickBtn({
  label,
  icon,
  onClick,
  tone = "primary",
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  tone?: "primary" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium border transition-colors",
        tone === "primary"
          ? "border-primary/40 text-primary hover:bg-primary/10"
          : "border-destructive/40 text-destructive hover:bg-destructive/10",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function AggBadge({
  status,
}: {
  status: "AVAILABLE" | "UNAVAILABLE" | "PARTIAL";
}) {
  if (status === "AVAILABLE")
    return (
      <StatusBadge tone="success" variant="soft" dot>
        All available
      </StatusBadge>
    );
  if (status === "UNAVAILABLE")
    return (
      <StatusBadge tone="danger" variant="soft" dot>
        All off
      </StatusBadge>
    );
  return (
    <StatusBadge tone="warning" variant="soft" dot>
      Partial
    </StatusBadge>
  );
}
