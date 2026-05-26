"use client";

import * as React from "react";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Phone,
  RefreshCw,
  CalendarDays,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CONSULTANTS,
  MOCK_APPOINTMENTS,
  WORK_HOURS,
  type AppointmentLead,
  type SlotStatus,
} from "@/lib/leads/mock";
import { cn } from "@/lib/utils";
import {
  ConsultantAvatar,
  Kpi,
  KpiRow,
  PageHeader,
  Section,
  SearchInput,
  StatusBadge,
  SubTabs,
  Toolbar,
  type BadgeTone,
} from "./shared";

const STATUS_TONE: Record<SlotStatus, BadgeTone> = {
  open: "neutral",
  booked: "info",
  tentative: "warning",
  confirmed: "success",
  unavailable: "neutral",
  holiday: "neutral",
  completed: "purple",
  cancelled: "danger",
};

const STATUS_LABEL: Record<SlotStatus, string> = {
  open: "Open",
  booked: "Booked",
  tentative: "Tentative",
  confirmed: "Confirmed",
  unavailable: "Unavailable",
  holiday: "Holiday",
  completed: "Completed",
  cancelled: "Cancelled",
};

function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const day = out.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  out.setDate(out.getDate() + offset);
  return out;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatHour(h: number): string {
  const period = h >= 12 ? "PM" : "AM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}${period}`;
}

function formatHourSlot(h: number): string {
  return `${formatHour(h)} – ${formatHour(h + 1)}`;
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString("en-AU", { weekday: "short" });
}

