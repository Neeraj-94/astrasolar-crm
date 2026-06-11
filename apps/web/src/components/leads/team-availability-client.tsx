"use client";

/**
 * Team Availability Manager — client component.
 *
 * Flow:
 *   1. Pick a consultant
 *   2. Pick This Week / Next Week
 *   3. Edit one day at a time (quick-set buttons + per-hour toggle)
 *   4. Save Availability — writes one AvailabilitySubmission + slot rows.
 *
 * Underlying storage path (logical): availability/consultants/[consultantId]/[week]
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  Loader2,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  TreePalm,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ConsultantAvatar,
  PageHeader,
  Section,
  StatusBadge,
} from "./shared";
import {
  DataTable,
  DragTH,
  TR,
  applyRowOrder,
} from "@/components/leads/shared/data-table";

const FIRST_HOUR = 8;
const LAST_HOUR = 19;
const HOURS: number[] = Array.from(
  { length: LAST_HOUR - FIRST_HOUR + 1 },
  (_, i) => FIRST_HOUR + i,
);
const MORNING_HOURS = [9, 10];
const AFTERNOON_HOURS = [12, 13, 14];
const EVENING_HOURS = [16, 17, 18, 19];
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FULL_DAY_LABELS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

type Status = "AVAILABLE" | "UNAVAILABLE" | "HOLIDAY";

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

interface SubmissionSummary {
  consultantId: string;
  consultantName: string;
  weekStart: string;
  weekEnd: string;
  holidayDays: string[];
  slotsCount: number;
  submitted: boolean;
  submittedAt: string;
  updatedAt: string;
  updatedById: string | null;
  updatedByName: string | null;
}

interface Props {
  consultants: Consultant[];
  initialSlots: SlotRecord[];
  initialSubmissions: SubmissionSummary[];
  thisWeekStart: string;
  nextWeekStart: string;
  canEdit: boolean;
  currentUserName: string;
}

// ---- date helpers (local-tz) ---------------------------------------------
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
function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
function consultantLabel(c: Consultant): string {
  return c.displayName || c.email;
}
function formatHour(h: number): string {
  const period = h >= 12 ? "PM" : "AM";
  const v = h % 12 === 0 ? 12 : h % 12;
  return `${v}:00 ${period}`;
}
function formatHourRange(h: number): string {
  return `${formatHour(h)} – ${formatHour(h + 1)}`;
}

// ---- internal types ------------------------------------------------------
type DayState = {
  availableHours: Set<number>;
  holiday: boolean;
};
type WeekState = Map<string, DayState>; // date ISO → state

function buildEmptyWeek(weekStart: string): WeekState {
  const m: WeekState = new Map();
  for (let i = 0; i < 7; i++) {
    const iso = toISODate(addDays(fromISODate(weekStart), i));
    m.set(iso, { availableHours: new Set(), holiday: false });
  }
  return m;
}

function buildWeekFromSlots(
  weekStart: string,
  slots: SlotRecord[],
): WeekState {
  const m = buildEmptyWeek(weekStart);
  for (const s of slots) {
    const day = m.get(s.date);
    if (!day) continue;
    if (s.status === "HOLIDAY") day.holiday = true;
    if (s.status === "AVAILABLE") day.availableHours.add(s.hour);
  }
  return m;
}

export function TeamAvailabilityClient({
  consultants,
  initialSlots,
  initialSubmissions,
  thisWeekStart,
  nextWeekStart,
  canEdit,
  currentUserName,
}: Props) {
  const [selectedConsultantId, setSelectedConsultantId] = useState<string>(
    consultants[0]?.id ?? "",
  );
  const [weekKey, setWeekKey] = useState<"this" | "next">("this");
  const weekStart = weekKey === "this" ? thisWeekStart : nextWeekStart;

  // Server-loaded slot map keyed by `${consultantId}|${weekStart}` so we don't
  // refetch repeatedly when the user toggles between consultants.
  const slotsCacheRef = useMemo(() => {
    const map = new Map<string, SlotRecord[]>();
    for (const s of initialSlots) {
      const wkIso = toISODate(weekStartOf(fromISODate(s.date)));
      const key = `${s.consultantId}|${wkIso}`;
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    return map;
  }, [initialSlots]);

  const [submissions, setSubmissions] = useState<SubmissionSummary[]>(
    initialSubmissions,
  );

  // Local editable week state for the currently-selected (consultant, week)
  const [weekState, setWeekState] = useState<WeekState>(() =>
    buildWeekFromSlots(
      weekStart,
      slotsCacheRef.get(`${selectedConsultantId}|${weekStart}`) ?? [],
    ),
  );
  const [selectedDay, setSelectedDay] = useState<string>(weekStart);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Whenever the selection changes, reset the local week state from the
  // server-loaded slots (or fetch fresh data if not in cache).
  const loadWeek = useCallback(
    async (consultantId: string, wkStart: string) => {
      if (!consultantId) {
        setWeekState(buildEmptyWeek(wkStart));
        return;
      }
      setError(null);
      const cacheKey = `${consultantId}|${wkStart}`;
      const cached = slotsCacheRef.get(cacheKey);
      if (cached) {
        setWeekState(buildWeekFromSlots(wkStart, cached));
        return;
      }
      try {
        const end = addDays(fromISODate(wkStart), 6);
        const url = `/api/leads/availability?from=${wkStart}&to=${toISODate(end)}&consultantIds=${consultantId}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`load failed (${res.status})`);
        const data: { slots: SlotRecord[] } = await res.json();
        slotsCacheRef.set(cacheKey, data.slots);
        setWeekState(buildWeekFromSlots(wkStart, data.slots));
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [slotsCacheRef],
  );

  useEffect(() => {
    setSelectedDay(weekStart);
    setDirty(false);
    void loadWeek(selectedConsultantId, weekStart);
  }, [selectedConsultantId, weekStart, loadWeek]);

  const selectedConsultant = consultants.find(
    (c) => c.id === selectedConsultantId,
  );
  const consultantName = selectedConsultant
    ? consultantLabel(selectedConsultant)
    : "";

  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => addDays(fromISODate(weekStart), i)),
    [weekStart],
  );

  // Current submission summary for the selected (consultant, week)
  const currentSubmission = submissions.find(
    (s) =>
      s.consultantId === selectedConsultantId && s.weekStart === weekStart,
  );

  const totalSelectedSlots = useMemo(() => {
    let total = 0;
    for (const [, day] of weekState) {
      if (!day.holiday) total += day.availableHours.size;
    }
    return total;
  }, [weekState]);

  // ---- editing operations ------------------------------------------------
  function mutateDay(date: string, fn: (d: DayState) => DayState) {
    if (!canEdit) {
      setError("You don't have permission to edit availability.");
      return;
    }
    setError(null);
    setWeekState((curr) => {
      const next = new Map(curr);
      const current = curr.get(date) ?? {
        availableHours: new Set<number>(),
        holiday: false,
      };
      next.set(date, fn(current));
      return next;
    });
    setDirty(true);
  }

  function toggleHour(date: string, hour: number) {
    mutateDay(date, (d) => {
      const hours = new Set(d.availableHours);
      if (hours.has(hour)) hours.delete(hour);
      else hours.add(hour);
      return { availableHours: hours, holiday: false };
    });
  }

  function selectHours(date: string, hours: number[]) {
    mutateDay(date, (d) => {
      const next = new Set(d.availableHours);
      for (const h of hours) next.add(h);
      return { availableHours: next, holiday: false };
    });
  }

  function selectAll(date: string) {
    mutateDay(date, () => ({
      availableHours: new Set(HOURS),
      holiday: false,
    }));
  }

  function clearAll(date: string) {
    mutateDay(date, () => ({
      availableHours: new Set(),
      holiday: false,
    }));
  }

  function toggleHoliday(date: string) {
    mutateDay(date, (d) => ({
      availableHours: new Set(),
      holiday: !d.holiday,
    }));
  }

  // ---- save --------------------------------------------------------------
  async function handleSave() {
    if (!selectedConsultant) {
      setError("Select a consultant before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        consultantId: selectedConsultant.id,
        consultantName: consultantLabel(selectedConsultant),
        weekStart,
        days: weekDays.map((d) => {
          const iso = toISODate(d);
          const state = weekState.get(iso) ?? {
            availableHours: new Set<number>(),
            holiday: false,
          };
          return {
            date: iso,
            holiday: state.holiday,
            availableHours: Array.from(state.availableHours).sort(
              (a, b) => a - b,
            ),
          };
        }),
      };

      const res = await fetch("/api/leads/availability/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `save failed (${res.status})`);
      }

      const summary: SubmissionSummary = data.submission;
      setSubmissions((curr) => {
        const filtered = curr.filter(
          (s) =>
            !(
              s.consultantId === summary.consultantId &&
              s.weekStart === summary.weekStart
            ),
        );
        return [...filtered, summary];
      });
      slotsCacheRef.set(
        `${summary.consultantId}|${summary.weekStart}`,
        snapshotSlots(summary.consultantId, weekStart, weekState),
      );
      setDirty(false);
      setToast("Availability saved");
      setTimeout(() => setToast(null), 2500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // ---- selected day editor data -----------------------------------------
  const selectedDayState = weekState.get(selectedDay) ?? {
    availableHours: new Set<number>(),
    holiday: false,
  };
  const selectedDayDate = fromISODate(selectedDay);
  const selectedDayIndex =
    (selectedDayDate.getDay() + 6) % 7; // Mon=0 .. Sun=6
  const selectedDayHeading = `${FULL_DAY_LABELS[selectedDayIndex]} ${ordinal(
    selectedDayDate.getDate(),
  )} ${selectedDayDate.toLocaleDateString("en-AU", { month: "long" })}`;

  // ---- team overview rows -----------------------------------------------
  const overviewRows = useMemo(() => {
    return consultants.map((c) => {
      const sub = submissions.find(
        (s) => s.consultantId === c.id && s.weekStart === weekStart,
      );
      const cacheKey = `${c.id}|${weekStart}`;
      const slots = slotsCacheRef.get(cacheKey) ?? [];
      const dayCounts = new Map<string, { avail: number; holiday: boolean }>();
      for (const d of weekDays) {
        dayCounts.set(toISODate(d), { avail: 0, holiday: false });
      }
      for (const s of slots) {
        const v = dayCounts.get(s.date);
        if (!v) continue;
        if (s.status === "HOLIDAY") v.holiday = true;
        if (s.status === "AVAILABLE") v.avail += 1;
      }
      // Overlay current edits for the selected consultant so unsaved changes
      // are reflected in the overview row.
      if (c.id === selectedConsultantId && dirty) {
        for (const [date, st] of weekState) {
          dayCounts.set(date, {
            avail: st.holiday ? 0 : st.availableHours.size,
            holiday: st.holiday,
          });
        }
      }
      return {
        consultant: c,
        submitted: !!sub,
        dayCounts,
      };
    });
  }, [
    consultants,
    submissions,
    weekStart,
    weekDays,
    slotsCacheRef,
    selectedConsultantId,
    weekState,
    dirty,
  ]);

  // Session-only display order for the Team Overview table.
  const [overviewOrder, setOverviewOrder] = useState<string[] | null>(null);
  const displayOverviewRows = overviewOrder
    ? applyRowOrder(overviewRows, overviewOrder, (r) => r.consultant.id)
    : overviewRows;

  // ---- render ------------------------------------------------------------
  const weekStartDate = fromISODate(weekStart);
  const weekEndDate = addDays(weekStartDate, 6);
  const weekHeader = `Week of ${ordinal(weekStartDate.getDate())} ${weekStartDate.toLocaleDateString(
    "en-AU",
    { month: "long" },
  )} - ${ordinal(weekEndDate.getDate())} ${weekEndDate.toLocaleDateString(
    "en-AU",
    { month: "long", year: "numeric" },
  )}`;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Leads · Operations"
        title="Team Availability Manager"
        description="Set and Edit Consultant Availability"
      />

      {/* Top control section */}
      <Section flush>
        <div className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_auto_auto]">
          {/* Consultant selector */}
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Consultant
            </label>
            <div className="flex flex-wrap gap-2">
              {consultants.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No active consultants yet.
                </p>
              )}
              {consultants.map((c) => {
                const on = c.id === selectedConsultantId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedConsultantId(c.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                      on
                        ? "border-primary bg-primary text-primary-foreground"
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
          </div>

          {/* Week selector */}
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Week
            </label>
            <div className="inline-flex rounded-md border bg-card">
              <button
                type="button"
                onClick={() => setWeekKey("this")}
                className={cn(
                  "h-9 px-4 text-sm font-medium",
                  weekKey === "this"
                    ? "bg-primary text-primary-foreground rounded-l-md"
                    : "hover:bg-accent rounded-l-md",
                )}
              >
                This Week
              </button>
              <button
                type="button"
                onClick={() => setWeekKey("next")}
                className={cn(
                  "h-9 px-4 text-sm font-medium border-l",
                  weekKey === "next"
                    ? "bg-primary text-primary-foreground rounded-r-md"
                    : "hover:bg-accent rounded-r-md",
                )}
              >
                Next Week
              </button>
            </div>
          </div>

          {/* Summary */}
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Summary
            </label>
            <div className="rounded-md border bg-muted/30 px-4 py-2.5 text-sm min-w-[220px]">
              <div className="flex items-center gap-2">
                {currentSubmission ? (
                  <StatusBadge tone="success" variant="soft" dot>
                    Submitted
                  </StatusBadge>
                ) : (
                  <StatusBadge tone="warning" variant="soft" dot>
                    Not submitted
                  </StatusBadge>
                )}
                <span className="text-foreground font-medium tabular-nums">
                  {dirty ? totalSelectedSlots : currentSubmission?.slotsCount ?? totalSelectedSlots}
                </span>
                <span className="text-muted-foreground">slots</span>
                {dirty && (
                  <span className="ml-auto text-xs text-amber-600">
                    Unsaved
                  </span>
                )}
              </div>
              {currentSubmission && !dirty && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Updated{" "}
                  {new Date(currentSubmission.updatedAt).toLocaleString(
                    "en-AU",
                    { dateStyle: "medium", timeStyle: "short" },
                  )}
                  {currentSubmission.updatedByName
                    ? ` · by ${currentSubmission.updatedByName}`
                    : ""}
                </div>
              )}
            </div>
          </div>
        </div>
      </Section>

      {/* Weekly view */}
      {selectedConsultant && (
        <Section title={weekHeader} flush>
          <div className="grid gap-2 px-5 py-4 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
            {weekDays.map((d, i) => {
              const iso = toISODate(d);
              const state = weekState.get(iso);
              const active = iso === selectedDay;
              const slotCount = state?.availableHours.size ?? 0;
              const isHoliday = state?.holiday ?? false;
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
                    {DAY_LABELS[i]} {ordinal(d.getDate())}{" "}
                    {d.toLocaleDateString("en-AU", { month: "short" })}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    {isHoliday ? (
                      <span className="text-sm font-semibold text-amber-600">
                        Holiday
                      </span>
                    ) : (
                      <span className="text-lg font-semibold tabular-nums">
                        {slotCount}
                      </span>
                    )}
                    {!isHoliday && (
                      <span className="text-xs text-muted-foreground">
                        {slotCount === 1 ? "slot" : "slots"}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {/* Day editor */}
      {selectedConsultant && (
        <Section flush>
          <div className="px-5 py-4 border-b flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">{selectedDayHeading}</h3>
            <div className="flex flex-wrap gap-1.5">
              <QuickBtn
                label="Select All"
                icon={<Sparkles className="h-3.5 w-3.5" />}
                onClick={() => selectAll(selectedDay)}
                disabled={!canEdit}
              />
              <QuickBtn
                label="Morning"
                icon={<Sunrise className="h-3.5 w-3.5" />}
                onClick={() => selectHours(selectedDay, MORNING_HOURS)}
                disabled={!canEdit}
              />
              <QuickBtn
                label="Afternoon"
                icon={<Sun className="h-3.5 w-3.5" />}
                onClick={() => selectHours(selectedDay, AFTERNOON_HOURS)}
                disabled={!canEdit}
              />
              <QuickBtn
                label="Evening"
                icon={<Sunset className="h-3.5 w-3.5" />}
                onClick={() => selectHours(selectedDay, EVENING_HOURS)}
                disabled={!canEdit}
              />
              <QuickBtn
                label="Clear All"
                tone="ghost"
                icon={<X className="h-3.5 w-3.5" />}
                onClick={() => clearAll(selectedDay)}
                disabled={!canEdit}
              />
              <QuickBtn
                label={selectedDayState.holiday ? "Cancel Holiday" : "Holiday"}
                tone="danger"
                icon={<TreePalm className="h-3.5 w-3.5" />}
                onClick={() => toggleHoliday(selectedDay)}
                disabled={!canEdit}
              />
            </div>
          </div>

          <div className="px-5 py-4">
            {selectedDayState.holiday ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200 dark:border-amber-900/40">
                Marked as Holiday — the entire day is unavailable. Click
                "Cancel Holiday" to edit hourly slots.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {HOURS.map((h) => {
                  const on = selectedDayState.availableHours.has(h);
                  return (
                    <button
                      key={h}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => toggleHour(selectedDay, h)}
                      className={cn(
                        "rounded-md border px-3 py-2 text-sm font-medium transition-colors text-left",
                        on
                          ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
                          : "bg-background border-border hover:bg-muted",
                        !canEdit && "cursor-not-allowed opacity-60",
                      )}
                    >
                      <div className="text-xs tabular-nums">
                        {formatHourRange(h)}
                      </div>
                      <div className="text-xs mt-0.5 text-muted-foreground">
                        {on ? "Available" : "Off"}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="px-5 py-4 border-t flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              Saving as {currentUserName}. Storage:{" "}
              <code className="px-1 py-0.5 rounded bg-muted text-foreground/80">
                availability/consultants/{selectedConsultant.id}/{weekStart}
              </code>
            </div>
            <Button
              onClick={handleSave}
              disabled={!canEdit || saving || consultants.length === 0}
              className="gap-2"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Save Availability
            </Button>
          </div>
        </Section>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {toast && (
        <div className="flex items-start gap-2 rounded-md border border-emerald-400/40 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          <Check className="h-4 w-4 mt-0.5" />
          <span>{toast}</span>
        </div>
      )}

      {/* Team overview */}
      <Section
        title="Team Overview"
        description={`Availability status for ${weekKey === "this" ? "this" : "next"} week`}
        flush
      >
        <DataTable
          sortable={{
            ids: displayOverviewRows.map((r) => r.consultant.id),
            onReorder: setOverviewOrder,
          }}
        >
            <thead className="bg-muted/40">
              <tr>
                <DragTH />
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground border-b">
                  Consultant
                </th>
                <th className="px-4 py-2.5 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground border-b w-20">
                  Status
                </th>
                {DAY_LABELS.map((label, i) => (
                  <th
                    key={label}
                    className="px-3 py-2.5 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground border-b border-l"
                  >
                    {label}
                    <div className="text-[10px] font-normal text-muted-foreground/70 tabular-nums">
                      {weekDays[i].getDate()}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayOverviewRows.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    className="px-4 py-6 text-center text-sm text-muted-foreground"
                  >
                    No consultants yet.
                  </td>
                </tr>
              )}
              {displayOverviewRows.map((row) => (
                <TR
                  key={row.consultant.id}
                  sortableId={row.consultant.id}
                  className="hover:bg-muted/20"
                >
                  <td className="px-4 py-2.5 border-b">
                    <div className="flex items-center gap-2">
                      <ConsultantAvatar
                        name={consultantLabel(row.consultant)}
                        size="xs"
                      />
                      <span className="font-medium">
                        {consultantLabel(row.consultant)}
                      </span>
                      {row.consultant.region && (
                        <span className="text-xs text-muted-foreground">
                          · {row.consultant.region}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 border-b text-center">
                    {row.submitted ? (
                      <span
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        title="Submitted"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <span
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-500/15 text-red-700 dark:text-red-300"
                        title="Not submitted"
                      >
                        <X className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </td>
                  {weekDays.map((d) => {
                    const iso = toISODate(d);
                    const cell = row.dayCounts.get(iso);
                    const displayed = !row.submitted && !(row.consultant.id === selectedConsultantId && dirty)
                      ? "-"
                      : cell?.holiday
                        ? "Off"
                        : (cell?.avail ?? 0).toString();
                    return (
                      <td
                        key={iso}
                        className={cn(
                          "px-3 py-2.5 border-b border-l text-center tabular-nums text-sm",
                          cell?.holiday && "text-amber-600 font-medium",
                          !row.submitted &&
                            !(row.consultant.id === selectedConsultantId && dirty) &&
                            "text-muted-foreground",
                        )}
                      >
                        {displayed}
                      </td>
                    );
                  })}
                </TR>
              ))}
            </tbody>
        </DataTable>
      </Section>

      <p className="text-xs text-muted-foreground">
        Saved availability is reflected on the Leads Schedule — unavailable and
        holiday hours are disabled and cannot be booked by Lead Gen users.
      </p>
    </div>
  );
}

// ---- helpers -------------------------------------------------------------

function QuickBtn({
  label,
  icon,
  onClick,
  tone = "primary",
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  tone?: "primary" | "danger" | "ghost";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium border transition-colors",
        tone === "primary" &&
          "border-primary/40 text-primary hover:bg-primary/10",
        tone === "danger" &&
          "border-destructive/40 text-destructive hover:bg-destructive/10",
        tone === "ghost" &&
          "border-border text-muted-foreground hover:bg-muted",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function weekStartOf(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const day = out.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  out.setDate(out.getDate() + offset);
  return out;
}

function snapshotSlots(
  consultantId: string,
  weekStart: string,
  state: WeekState,
): SlotRecord[] {
  const out: SlotRecord[] = [];
  for (let i = 0; i < 7; i++) {
    const iso = toISODate(addDays(fromISODate(weekStart), i));
    const day = state.get(iso);
    if (!day) continue;
    if (day.holiday) {
      for (const h of HOURS) {
        out.push({
          consultantId,
          date: iso,
          hour: h,
          status: "HOLIDAY",
          note: null,
        });
      }
      continue;
    }
    for (const h of HOURS) {
      out.push({
        consultantId,
        date: iso,
        hour: h,
        status: day.availableHours.has(h) ? "AVAILABLE" : "UNAVAILABLE",
        note: null,
      });
    }
  }
  return out;
}
