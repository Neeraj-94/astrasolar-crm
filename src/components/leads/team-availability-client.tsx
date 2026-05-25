"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertCircle, Calendar, ChevronDown, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Mirror of the lib constants. We don't import from server-only files in a
// client component, so these are duplicated intentionally.
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
  date: string; // YYYY-MM-DD
  hour: number;
  status: Status;
  note: string | null;
}

interface Props {
  consultants: Consultant[];
  initialSlots: SlotRecord[];
  initialWeekStart: string; // YYYY-MM-DD
  canEdit: boolean;
}

// ---------------------------------------------------------------------------
// Local date helpers (cannot import server-only lib in a client component).
// ---------------------------------------------------------------------------

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

function formatDayHeading(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function slotKey(consultantId: string, date: string, hour: number): string {
  return `${consultantId}|${date}|${hour}`;
}

function consultantLabel(c: Consultant): string {
  return c.displayName || c.email;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

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
  const nextWeekStartISO = useMemo(() => {
    return toISODate(addDays(fromISODate(todayWeekStartISO), 7));
  }, [todayWeekStartISO]);

  // ---------------- Data ops ----------------

  function statusFor(
    consultantId: string,
    date: string,
    hour: number,
  ): Status {
    return slots.get(slotKey(consultantId, date, hour)) ?? "AVAILABLE";
  }

  /** Aggregate status across all selected consultants for a (date, hour). */
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

  async function applyToggle(hour: number) {
    if (!canEdit) {
      setError("You don't have permission to change availability.");
      return;
    }
    if (selectedConsultantIds.length === 0) {
      setError("Pick at least one consultant first.");
      return;
    }
    setError(null);

    const agg = aggregateStatus(selectedDay, hour);
    // If everyone is already unavailable, flip to available. Otherwise mark
    // everyone unavailable.
    const newStatus: Status = agg === "UNAVAILABLE" ? "AVAILABLE" : "UNAVAILABLE";

    const updates = selectedConsultantIds.map((id) => ({
      consultantId: id,
      date: selectedDay,
      hour,
      status: newStatus,
    }));

    // Optimistic update.
    const prev = new Map(slots);
    setSlots((curr) => {
      const next = new Map(curr);
      for (const u of updates) next.set(slotKey(u.consultantId, u.date, u.hour), u.status);
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

  // ---------------- Render ----------------

  return (
    <div className="space-y-6">
      {/* Week tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={weekStart === todayWeekStartISO ? "default" : "outline"}
          size="sm"
          onClick={() => refreshRange(todayWeekStartISO)}
        >
          This week
        </Button>
        <Button
          variant={weekStart === nextWeekStartISO ? "default" : "outline"}
          size="sm"
          onClick={() => refreshRange(nextWeekStartISO)}
        >
          Next week
        </Button>
        {pending && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Consultant picker */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            Consultants
            <span className="text-xs font-normal text-muted-foreground">
              {selectedConsultantIds.length} selected
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
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
                      "rounded-full border px-3 py-1 text-sm transition",
                      on
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted",
                    )}
                  >
                    {consultantLabel(c)}
                    {c.region && (
                      <span className="ml-1.5 text-xs opacity-70">
                        · {c.region}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Day picker */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Day
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
            {weekDays.map((d, i) => {
              const iso = toISODate(d);
              const on = iso === selectedDay;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setSelectedDay(iso)}
                  className={cn(
                    "rounded-md border px-3 py-2 text-left text-sm transition",
                    on
                      ? "border-primary bg-primary/10"
                      : "hover:bg-muted",
                  )}
                >
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    {DAY_LABELS[i]}
                  </div>
                  <div className="font-medium">{formatDayHeading(d)}</div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Hour grid */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">
            Hourly availability —{" "}
            {fromISODate(selectedDay).toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </CardTitle>
          <Legend />
        </CardHeader>
        <CardContent>
          {selectedConsultantIds.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Select one or more consultants to see availability.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left text-xs uppercase tracking-wider text-muted-foreground py-2 w-24">
                      Hour
                    </th>
                    <th className="text-left text-xs uppercase tracking-wider text-muted-foreground py-2 w-28">
                      Status
                    </th>
                    {selectedConsultantIds.map((id) => {
                      const c = consultants.find((x) => x.id === id);
                      return (
                        <th
                          key={id}
                          className="text-left text-xs uppercase tracking-wider text-muted-foreground py-2 px-2"
                        >
                          {c ? consultantLabel(c) : id}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {HOURS.map((h) => {
                    const agg = aggregateStatus(selectedDay, h);
                    return (
                      <tr key={h} className="border-t">
                        <td className="py-2 align-middle text-muted-foreground tabular-nums">
                          {formatHourRange(h)}
                        </td>
                        <td className="py-2 align-middle">
                          <StatusPill status={agg} />
                        </td>
                        {selectedConsultantIds.map((id) => {
                          const s = statusFor(id, selectedDay, h);
                          return (
                            <td key={id} className="py-1.5 px-2 align-middle">
                              <button
                                type="button"
                                disabled={!canEdit}
                                onClick={() => {
                                  // Single-consultant toggle is just a 1-element batch.
                                  const prev = new Map(slots);
                                  const newStatus: Status =
                                    s === "AVAILABLE" ? "UNAVAILABLE" : "AVAILABLE";
                                  setSlots((curr) => {
                                    const next = new Map(curr);
                                    next.set(slotKey(id, selectedDay, h), newStatus);
                                    return next;
                                  });
                                  startTransition(async () => {
                                    try {
                                      const res = await fetch(
                                        "/api/leads/availability",
                                        {
                                          method: "POST",
                                          headers: {
                                            "Content-Type": "application/json",
                                          },
                                          body: JSON.stringify({
                                            updates: [
                                              {
                                                consultantId: id,
                                                date: selectedDay,
                                                hour: h,
                                                status: newStatus,
                                              },
                                            ],
                                          }),
                                        },
                                      );
                                      if (!res.ok) {
                                        const data = await res
                                          .json()
                                          .catch(() => ({}));
                                        throw new Error(
                                          data.error ?? `failed (${res.status})`,
                                        );
                                      }
                                    } catch (err) {
                                      setSlots(prev);
                                      setError((err as Error).message);
                                    }
                                  });
                                }}
                                className={cn(
                                  "h-7 rounded-md px-3 text-xs font-medium border w-full transition",
                                  s === "AVAILABLE"
                                    ? "bg-emerald-100 border-emerald-200 text-emerald-800 hover:bg-emerald-200"
                                    : "bg-rose-100 border-rose-200 text-rose-800 hover:bg-rose-200",
                                  !canEdit && "cursor-not-allowed opacity-60",
                                )}
                                title={
                                  canEdit
                                    ? "Click to toggle"
                                    : "View only — requires leads.availability.manage"
                                }
                              >
                                {s === "AVAILABLE" ? "Available" : "Unavailable"}
                              </button>
                            </td>
                          );
                        })}
                        <td className="py-1.5 px-2 text-right">
                          {canEdit && selectedConsultantIds.length > 1 && (
                            <button
                              type="button"
                              onClick={() => applyToggle(h)}
                              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                              title="Toggle this hour for all selected consultants"
                            >
                              Bulk <ChevronDown className="h-3 w-3" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Changes save automatically and sync with Leads Schedule —
        unavailable consultants cannot be booked into those slots.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function formatHourRange(h: number): string {
  const fmt = (n: number) => {
    const period = n >= 12 ? "PM" : "AM";
    const v = n % 12 === 0 ? 12 : n % 12;
    return `${v} ${period}`;
  };
  return `${fmt(h)} – ${fmt(h + 1)}`;
}

function StatusPill({
  status,
}: {
  status: "AVAILABLE" | "UNAVAILABLE" | "PARTIAL";
}) {
  const map = {
    AVAILABLE: "bg-emerald-100 text-emerald-800 border-emerald-200",
    UNAVAILABLE: "bg-rose-100 text-rose-800 border-rose-200",
    PARTIAL: "bg-amber-100 text-amber-800 border-amber-200",
  } as const;
  const label = {
    AVAILABLE: "Available",
    UNAVAILABLE: "Unavailable",
    PARTIAL: "Partial",
  }[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        map[status],
      )}
    >
      {label}
    </span>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <StatusPill status="AVAILABLE" />
      <StatusPill status="PARTIAL" />
      <StatusPill status="UNAVAILABLE" />
    </div>
  );
}