function dayDateLabel(d: Date): string {
  return d.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function LeadsScheduleTab() {
  const [view, setView] = React.useState<"week" | "day">("week");
  const [weekStart, setWeekStart] = React.useState<Date>(() =>
    startOfWeek(new Date()),
  );
  const [activeDate, setActiveDate] = React.useState<Date>(() => new Date());
  const [filterRegion, setFilterRegion] = React.useState<
    "ALL" | "TAS" | "ACT" | "VIC" | "NSW"
  >("ALL");
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<AppointmentLead | null>(null);

  const days = React.useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const consultants = React.useMemo(
    () =>
      CONSULTANTS.filter(
        (c) => filterRegion === "ALL" || c.region === filterRegion,
      ),
    [filterRegion],
  );

  const appointments = React.useMemo(() => {
    const range = days.map(toISODate);
    return MOCK_APPOINTMENTS.filter((a) => range.includes(a.date)).filter(
      (a) => {
        if (filterRegion !== "ALL") {
          const c = CONSULTANTS.find((c) => c.id === a.consultantId);
          if (!c || c.region !== filterRegion) return false;
        }
        if (search.trim()) {
          const q = search.toLowerCase();
          return (
            a.customer.toLowerCase().includes(q) ||
            a.phone.includes(q) ||
            a.suburb.toLowerCase().includes(q)
          );
        }
        return true;
      },
    );
  }, [days, filterRegion, search]);

  // KPIs (computed from this week's visible data)
  const kpiStats = React.useMemo(() => {
    const total = appointments.length;
    const confirmed = appointments.filter(
      (a) => a.status === "confirmed",
    ).length;
    const booked = appointments.filter((a) => a.status === "booked").length;
    const tentative = appointments.filter(
      (a) => a.status === "tentative",
    ).length;
    const cancelled = appointments.filter(
      (a) => a.status === "cancelled",
    ).length;
    const completed = appointments.filter(
      (a) => a.status === "completed",
    ).length;

    // Total possible slots this week = consultants × workdays × workhours (excluding lunch)
    const capacity =
      consultants.length *
      7 *
      WORK_HOURS.filter((h) => h !== 12).length;
    const utilisation = capacity > 0 ? Math.round((total / capacity) * 100) : 0;
    return {
      total,
      confirmed,
      booked,
      tentative,
      cancelled,
      completed,
      utilisation,
    };
  }, [appointments, consultants.length]);

  function lookupAppt(consultantId: string, date: string, hour: number) {
    return appointments.find(
      (a) =>
        a.consultantId === consultantId && a.date === date && a.hour === hour,
    );
  }

  const today = new Date();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Leads"
        title="Schedule"
        description="Manage consultant appointments across the team. Click any slot to view, book, or reschedule."
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button size="sm" className="gap-2">
              <CalendarPlus className="h-4 w-4" />
              Book Appointment
            </Button>
          </>
        }
      />

      <KpiRow>
        <Kpi
          label="This week"
          value={kpiStats.total}
          hint={`${kpiStats.confirmed} confirmed · ${kpiStats.booked} booked`}
          icon={<CalendarDays className="h-4 w-4" />}
          tone="primary"
          delta={{ value: "+12%", direction: "up" }}
        />
        <Kpi
          label="Confirmed"
          value={kpiStats.confirmed}
          hint="Customer confirmed in last 24h"
          icon={<Sparkles className="h-4 w-4" />}
          tone="success"
        />
        <Kpi
          label="Capacity used"
          value={`${kpiStats.utilisation}%`}
          hint={`${consultants.length} consultants on this filter`}
          icon={<UsersRound className="h-4 w-4" />}
          tone="default"
        />
        <Kpi
          label="Tentative"
          value={kpiStats.tentative}
          hint="Needs customer confirmation"
          icon={<Clock className="h-4 w-4" />}
          tone="warning"
        />
      </KpiRow>

      <Toolbar
        left={
          <>
            <SubTabs
              tabs={[
                { key: "week", label: "Week" },
                { key: "day", label: "Day" },
              ]}
              value={view}
              onChange={(v) => setView(v as "week" | "day")}
            />
            <div className="inline-flex items-center rounded-md border bg-card">
              <button
                type="button"
                onClick={() => setWeekStart(addDays(weekStart, -7))}
                className="h-9 w-9 inline-flex items-center justify-center hover:bg-accent border-r"
                aria-label="Previous week"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setWeekStart(startOfWeek(new Date()));
                  setActiveDate(new Date());
                }}
                className="h-9 px-3 text-sm font-medium hover:bg-accent border-r"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setWeekStart(addDays(weekStart, 7))}
                className="h-9 w-9 inline-flex items-center justify-center hover:bg-accent"
                aria-label="Next week"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="text-sm text-muted-foreground">
              {weekStart.toLocaleDateString("en-AU", {
                day: "numeric",
                month: "short",
              })}{" "}
              –{" "}
              {addDays(weekStart, 6).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </div>
          </>
        }
        right={
          <>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search customer, phone, suburb…"
              className="w-72"
            />
            <select
              value={filterRegion}
              onChange={(e) =>
                setFilterRegion(
                  e.target.value as "ALL" | "TAS" | "ACT" | "VIC" | "NSW",
                )
              }
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="ALL">All regions</option>
              <option value="TAS">TAS</option>
              <option value="ACT">ACT</option>
              <option value="VIC">VIC</option>
              <option value="NSW">NSW</option>
            </select>
          </>
        }
      />

      {view === "week" ? (
        <Section flush>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-separate border-spacing-0 min-w-[900px]">
              <thead>
                <tr className="bg-muted/40">
                  <th className="sticky left-0 z-20 bg-muted/40 backdrop-blur px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground border-b w-[200px]">
                    Consultant
                  </th>
                  {days.map((d) => {
                    const isToday = isSameDay(d, today);
                    const iso = toISODate(d);
                    const dayCount = appointments.filter(
                      (a) => a.date === iso,
                    ).length;
                    return (
                      <th
                        key={iso}
                        className={cn(
                          "px-3 py-3 border-b border-l text-xs font-medium",
                          isToday && "bg-primary/5",
                        )}
                      >
                        <div className="flex flex-col items-center gap-0.5">
                          <span
                            className={cn(
                              "uppercase tracking-wider",
                              isToday
                                ? "text-primary"
                                : "text-muted-foreground",
                            )}
                          >
                            {dayLabel(d)}
                          </span>
                          <span
                            className={cn(
                              "text-base font-semibold tabular-nums",
                              isToday && "text-primary",
                            )}
                          >
                            {d.getDate()}
                          </span>
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {dayCount} appt
                          </span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {consultants.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/20">
                    <td className="sticky left-0 z-10 bg-card backdrop-blur px-4 py-3 border-b border-r">
                      <div className="flex items-center gap-2.5">
                        <ConsultantAvatar name={c.name} size="sm" />
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">
                            {c.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {c.region}
                          </div>
                        </div>
                      </div>
                    </td>
                    {days.map((d) => {
                      const iso = toISODate(d);
                      const dayAppts = appointments
                        .filter(
                          (a) => a.consultantId === c.id && a.date === iso,
                        )
                        .sort((a, b) => a.hour - b.hour);
                      return (
                        <td
                          key={iso}
                          className="px-2 py-2 border-b border-l align-top h-20 min-w-[110px]"
                        >
                          <div className="space-y-1">
                            {dayAppts.length === 0 ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveDate(d);
                                  setView("day");
                                }}
                                className="w-full h-14 rounded-md border border-dashed border-border/60 text-xs text-muted-foreground hover:bg-muted/40 hover:border-primary/40 hover:text-foreground"
                              >
                                +
                              </button>
                            ) : (
                              dayAppts.slice(0, 3).map((a) => (
                                <button
                                  type="button"
                                  key={a.id}
                                  onClick={() => setSelected(a)}
                                  className={cn(
                                    "block w-full text-left rounded-md border px-2 py-1 text-xs hover:bg-accent",
                                    a.status === "confirmed" &&
                                      "bg-emerald-500/5 border-emerald-500/30",
                                    a.status === "booked" &&
                                      "bg-sky-500/5 border-sky-500/30",
                                    a.status === "tentative" &&
                                      "bg-amber-500/5 border-amber-500/30",
                                    a.status === "completed" &&
                                      "bg-violet-500/5 border-violet-500/30",
                                    a.status === "cancelled" &&
                                      "bg-red-500/5 border-red-500/30 line-through opacity-70",
                                  )}
                                >
                                  <div className="font-medium truncate">
                                    {a.customer}
                                  </div>
                                  <div className="text-muted-foreground text-[10px] tabular-nums">
                                    {formatHour(a.hour)} · {a.suburb}
                                  </div>
                                </button>
                              ))
                            )}
                            {dayAppts.length > 3 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveDate(d);
                                  setView("day");
                                }}
                                className="text-[10px] text-primary hover:underline w-full text-left px-1"
                              >
                                + {dayAppts.length - 3} more
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : (
        <DayView
          date={activeDate}
          weekStart={weekStart}
          days={days}
          consultants={consultants}
          appointments={appointments}
          onDateChange={setActiveDate}
          onLookup={lookupAppt}
          onSelect={(a) => setSelected(a)}
        />
      )}

      {selected && (
        <AppointmentDrawer
          appointment={selected}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>Status:</span>
        {(
          [
            "confirmed",
            "booked",
            "tentative",
            "completed",
            "cancelled",
          ] as SlotStatus[]
        ).map((s) => (
          <StatusBadge key={s} tone={STATUS_TONE[s]} dot variant="soft">
            {STATUS_LABEL[s]}
          </StatusBadge>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day View — focused single-date timeline across consultants
// ---------------------------------------------------------------------------

function DayView({
  date,
  weekStart,
  days,
  consultants,
  appointments,
  onDateChange,
  onLookup,
  onSelect,
}: {
  date: Date;
  weekStart: Date;
  days: Date[];
  consultants: Array<(typeof CONSULTANTS)[number]>;
  appointments: AppointmentLead[];
  onDateChange: (d: Date) => void;
  onLookup: (
    consultantId: string,
    date: string,
    hour: number,
  ) => AppointmentLead | undefined;
  onSelect: (a: AppointmentLead) => void;
}) {
  const iso = toISODate(date);
  const dayAppts = appointments.filter((a) => a.date === iso);
  return (
    <Section
      title={dayDateLabel(date)}
      description={`${dayAppts.length} appointments scheduled · ${consultants.length} consultants`}
      actions={
        <div className="flex items-center gap-1">
          {days.map((d) => {
            const active = isSameDay(d, date);
            return (
              <button
                key={toISODate(d)}
                type="button"
                onClick={() => onDateChange(d)}
                className={cn(
                  "h-9 w-9 rounded-md text-xs font-medium flex flex-col items-center justify-center",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent text-muted-foreground",
                )}
              >
                <span className="text-[9px] uppercase">{dayLabel(d)}</span>
                <span className="tabular-nums">{d.getDate()}</span>
              </button>
            );
          })}
        </div>
      }
      flush
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr className="bg-muted/40">
              <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground border-b w-[80px]">
                Time
              </th>
              {consultants.map((c) => (
                <th
                  key={c.id}
                  className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground border-b border-l min-w-[160px]"
                >
                  <div className="flex items-center gap-2">
                    <ConsultantAvatar name={c.name} size="xs" />
                    <span className="normal-case font-medium text-foreground">
                      {c.name.split(" ")[0]}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WORK_HOURS.filter((h) => h !== 12).map((h) => (
              <tr key={h}>
                <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums border-b align-top">
                  {formatHour(h)}
                </td>
                {consultants.map((c) => {
                  const a = onLookup(c.id, iso, h);
                  if (!a) {
                    return (
                      <td
                        key={c.id}
                        className="px-1.5 py-1.5 border-b border-l align-top h-14"
                      >
                        <div className="h-full w-full rounded-md border border-dashed border-border/40 hover:border-primary/40 hover:bg-muted/40 cursor-pointer" />
                      </td>
                    );
                  }
                  return (
                    <td
                      key={c.id}
                      className="px-1.5 py-1.5 border-b border-l align-top h-14"
                    >
                      <button
                        type="button"
                        onClick={() => onSelect(a)}
                        className={cn(
                          "h-full w-full rounded-md border text-left px-2 py-1 transition-colors",
                          a.status === "confirmed" &&
                            "bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20",
                          a.status === "booked" &&
                            "bg-sky-500/10 border-sky-500/30 hover:bg-sky-500/20",
                          a.status === "tentative" &&
                            "bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20",
                          a.status === "completed" &&
                            "bg-violet-500/10 border-violet-500/30 hover:bg-violet-500/20",
                          a.status === "cancelled" &&
                            "bg-red-500/10 border-red-500/30 hover:bg-red-500/20 line-through opacity-70",
                        )}
                      >
                        <div className="font-medium text-xs truncate">
                          {a.customer}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {a.suburb}
                        </div>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-3 text-xs text-muted-foreground border-t bg-muted/20">
        Empty slots are bookable. Click a slot to view appointment details or
        reschedule.{" "}
        <span className="opacity-60">
          (Week of{" "}
          {weekStart.toLocaleDateString("en-AU", {
            day: "numeric",
            month: "short",
          })}
          )
        </span>
      </p>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Appointment side-drawer
// ---------------------------------------------------------------------------

function AppointmentDrawer({
  appointment,
  onClose,
}: {
  appointment: AppointmentLead;
  onClose: () => void;
}) {
  const consultant = CONSULTANTS.find((c) => c.id === appointment.consultantId);
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex justify-end"
      onClick={onClose}
    >
      <aside
        className="h-full w-full max-w-md bg-card border-l shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b">
          <div className="flex items-center justify-between mb-4">
            <StatusBadge
              tone={STATUS_TONE[appointment.status]}
              variant="soft"
              dot
            >
              {STATUS_LABEL[appointment.status]}
            </StatusBadge>
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-md hover:bg-accent inline-flex items-center justify-center text-muted-foreground"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <h3 className="text-xl font-semibold tracking-tight">
            {appointment.customer}
          </h3>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            {appointment.suburb} {appointment.postcode}
          </p>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Field label="Date">
              {new Date(appointment.date).toLocaleDateString("en-AU", {
                weekday: "short",
                day: "numeric",
                month: "long",
              })}
            </Field>
            <Field label="Time">{formatHourSlot(appointment.hour)}</Field>
            <Field label="Phone">
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                {appointment.phone}
              </span>
            </Field>
            <Field label="Source">{appointment.source}</Field>
            <Field label="Company">
              <StatusBadge
                tone={appointment.company === "astra" ? "primary" : "purple"}
              >
                {appointment.company === "astra" ? "Astra Solar" : "DC Solar"}
              </StatusBadge>
            </Field>
            <Field label="Consultant">
              {consultant ? (
                <span className="inline-flex items-center gap-1.5">
                  <ConsultantAvatar name={consultant.name} size="xs" />
                  {consultant.name}
                </span>
              ) : (
                "—"
              )}
            </Field>
          </div>
          {appointment.notes && (
            <div>
              <FieldLabel>Notes</FieldLabel>
              <p className="text-sm mt-1 rounded-md bg-muted/40 p-3 border">
                {appointment.notes}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2 border-t">
            <Button className="w-full">Confirm with customer</Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline">Reschedule</Button>
              <Button variant="outline">Send SMS</Button>
            </div>
            <Button variant="ghost" className="text-destructive">
              Cancel appointment
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}
