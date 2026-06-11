"use client";

import * as React from "react";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Pencil,
  CalendarClock,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ConsultantAvatar,
  Kpi,
  KpiRow,
  PageHeader,
  Section,
  SearchInput,
  StatusBadge,
  Toolbar,
  type BadgeTone,
} from "./shared";
import {
  DataTable,
  DragTH,
  TR,
  applyRowOrder,
} from "@/components/leads/shared/data-table";
import {
  buildTimeSlots,
  DISPOSITIONS,
  DISPOSITION_LABEL,
  type TimeSlot,
  type ScheduleConsultant,
  type ScheduleAppointment,
} from "@/lib/leads/schedule-types";

// Re-export so existing imports from this module keep working.
export type { ScheduleConsultant, ScheduleAppointment };

// ---------------------------------------------------------------------------
// Disposition tone lookup (matches legacy .disp-select modifier colours)
// ---------------------------------------------------------------------------

const DISP_TONE: Record<string, BadgeTone> = Object.fromEntries(
  DISPOSITIONS.map((d) => [d.value, d.tone]),
);

// ---------------------------------------------------------------------------
// Date helpers (local time)
// ---------------------------------------------------------------------------

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

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayShort(d: Date): string {
  return d.toLocaleDateString("en-AU", { weekday: "short" });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface LeadsScheduleClientProps {
  consultants: ScheduleConsultant[];
  appointments: ScheduleAppointment[];
}

const REGIONS = ["ALL", "TAS", "ACT", "VIC", "NSW"] as const;
type Region = (typeof REGIONS)[number];

export function LeadsScheduleClient({
  consultants: allConsultants,
  appointments: allAppointments,
}: LeadsScheduleClientProps) {
  const slots = React.useMemo(() => buildTimeSlots(), []);

  const [weekStart, setWeekStart] = React.useState<Date>(() =>
    startOfWeek(new Date()),
  );
  const [activeDate, setActiveDate] = React.useState<Date>(() => new Date());
  const [region, setRegion] = React.useState<Region>("ALL");
  const [search, setSearch] = React.useState("");
  const [availableOnly, setAvailableOnly] = React.useState(false);

  const days = React.useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const consultants = React.useMemo(
    () =>
      allConsultants.filter((c) => region === "ALL" || c.region === region),
    [allConsultants, region],
  );

  // Index appointments by (consultant, date, slotKey)
  const apptIndex = React.useMemo(() => {
    const m = new Map<string, ScheduleAppointment>();
    for (const a of allAppointments) {
      m.set(`${a.consultantId}|${a.date}|${a.slotKey}`, a);
    }
    return m;
  }, [allAppointments]);

  const activeIso = toISODate(activeDate);

  // Filter for search bar
  const matchesSearch = React.useCallback(
    (a: ScheduleAppointment) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        a.customer.toLowerCase().includes(q) ||
        (a.phone ?? "").toLowerCase().includes(q) ||
        (a.email ?? "").toLowerCase().includes(q) ||
        (a.suburb ?? "").toLowerCase().includes(q) ||
        (a.postcode ?? "").toLowerCase().includes(q)
      );
    },
    [search],
  );

  // KPI stats for the visible week
  const kpiStats = React.useMemo(() => {
    const range = new Set(days.map(toISODate));
    const visible = allAppointments.filter((a) => range.has(a.date));
    const total = visible.length;
    const sold = visible.filter((a) => a.disposition === "sold").length;
    const callback = visible.filter((a) => a.disposition === "callback").length;
    const noAnswer = visible.filter((a) => a.disposition === "no_answer").length;
    const capacity = consultants.length * 7 * slots.length;
    const utilisation =
      capacity > 0 ? Math.round((total / capacity) * 100) : 0;
    return { total, sold, callback, noAnswer, utilisation };
  }, [allAppointments, days, consultants.length, slots.length]);

  const today = new Date();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Leads"
        title="Schedule"
        description="Per-consultant time slots across the working day. Click an empty slot to enter a lead, or a filled row to edit, reschedule or delete."
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
          hint="Total bookings"
          tone="primary"
        />
        <Kpi
          label="Sold"
          value={kpiStats.sold}
          hint="Disposition = Sold"
          tone="success"
        />
        <Kpi
          label="Call backs"
          value={kpiStats.callback}
          hint="Awaiting follow-up"
          tone="warning"
        />
        <Kpi
          label="Capacity used"
          value={`${kpiStats.utilisation}%`}
          hint={`${consultants.length} consultants · ${slots.length} slots/day`}
        />
      </KpiRow>

      <Toolbar
        left={
          <>
            <div className="inline-flex items-center rounded-md border bg-card">
              <button
                type="button"
                onClick={() => {
                  setWeekStart(addDays(weekStart, -7));
                  setActiveDate(addDays(activeDate, -7));
                }}
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
                onClick={() => {
                  setWeekStart(addDays(weekStart, 7));
                  setActiveDate(addDays(activeDate, 7));
                }}
                className="h-9 w-9 inline-flex items-center justify-center hover:bg-accent"
                aria-label="Next week"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="inline-flex items-center gap-1 rounded-md border bg-card p-1">
              {days.map((d) => {
                const active = isSameDay(d, activeDate);
                const iso = toISODate(d);
                const count = allAppointments.filter(
                  (a) =>
                    a.date === iso &&
                    (region === "ALL" ||
                      consultants.some((c) => c.id === a.consultantId)),
                ).length;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => setActiveDate(d)}
                    className={cn(
                      "h-9 px-3 rounded text-xs font-medium flex flex-col items-center justify-center",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent text-muted-foreground",
                    )}
                  >
                    <span className="text-[10px] uppercase tracking-wider">
                      {dayShort(d)}
                    </span>
                    <span className="tabular-nums text-[11px]">
                      {d.getDate()}
                      <span className="ml-1 opacity-70">· {count}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        }
        right={
          <>
            <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={availableOnly}
                onChange={(e) => setAvailableOnly(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              Available slots only
            </label>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search name, phone, email, suburb…"
              className="w-64"
            />
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value as Region)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r === "ALL" ? "All regions" : r}
                </option>
              ))}
            </select>
          </>
        }
      />

      {consultants.length === 0 ? (
        <Section>
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">
            No consultants found
            {region !== "ALL" ? ` in ${region}` : ""}. Ask an admin to grant the{" "}
            <code className="mx-1 px-1 py-0.5 rounded bg-muted text-foreground">
              sales_consultant
            </code>{" "}
            role to users in the database.
          </div>
        </Section>
      ) : (
        <div className="space-y-6">
          {consultants.map((c) => (
            <ConsultantScheduleTable
              key={c.id}
              consultant={c}
              date={activeIso}
              slots={slots}
              apptIndex={apptIndex}
              matchesSearch={matchesSearch}
              availableOnly={availableOnly}
            />
          ))}
        </div>
      )}

      {/* Legend (mirrors legacy disposition pill colours) */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>Disposition:</span>
        {DISPOSITIONS.map((d) => (
          <StatusBadge key={d.value} tone={d.tone} dot variant="soft">
            {d.label}
          </StatusBadge>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-consultant table
// ---------------------------------------------------------------------------

function ConsultantScheduleTable({
  consultant,
  date,
  slots,
  apptIndex,
  matchesSearch,
  availableOnly,
}: {
  consultant: ScheduleConsultant;
  date: string;
  slots: TimeSlot[];
  apptIndex: Map<string, ScheduleAppointment>;
  matchesSearch: (a: ScheduleAppointment) => boolean;
  availableOnly: boolean;
}) {
  // Session-only display order of time slots (keyed by slot.key).
  const [rowOrder, setRowOrder] = React.useState<string[] | null>(null);

  // Build the visible row list. Each slot is either an appointment or empty.
  const baseRows = slots
    .map((s, i) => {
      const appt = apptIndex.get(
        `${consultant.id}|${date}|${s.key}`,
      );
      return { idx: i + 1, slot: s, appt: appt ?? null };
    })
    .filter((r) => {
      if (availableOnly) return !r.appt;
      if (r.appt) return matchesSearch(r.appt);
      return true;
    });

  const rows = rowOrder
    ? applyRowOrder(baseRows, rowOrder, (r) => r.slot.key)
    : baseRows;

  const filledCount = rows.filter((r) => r.appt).length;
  const openCount = rows.length - filledCount;

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-5 py-3 border-b">
        <div className="flex items-center gap-2.5 min-w-0">
          <ConsultantAvatar name={consultant.name} size="sm" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold truncate">{consultant.name}</h3>
            <p className="text-xs text-muted-foreground">
              {consultant.region ?? "—"} · {filledCount} booked · {openCount} open
            </p>
          </div>
        </div>
      </div>
      <DataTable
        className="text-xs min-w-[1280px]"
        sortable={{
          ids: rows.map((r) => r.slot.key),
          onReorder: setRowOrder,
        }}
      >
          <thead>
            <tr className="bg-muted/40">
              <DragTH />
              <Th className="w-10 text-center">#</Th>
              <Th className="w-28">Time</Th>
              <Th className="w-32">Lead Gen</Th>
              <Th className="w-40">Disposition</Th>
              <Th className="w-28">First Name</Th>
              <Th className="w-28">Surname</Th>
              <Th className="w-32">Phone</Th>
              <Th className="w-40">Email</Th>
              <Th className="w-40">Address</Th>
              <Th className="w-20">Postcode</Th>
              <Th className="w-24">State</Th>
              <Th className="w-16">Bills</Th>
              <Th className="w-24">Source</Th>
              <Th className="w-24">Company</Th>
              <Th className="w-40">Notes</Th>
              <Th className="w-28 text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={17}
                  className="px-4 py-10 text-center text-muted-foreground border-b"
                >
                  {availableOnly
                    ? "No open slots match the current filter."
                    : "No matching leads on this day."}
                </td>
              </tr>
            ) : (
              rows.map((r) =>
                r.appt ? (
                  <FilledRow key={r.slot.key} idx={r.idx} slot={r.slot} appt={r.appt} />
                ) : (
                  <EmptyRow key={r.slot.key} idx={r.idx} slot={r.slot} />
                ),
              )
            )}
          </tbody>
      </DataTable>
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
  colSpan,
}: {
  children: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn("px-2 py-2 align-middle border-b border-border/60", className)}
    >
      {children}
    </td>
  );
}

