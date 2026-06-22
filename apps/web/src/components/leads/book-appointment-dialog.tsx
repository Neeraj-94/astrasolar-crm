"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApi } from "@/lib/api/use-api";
import { apiPost } from "@/lib/api/client";
import { buildTimeSlots } from "@/lib/leads/schedule-types";

interface Consultant {
  id: string;
  name: string;
  email: string;
  region: string | null;
}

interface OpenSlot {
  consultantId: string;
  date: string; // YYYY-MM-DD
  hour: number;
  minute: number;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MON_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function daySuffix(n: number): string {
  if (n > 3 && n < 21) return "th";
  switch (n % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

/** "Monday 23rd of Jun" — mirrors the astrasolar-app day header label. */
function dayLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()}${daySuffix(d.getDate())} of ${MON_NAMES[d.getMonth()]}`;
}

function fmtDayShort(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

/** Picker window: today → 13 days out, split into "This Week" / "Next Week". */
const PICKER_DAYS = 14;
const WEEK_LEN = 7;

type DayBlock = {
  date: string;
  isToday: boolean;
  totalSlots: number;
  consultants: {
    consultant: Consultant;
    slots: OpenSlot[];
  }[];
};

/**
 * "Book Appointment" modal for a Bloome lead — a day-first schedule that
 * mirrors the astrasolar-app version: switch between This Week / Next Week,
 * see every consultant's open 30-minute slots grouped under each day, and
 * click a slot chip to book the lead into that consultant's timeline.
 *
 * Driven by each consultant's submitted availability minus existing bookings
 * (the /scheduling/open-slots endpoint, which already spans all consultants).
 */
export function BookAppointmentDialog({
  leadId,
  leadName,
  onClose,
  onBooked,
}: {
  leadId: string;
  leadName: string;
  onClose: () => void;
  onBooked: () => void;
}) {
  const slotLabels = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const s of buildTimeSlots()) m.set(s.key, s.label);
    return m;
  }, []);

  const slotLabel = React.useCallback(
    (s: OpenSlot) => {
      const key = `${s.hour}:${s.minute === 0 ? "00" : "30"}`;
      return slotLabels.get(key) ?? key;
    },
    [slotLabels],
  );

  const consultants = useApi<Consultant[]>("/users/consultants");

  const range = React.useMemo(() => {
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + PICKER_DAYS - 1);
    return { from: toISODate(from), to: toISODate(to) };
  }, []);

  const slotsPath = React.useMemo(() => {
    const list = consultants.data;
    if (!list?.length) return null;
    const ids = list.map((c) => c.id).join(",");
    return `/scheduling/open-slots?from=${range.from}&to=${range.to}&consultantIds=${encodeURIComponent(ids)}`;
  }, [consultants.data, range]);

  const openSlots = useApi<OpenSlot[]>(slotsPath);

  const [weekOffset, setWeekOffset] = React.useState(0);
  const [booking, setBooking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // The two 7-day windows that back the This Week / Next Week tabs.
  const weekDates = React.useMemo(() => {
    const out: string[][] = [[], []];
    const base = new Date();
    for (let i = 0; i < PICKER_DAYS; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      out[i < WEEK_LEN ? 0 : 1].push(toISODate(d));
    }
    return out;
  }, []);

  const consultantById = React.useMemo(() => {
    const m = new Map<string, Consultant>();
    for (const c of consultants.data ?? []) m.set(c.id, c);
    return m;
  }, [consultants.data]);

  // Day-first grouping for the active week: each day → consultants → open
  // slots, with past slots (earlier today) hidden. Days with no open slots
  // are dropped so the grid only ever shows bookable time.
  const dayBlocks = React.useMemo<DayBlock[]>(() => {
    const dates = weekDates[weekOffset] ?? [];
    const now = new Date();
    const todayIso = toISODate(now);
    const nowMins = now.getHours() * 60 + now.getMinutes();

    // date -> consultantId -> slots
    const byDay = new Map<string, Map<string, OpenSlot[]>>();
    for (const s of openSlots.data ?? []) {
      if (!dates.includes(s.date)) continue;
      if (s.date < todayIso) continue;
      if (s.date === todayIso && s.hour * 60 + s.minute <= nowMins) continue;
      let perCons = byDay.get(s.date);
      if (!perCons) {
        perCons = new Map();
        byDay.set(s.date, perCons);
      }
      const list = perCons.get(s.consultantId) ?? [];
      list.push(s);
      perCons.set(s.consultantId, list);
    }

    const blocks: DayBlock[] = [];
    for (const date of dates) {
      const perCons = byDay.get(date);
      if (!perCons || perCons.size === 0) continue;
      const consultantRows: DayBlock["consultants"] = [];
      let totalSlots = 0;
      for (const [cid, slots] of perCons) {
        const consultant = consultantById.get(cid);
        if (!consultant) continue;
        slots.sort((a, b) => a.hour - b.hour || a.minute - b.minute);
        totalSlots += slots.length;
        consultantRows.push({ consultant, slots });
      }
      if (consultantRows.length === 0) continue;
      consultantRows.sort((a, b) =>
        (a.consultant.name || a.consultant.email).localeCompare(
          b.consultant.name || b.consultant.email,
        ),
      );
      blocks.push({
        date,
        isToday: date === todayIso,
        totalSlots,
        consultants: consultantRows,
      });
    }
    return blocks;
  }, [openSlots.data, weekDates, weekOffset, consultantById]);

  async function book(slot: OpenSlot) {
    const consultant = consultantById.get(slot.consultantId);
    const name = consultant?.name || consultant?.email || "this consultant";
    const ok = window.confirm(
      `Book ${leadName} with ${name} on ${fmtDayShort(slot.date)} at ${slotLabel(slot)}?`,
    );
    if (!ok) return;
    setBooking(true);
    setError(null);
    try {
      await apiPost(`/leads/bloome/${leadId}/book`, {
        consultantId: slot.consultantId,
        date: slot.date,
        hour: slot.hour,
        minute: slot.minute,
      });
      onBooked();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Booking failed");
      setBooking(false);
    }
  }

  const loading =
    consultants.loading || (slotsPath !== null && openSlots.loading);

  const emptyMessage = !consultants.data?.length
    ? "No sales consultants found."
    : weekOffset === 0
      ? "No open slots this week — all submitted slots are already booked. Try Next Week."
      : "No open slots next week. Consultants may not have submitted availability yet.";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Book appointment for ${leadName}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border bg-card shadow-lg">
        {/* Header */}
        <div className="flex items-center gap-3 border-b px-5 py-4">
          <h2 className="text-sm font-semibold">Book Appointment</h2>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            <span className="font-medium text-primary">{leadName}</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded border text-muted-foreground hover:bg-accent"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Week nav */}
        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-2.5">
          {[
            { offset: 0, label: "This Week" },
            { offset: 1, label: "Next Week" },
          ].map((w) => (
            <button
              key={w.offset}
              type="button"
              onClick={() => setWeekOffset(w.offset)}
              className={cn(
                "h-7 rounded-md border px-3 text-xs font-semibold",
                weekOffset === w.offset
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background hover:bg-accent",
              )}
            >
              {w.label}
            </button>
          ))}
          <span className="ml-auto text-[0.65rem] text-muted-foreground">
            Click a time to book this lead
          </span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {consultants.error ? (
            <p className="text-sm text-destructive">{consultants.error}</p>
          ) : loading ? (
            <p className="text-sm text-muted-foreground">Loading availability…</p>
          ) : dayBlocks.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {emptyMessage}
            </p>
          ) : (
            <div className="space-y-3.5">
              {dayBlocks.map((block) => (
                <div key={block.date}>
                  {/* Day header */}
                  <div className="flex items-center gap-2 rounded-t-lg border-l-[3px] border-primary bg-muted px-3 py-2">
                    <span className="text-xs font-bold uppercase tracking-wide">
                      {block.isToday ? "● " : ""}
                      {dayLabel(block.date)}
                    </span>
                    <span className="ml-auto text-[0.65rem] text-muted-foreground">
                      {block.totalSlots} open slot
                      {block.totalSlots === 1 ? "" : "s"} ·{" "}
                      {block.consultants.length} consultant
                      {block.consultants.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  {/* Per-consultant rows */}
                  <div className="rounded-b-lg border border-t-0 px-2 py-1">
                    {block.consultants.map((row, i) => (
                      <div
                        key={row.consultant.id}
                        className={cn(
                          "flex flex-wrap items-start gap-2.5 px-1.5 py-2",
                          i < block.consultants.length - 1 &&
                            "border-b border-dashed",
                        )}
                      >
                        <div className="w-[130px] flex-none">
                          <span className="text-xs font-bold text-primary">
                            {row.consultant.name || row.consultant.email}
                          </span>
                          {row.consultant.region && (
                            <div className="text-[0.6rem] text-muted-foreground">
                              {row.consultant.region}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-1 flex-wrap gap-1.5">
                          {row.slots.map((s) => (
                            <button
                              key={`${s.hour}:${s.minute}`}
                              type="button"
                              disabled={booking}
                              onClick={() => book(s)}
                              title={`Book ${leadName} with ${row.consultant.name || row.consultant.email} at ${slotLabel(s)}`}
                              className="rounded-full border border-emerald-500/50 bg-emerald-500/10 px-2.5 py-1 text-[0.65rem] font-semibold text-emerald-600 transition-colors hover:bg-emerald-500 hover:text-white disabled:opacity-50 dark:text-emerald-400"
                            >
                              {slotLabel(s)}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </div>
      </div>
    </div>
  );
}