function FilledRow({
  idx,
  slot,
  appt,
}: {
  idx: number;
  slot: TimeSlot;
  appt: ScheduleAppointment;
}) {
  const tone: BadgeTone = appt.disposition
    ? DISP_TONE[appt.disposition] ?? "neutral"
    : "neutral";
  const dispLabel = appt.disposition
    ? DISPOSITION_LABEL[appt.disposition] ?? appt.disposition
    : "—";
  return (
    <TR
      sortableId={slot.key}
      className={cn(
        "hover:bg-muted/30",
        appt.cancelPending && "opacity-60",
        appt.isAdditional && "bg-amber-500/5",
      )}
    >
      <Td className="text-center tabular-nums text-muted-foreground">{idx}</Td>
      <Td className="tabular-nums font-medium">{slot.label}</Td>
      <Td className="truncate">
        {appt.bookedByName ? (
          <span className="text-foreground">{appt.bookedByName}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </Td>
      <Td>
        <StatusBadge tone={tone} variant="soft" dot>
          {dispLabel}
        </StatusBadge>
      </Td>
      <Td className="truncate">{appt.firstName ?? "—"}</Td>
      <Td className="truncate">{appt.lastName ?? "—"}</Td>
      <Td className="truncate tabular-nums">{appt.phone ?? "—"}</Td>
      <Td className="truncate text-muted-foreground">{appt.email ?? "—"}</Td>
      <Td className="truncate text-muted-foreground">
        {[appt.address, appt.suburb].filter(Boolean).join(", ") || "—"}
      </Td>
      <Td className="tabular-nums">{appt.postcode ?? "—"}</Td>
      <Td className="truncate">{appt.state ?? "—"}</Td>
      <Td className="truncate text-muted-foreground">{appt.bills ?? "—"}</Td>
      <Td className="truncate">{appt.source ?? "—"}</Td>
      <Td className="truncate">{appt.company ?? "—"}</Td>
      <Td className="truncate text-muted-foreground max-w-[12rem]">
        {appt.notes ?? "—"}
      </Td>
      <Td className="text-right">
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Edit lead"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Reschedule"
          >
            <CalendarClock className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </Td>
    </TR>
  );
}

function EmptyRow({ idx, slot }: { idx: number; slot: TimeSlot }) {
  return (
    <TR sortableId={slot.key} className="hover:bg-muted/20">
      <Td className="text-center tabular-nums text-muted-foreground">{idx}</Td>
      <Td className="tabular-nums text-muted-foreground">{slot.label}</Td>
      <Td colSpan={13}>
        <button
          type="button"
          className="w-full h-7 rounded border border-dashed border-border/60 text-xs text-muted-foreground hover:bg-muted/40 hover:border-primary/40 hover:text-foreground"
        >
          + Enter Lead
        </button>
      </Td>
      <Td className="text-right">
        <span className="text-[10px] text-muted-foreground">Open</span>
      </Td>
    </TR>
  );
}
