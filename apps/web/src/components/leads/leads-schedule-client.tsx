"use client";

/**
 * Leads Schedule — faithful port of the legacy astrasolar-app UI structure.
 *
 * Mirrors the legacy single-file dashboard (index.html, lgRenderContent and
 * friends) section-for-section:
 *
 *   1. Week toggle (◀ / This Week / Next Week / ▶ + range label) + quick
 *      jumps (Next Available / Next Day / Next Evening / Next Weekend) +
 *      Reload — legacy #leadgen-topbar controls.
 *   2. Consultant availability pills (#lg-avail-header) with per-consultant
 *      "Next Avail ▸" / "Next Evening ▸" jump buttons.
 *   3. Weekly Availability Heatmap (collapsible; consultant × day cells:
 *      green open / amber partial / red full / grey n/a + legend).
 *   4. Global "View Day" navigator (switches every consultant at once).
 *   5. "Show Available Slots Only" toggle + lead search with dropdown
 *      results.
 *   6a. Available-only WEEKLY view — day-first blocks with open-slot chips
 *       and inline entry forms (legacy Build DB layout).
 *   6b. Normal DAILY view — per-consultant collapsible sections with day
 *       tabs (booked counts, ● today), the 13-row hourly slot table
 *       (# / Time / Lead Gen / Disposition / entry fields / Actions),
 *       inline entry + edit rows, click-to-edit cells, 🧷 STACKED rows,
 *       "ADDITIONAL LEADS (non-standard times)" rows and the 📌 ADDITIONAL
 *       LEADS (cancelled / rescheduled) section below the table.
 *
 * Data: NestJS API (`/scheduling/*`) — appointments, availability slots and
 * weekly submissions are fetched per visible week.
 */

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiDelete, apiPatch, apiPost } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { cn } from "@/lib/utils";
import {
  DISPOSITIONS,
  DISPOSITION_LABEL,
  type ScheduleAppointment,
  type ScheduleConsultant,
} from "@/lib/leads/schedule-types";
import { ChecklistDialog } from "@/components/sales/checklist/checklist-dialog";

// Re-export so existing imports from this module keep working.
export type { ScheduleConsultant, ScheduleAppointment };

// ---------------------------------------------------------------------------
// Legacy slot model — 13 hourly slots, 8:00 AM → 8:00 PM (LG_TIME_SLOTS)
// ---------------------------------------------------------------------------

const LG_SLOT_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

function hourLabel(h: number): string {
  const period = h >= 12 ? "PM" : "AM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:00 ${period}`;
}

const LG_TIME_SLOTS = LG_SLOT_HOURS.map(hourLabel);

/** API working hours — bookable range enforced server-side (8..19 starts). */
const API_LAST_BOOKABLE_HOUR = 19;

// ---------------------------------------------------------------------------
// Legacy entry fields (LG_ENTRY_FIELDS) — order defines the table columns
// ---------------------------------------------------------------------------

interface EntryField {
  key: keyof EntryDraft;
  label: string;
  required?: boolean;
  width: string;
  type?: "select";
  options?: string[];
}

interface EntryDraft {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  postcode: string;
  state: string;
  bills: string;
  source: string;
  notes: string;
  company: string;
}

const ENTRY_FIELDS: EntryField[] = [
  { key: "firstName", label: "First Name", required: true, width: "min-w-[90px]" },
  { key: "lastName", label: "Surname", required: true, width: "min-w-[90px]" },
  { key: "phone", label: "Phone", required: true, width: "min-w-[100px]" },
  { key: "email", label: "Email", width: "min-w-[110px]" },
  { key: "address", label: "Address", width: "min-w-[140px]" },
  { key: "postcode", label: "Postcode", width: "min-w-[60px]" },
  {
    key: "state",
    label: "State",
    width: "min-w-[85px]",
    type: "select",
    options: ["", "ACT", "TAS Hobart", "TAS Laun", "Victoria", "NSW", "VIC", "QLD", "SA", "WA", "NT"],
  },
  { key: "bills", label: "Bills", width: "min-w-[60px]" },
  {
    key: "source",
    label: "Source",
    width: "min-w-[90px]",
    type: "select",
    options: ["", "Brighte", "Referral", "Website", "Bloome"],
  },
  { key: "notes", label: "Notes", width: "min-w-[120px]" },
  {
    key: "company",
    label: "Company",
    width: "min-w-[90px]",
    type: "select",
    options: ["", "Astra", "DC ELEC"],
  },
];

const EMPTY_DRAFT: EntryDraft = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  address: "",
  postcode: "",
  state: "",
  bills: "",
  source: "",
  notes: "",
  company: "",
};

function draftFromAppt(a: ScheduleAppointment): EntryDraft {
  return {
    firstName: a.firstName ?? "",
    lastName: a.lastName ?? "",
    phone: a.phone ?? "",
    email: a.email ?? "",
    address: a.address ?? "",
    postcode: a.postcode ?? "",
    state: a.state ?? "",
    bills: a.bills ?? "",
    source: a.source ?? "",
    notes: a.notes ?? "",
    company: a.company ?? "",
  };
}

// ---------------------------------------------------------------------------
// Date helpers (legacy lgGetWeekDates / lgFmtDayShort / lgFmtISO …)
// ---------------------------------------------------------------------------

function fmtISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function getWeekDates(offset: number): string[] {
  const today = new Date();
  const day = today.getDay(); // 0=Sun
  const mon = new Date(today);
  mon.setDate(today.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    out.push(fmtISO(d));
  }
  return out;
}

function todayIndex(weekOffset: number): number {
  const idx = getWeekDates(weekOffset).indexOf(fmtISO(new Date()));
  return idx >= 0 ? idx : 0;
}

function fmtDayShort(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

function fmtDayLong(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const n = d.getDate();
  const sfx =
    n > 3 && n < 21 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
  return `${days[d.getDay()]} ${n}${sfx} of ${months[d.getMonth()]}`;
}

// ---------------------------------------------------------------------------
// Consultant colour palette (legacy TEAM colours, assigned by index)
// ---------------------------------------------------------------------------

const TEAM_COLORS = [
  "#2dce6e",
  "#f0b429",
  "#ff9f43",
  "#4a9eff",
  "#e0e0e0",
  "#ff6b9d",
  "#a078ff",
  "#6ec1e4",
];

// ---------------------------------------------------------------------------
// Disposition select chrome (legacy .disp-select + colour modifiers)
// ---------------------------------------------------------------------------

const DISP_CLASS: Record<string, string> = {
  sold: "border-success/50 text-success",
  pres: "border-info/50 text-info",
  no_answer: "border-border",
  callback: "border-primary/50 text-primary",
  cancel: "border-destructive/40 text-destructive",
  reschedule: "border-primary/40 text-primary",
  been_rescheduled: "border-primary/40 text-primary",
};

function DispositionSelect({
  value,
  apptId,
  onSet,
  disabled,
}: {
  value: string | null;
  apptId?: string;
  onSet?: (apptId: string, disposition: string) => void;
  disabled?: boolean;
}) {
  const v = value ?? "";
  const editable = !!apptId && !!onSet && !disabled;
  const label = v
    ? DISPOSITION_LABEL[v] ?? v
    : editable
      ? "Set disposition"
      : "Disposition is set by the consultant";
  return (
    <select
      disabled={!editable}
      title={label}
      value={v}
      onChange={
        editable ? (e) => onSet!(apptId!, e.target.value) : undefined
      }
      className={cn(
        "max-w-[140px] rounded-md border bg-background px-1.5 py-1 text-[0.62rem]",
        editable
          ? "cursor-pointer opacity-100"
          : "opacity-90 pointer-events-none",
        DISP_CLASS[v] ?? "border-border text-muted-foreground",
      )}
    >
      <option value="">— Select —</option>
      {DISPOSITIONS.map((d) => (
        <option key={d.value} value={d.value}>
          {d.label}
        </option>
      ))}
    </select>
  );
}

// Dispositions that vacate the slot (lead drops into Additional Leads).
// `been_rescheduled` is excluded: a rebooked lead shows in its new slot.
function isAdditionalLead(a: ScheduleAppointment): boolean {
  return (
    !!a.cancelPending ||
    a.isAdditional ||
    ["cancel", "dnq", "not_interested", "reschedule"].includes(
      a.disposition ?? "",
    )
  );
}

const NEXT_CALL_DONE_DISPOSITIONS = new Set([
  "sold",
  "not_interested",
  "dnq",
  "cancel",
  "cancelled",
]);

// ---------------------------------------------------------------------------
// Availability wire shapes (mirror /scheduling responses)
// ---------------------------------------------------------------------------

interface SlotRecord {
  consultantId: string;
  date: string;
  hour: number;
  status: "AVAILABLE" | "UNAVAILABLE" | "HOLIDAY";
  note: string | null;
}

interface WeekSubmission {
  consultantId: string;
  weekStart: string;
  holidayDays: string[];
  submitted: boolean;
}

/** Minimal Bloome row shape needed for the booking banner. */
interface BloomeLeadSummary {
  id: string;
  firstName: string | null;
  lastName: string | null;
  mobile: string | null;
  suburb: string | null;
}

// ---------------------------------------------------------------------------
// Shared small UI bits (legacy button styles)
// ---------------------------------------------------------------------------

const WEEK_BTN =
  "px-4 py-1.5 text-[0.7rem] tracking-wide transition-colors bg-secondary text-muted-foreground hover:bg-accent";
const WEEK_BTN_ACTIVE = "!bg-primary !text-primary-foreground font-semibold";
const JUMP_BTN =
  "whitespace-nowrap rounded-md border border-primary/40 bg-secondary px-3 py-1 text-[0.62rem] text-primary transition-colors hover:bg-primary hover:text-primary-foreground";
const ADD_BTN =
  "whitespace-nowrap rounded border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[0.6rem] text-primary transition-colors hover:bg-primary hover:text-primary-foreground";
const CREATE_BTN =
  "whitespace-nowrap rounded bg-primary px-3.5 py-1 text-[0.62rem] font-semibold text-primary-foreground transition hover:brightness-110";
const EDIT_BTN =
  "whitespace-nowrap rounded border border-border bg-secondary px-2 py-0.5 text-[0.58rem] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary";
const REMOVE_BTN =
  "whitespace-nowrap rounded border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[0.58rem] text-destructive transition-colors hover:bg-destructive hover:text-white";
const CANCEL_BTN =
  "whitespace-nowrap rounded border border-border px-2 py-0.5 text-[0.58rem] text-muted-foreground transition-colors hover:text-foreground";
const CHECKLIST_BTN =
  "whitespace-nowrap rounded border border-primary/40 bg-primary/10 px-2 py-0.5 text-[0.58rem] text-primary transition-colors hover:bg-primary hover:text-primary-foreground";

/**
 * The per-appointment "Checklist" action — opens the system-recommendation
 * checklist for that booked lead. Every appointment in the schedule is a booked
 * lead, so the button shows on each row.
 */
function ChecklistButton({
  appt,
  onOpen,
}: {
  appt: ScheduleAppointment;
  onOpen?: (a: ScheduleAppointment) => void;
}) {
  if (!onOpen) return null;
  return (
    <button
      type="button"
      className={CHECKLIST_BTN}
      title="System recommendation checklist"
      onClick={() => onOpen(appt)}
    >
      Checklist
    </button>
  );
}
const ENTRY_INPUT =
  "w-full rounded border border-input bg-background px-1.5 py-1 text-[0.68rem] text-foreground focus:border-primary focus:outline-none";

// ===========================================================================
// Main component
// ===========================================================================

interface LeadsScheduleClientProps {
  consultants: ScheduleConsultant[];
  /** Optional server-fetched first paint (current week). */
  appointments?: ScheduleAppointment[];
}

export function LeadsScheduleClient({
  consultants,
  appointments: initialAppointments,
}: LeadsScheduleClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ---- Week state (legacy LG_STATE.weekOffset) ----------------------------
  const [weekOffset, setWeekOffset] = React.useState(0);
  const dates = React.useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const todayISO = fmtISO(new Date());

  // ---- Data ----------------------------------------------------------------
  const appts = useApi<ScheduleAppointment[]>(
    `/scheduling/appointments?from=${dates[0]}&to=${dates[6]}`,
  );
  const avail = useApi<SlotRecord[]>(
    `/scheduling/availability?from=${dates[0]}&to=${dates[6]}`,
  );
  const subs = useApi<WeekSubmission[]>(
    `/scheduling/availability/submissions?weekStart=${dates[0]}`,
  );

  const appointments = appts.data ?? (weekOffset === 0 ? initialAppointments ?? [] : []);

  // ---- UI state (legacy LG_STATE / LG_ENTRY_MODE / LG_EDIT_MODE) -----------
  const [activeDays, setActiveDays] = React.useState<Record<string, number>>({});
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  const [availableOnly, setAvailableOnly] = React.useState(false);
  const [heatmapCollapsed, setHeatmapCollapsed] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [searchOpen, setSearchOpen] = React.useState(false);

  const [entryDrafts, setEntryDrafts] = React.useState<Record<string, EntryDraft>>({});
  const [editDrafts, setEditDrafts] = React.useState<Record<string, EntryDraft>>({});
  const [fieldEdit, setFieldEdit] = React.useState<{
    apptId: string;
    key: keyof EntryDraft;
    value: string;
  } | null>(null);
  const [reschedule, setReschedule] = React.useState<{
    apptId: string;
    date: string;
    hour: number;
    reason: string;
  } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  // The appointment whose system-recommendation checklist is open (null = closed).
  const [checklistAppt, setChecklistAppt] = React.useState<ScheduleAppointment | null>(null);

  // Tick every 30s so next-call countdowns stay fresh (legacy interval).
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  // Reset day tabs to today when the week changes (legacy lgLoadWeek).
  React.useEffect(() => {
    const idx = todayIndex(weekOffset);
    setActiveDays(Object.fromEntries(consultants.map((c) => [c.id, idx])));
    setEntryDrafts({});
    setEditDrafts({});
    setFieldEdit(null);
    setReschedule(null);
  }, [weekOffset, consultants]);

  // ---- Bloome booking mode (?bloomeLeadId=…) — kept from current v2 -------
  const bloomeLeadId = searchParams.get("bloomeLeadId");
  const bookingLead = useApi<BloomeLeadSummary>(
    bloomeLeadId ? `/leads/bloome/${bloomeLeadId}` : null,
  );
  const bookingName = bookingLead.data
    ? [bookingLead.data.firstName, bookingLead.data.lastName].filter(Boolean).join(" ") ||
      "this lead"
    : null;

  const exitBookingMode = React.useCallback(() => {
    router.replace("/leads/leads-schedule");
  }, [router]);

  // ---- Rebook mode (?rebookApptId=…) — opens the reschedule modal for a lead
  // sent here from the No Answers tab's "Rebook" action.
  const rebookApptId = searchParams.get("rebookApptId");
  React.useEffect(() => {
    if (!rebookApptId) return;
    const firstHour = LG_SLOT_HOURS.find((h) => h <= API_LAST_BOOKABLE_HOUR) ?? 8;
    setReschedule({
      apptId: rebookApptId,
      date: dates[0] ?? todayISO,
      hour: firstHour,
      reason: "",
    });
    router.replace("/leads/leads-schedule");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rebookApptId]);

  // ---- Derived: appointments indexed per consultant per day ---------------
  const dataIndex = React.useMemo(() => {
    const m = new Map<string, Map<string, ScheduleAppointment[]>>();
    for (const c of consultants) m.set(c.id, new Map());
    for (const a of appointments) {
      const byDay = m.get(a.consultantId);
      if (!byDay) continue;
      const list = byDay.get(a.date) ?? [];
      list.push(a);
      byDay.set(a.date, list);
    }
    return m;
  }, [appointments, consultants]);

  const slotIndex = React.useMemo(() => {
    const m = new Map<string, SlotRecord>();
    for (const s of avail.data ?? []) m.set(`${s.consultantId}|${s.date}|${s.hour}`, s);
    return m;
  }, [avail.data]);

  const subIndex = React.useMemo(() => {
    const m = new Map<string, WeekSubmission>();
    for (const s of subs.data ?? []) m.set(s.consultantId, s);
    return m;
  }, [subs.data]);

  const hasSubmitted = React.useCallback(
    (cid: string) => !!subIndex.get(cid)?.submitted,
    [subIndex],
  );

  /** Mirrors the API's canBook semantics so UI and server agree. */
  const isSlotAvailable = React.useCallback(
    (cid: string, date: string, hour: number): boolean => {
      if (hour > API_LAST_BOOKABLE_HOUR) return false; // outside working hours
      const sub = subIndex.get(cid);
      const slot = slotIndex.get(`${cid}|${date}|${hour}`);
      if (sub?.holidayDays.includes(date)) return false;
      if (slot?.status === "HOLIDAY") return false;
      // Strict model: no submission for the week → nothing bookable. Only
      // explicitly AVAILABLE hours inside a submitted week accept leads.
      if (!sub?.submitted) return false;
      return slot?.status === "AVAILABLE";
    },
    [slotIndex, subIndex],
  );

  const slotAppointments = React.useCallback(
    (cid: string, date: string, hour: number): ScheduleAppointment[] =>
      (dataIndex.get(cid)?.get(date) ?? []).filter(
        (a) => !isAdditionalLead(a) && a.hour === hour && a.minute === 0,
      ),
    [dataIndex],
  );

  // ---- Navigation helpers ---------------------------------------------------
  const scrollToConsultant = React.useCallback((cid: string) => {
    document
      .getElementById(`lg-section-${cid}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const jumpTo = React.useCallback(
    (cid: string, dayIdx: number) => {
      setCollapsed((c) => ({ ...c, [cid]: false }));
      setActiveDays((d) => ({ ...d, [cid]: dayIdx }));
      setAvailableOnly(false);
      setTimeout(() => scrollToConsultant(cid), 60);
    },
    [scrollToConsultant],
  );

  /** Legacy lgJumpNext / jumpToConsultantNextAvail. */
  const jumpNext = React.useCallback(
    (filter: "any" | "day" | "evening" | "weekend", onlyCid?: string) => {
      const startIdx = weekOffset === 0 ? todayIndex(0) : 0;
      for (let i = startIdx; i < 7; i++) {
        const date = dates[i];
        const dow = new Date(`${date}T12:00:00`).getDay();
        if (filter === "weekend" && dow !== 0 && dow !== 6) continue;
        for (const c of consultants) {
          if (onlyCid && c.id !== onlyCid) continue;
          for (const hour of LG_SLOT_HOURS) {
            if (filter === "evening" && hour < 17) continue;
            if (filter === "day" && hour >= 17) continue;
            if (!isSlotAvailable(c.id, date, hour)) continue;
            if (slotAppointments(c.id, date, hour).length > 0) continue;
            jumpTo(c.id, i);
            return;
          }
        }
      }
    },
    [consultants, dates, isSlotAvailable, jumpTo, slotAppointments, weekOffset],
  );

  // ---- Mutations -------------------------------------------------------------
  const reload = React.useCallback(() => {
    appts.reload();
    avail.reload();
    subs.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appts.reload, avail.reload, subs.reload]);

  const createLead = React.useCallback(
    async (cid: string, date: string, slotIdx: number) => {
      const key = `${cid}_${date}_${slotIdx}`;
      const draft = entryDrafts[key];
      if (!draft) return;
      if (!draft.firstName.trim() || !draft.lastName.trim() || !draft.phone.trim()) {
        setActionError("First Name, Surname and Phone are required.");
        return;
      }
      setBusy(true);
      setActionError(null);
      try {
        await apiPost("/scheduling/appointments", {
          consultantId: cid,
          date,
          hour: LG_SLOT_HOURS[slotIdx],
          minute: 0,
          ...Object.fromEntries(
            Object.entries(draft).map(([k, v]) => [k, v.trim() || null]),
          ),
        });
        setEntryDrafts((d) => {
          const out = { ...d };
          delete out[key];
          return out;
        });
        reload();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Failed to create lead");
      } finally {
        setBusy(false);
      }
    },
    [entryDrafts, reload],
  );

  const saveEdit = React.useCallback(
    async (appt: ScheduleAppointment) => {
      const draft = editDrafts[appt.id];
      if (!draft) return;
      setBusy(true);
      setActionError(null);
      try {
        await apiPatch(`/scheduling/appointments/${appt.id}`, {
          ...Object.fromEntries(
            Object.entries(draft).map(([k, v]) => [k, v.trim() || null]),
          ),
        });
        setEditDrafts((d) => {
          const out = { ...d };
          delete out[appt.id];
          return out;
        });
        reload();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Failed to save changes");
      } finally {
        setBusy(false);
      }
    },
    [editDrafts, reload],
  );

  const saveFieldEdit = React.useCallback(async () => {
    if (!fieldEdit) return;
    setBusy(true);
    setActionError(null);
    try {
      await apiPatch(`/scheduling/appointments/${fieldEdit.apptId}`, {
        [fieldEdit.key]: fieldEdit.value.trim() || null,
      });
      setFieldEdit(null);
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }, [fieldEdit, reload]);

  const removeLead = React.useCallback(
    async (appt: ScheduleAppointment) => {
      const name = [appt.firstName, appt.lastName].filter(Boolean).join(" ") || "this lead";
      if (!window.confirm(`Remove ${name} from the schedule?`)) return;
      setBusy(true);
      setActionError(null);
      try {
        await apiDelete(`/scheduling/appointments/${appt.id}`);
        reload();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Failed to remove lead");
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  const commitReschedule = React.useCallback(async () => {
    if (!reschedule) return;
    setBusy(true);
    setActionError(null);
    try {
      await apiPatch(`/scheduling/appointments/${reschedule.apptId}`, {
        date: reschedule.date,
        hour: reschedule.hour,
        minute: 0,
        rescheduleReason: reschedule.reason || null,
        // Rebooking resolves a RESCHEDULE: the lead lands in its new slot,
        // badged "Has Been Rescheduled".
        disposition: "been_rescheduled",
      });
      setReschedule(null);
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to reschedule");
    } finally {
      setBusy(false);
    }
  }, [reschedule, reload]);

  // Set a lead's disposition from the schedule. A VACATING value (e.g.
  // "reschedule") empties the slot server-side and moves the row to Additional
  // Leads; "reschedule" also notifies the lead-gen who booked it to rebook.
  const setDisposition = React.useCallback(
    async (apptId: string, disposition: string) => {
      if (!disposition) return;
      setBusy(true);
      setActionError(null);
      try {
        await apiPatch(`/scheduling/appointments/${apptId}`, { disposition });
        reload();
      } catch (e) {
        setActionError(
          e instanceof Error ? e.message : "Failed to set disposition",
        );
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  const bookBloomeSlot = React.useCallback(
    async (cid: string, date: string, hour: number) => {
      if (!bloomeLeadId) return;
      setBusy(true);
      setActionError(null);
      try {
        await apiPost(`/leads/bloome/${bloomeLeadId}/book`, {
          consultantId: cid,
          date,
          hour,
          minute: 0,
        });
        router.replace("/leads/leads-schedule");
        reload();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Booking failed");
      } finally {
        setBusy(false);
      }
    },
    [bloomeLeadId, reload, router],
  );

  // ---- Search ---------------------------------------------------------------
  const searchResults = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return appointments
      .filter((a) =>
        [a.firstName, a.lastName, a.phone, a.email, a.address, a.suburb, a.postcode]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      )
      .slice(0, 20);
  }, [appointments, search]);

  // ---- Week label for non-standard offsets (legacy lgSetWeek) ----------------
  const weekLabel =
    weekOffset === 0 || weekOffset === 1
      ? ""
      : `${dates[0].split("-").slice(1).join("/")} – ${dates[4].split("-").slice(1).join("/")}`;

  const globalDay = activeDays[consultants[0]?.id ?? ""] ?? 0;
  const loadErrors = [appts.error, avail.error, subs.error].filter(Boolean) as string[];
  const colorOf = (cid: string) =>
    TEAM_COLORS[Math.max(0, consultants.findIndex((c) => c.id === cid)) % TEAM_COLORS.length];

  // ===========================================================================
  // Render
  // ===========================================================================

  return (
    <div className="pb-10">
      {/* ── Bloome booking banner (v2 flow, kept) ── */}
      {bloomeLeadId && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/5 px-4 py-3">
          <div className="text-sm">
            <span className="font-semibold">Booking{bookingName ? ` ${bookingName}` : "…"}</span>{" "}
            <span className="text-muted-foreground">
              {bookingLead.error
                ? `— ${bookingLead.error}`
                : "— choose an open slot below to commit this lead to that consultant's timeline."}
              {bookingLead.data?.mobile ? ` (${bookingLead.data.mobile})` : ""}
            </span>
          </div>
          <button type="button" className={CANCEL_BTN} onClick={exitBookingMode}>
            ✕ Cancel booking
          </button>
        </div>
      )}

      {/* ── 1. Week toggle + quick jumps + reload (legacy topbar controls) ── */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center overflow-hidden rounded-lg border border-border">
          <button
            type="button"
            className={WEEK_BTN}
            title="Previous week"
            onClick={() => setWeekOffset((o) => o - 1)}
          >
            ◀
          </button>
          <button
            type="button"
            className={cn(WEEK_BTN, weekOffset === 0 && WEEK_BTN_ACTIVE)}
            onClick={() => setWeekOffset(0)}
          >
            This Week
          </button>
          <button
            type="button"
            className={cn(WEEK_BTN, weekOffset === 1 && WEEK_BTN_ACTIVE)}
            onClick={() => setWeekOffset(1)}
          >
            Next Week
          </button>
          <button
            type="button"
            className={WEEK_BTN}
            title="Next week"
            onClick={() => setWeekOffset((o) => o + 1)}
          >
            ▶
          </button>
        </div>
        {weekLabel && (
          <span className="text-[0.6rem] text-muted-foreground">{weekLabel}</span>
        )}
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={JUMP_BTN} onClick={() => jumpNext("any")}>
            Next Available
          </button>
          <button type="button" className={JUMP_BTN} onClick={() => jumpNext("day")}>
            Next Day
          </button>
          <button type="button" className={JUMP_BTN} onClick={() => jumpNext("evening")}>
            Next Evening
          </button>
          <button type="button" className={JUMP_BTN} onClick={() => jumpNext("weekend")}>
            Next Weekend
          </button>
        </div>
        <button
          type="button"
          onClick={reload}
          className="ml-auto rounded-md border border-border px-3.5 py-1.5 text-[0.65rem] font-semibold text-primary hover:bg-accent"
          title="Reload all lead data"
        >
          ↻ Reload
        </button>
      </div>

      {/* ── 2. Consultant availability pills (#lg-avail-header) ── */}
      <div className="mb-4 flex flex-wrap gap-2 border-b border-border pb-3">
        {consultants.map((c) => {
          const col = colorOf(c.id);
          return (
            <div
              key={c.id}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-border bg-card px-2.5 py-1.5 text-[0.65rem] transition-colors hover:border-primary/40"
              style={{ borderLeft: `3px solid ${col}` }}
            >
              <button
                type="button"
                className="text-[0.7rem] font-bold hover:underline underline-offset-2"
                style={{ color: col }}
                onClick={() => scrollToConsultant(c.id)}
              >
                {c.name}
              </button>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  className="rounded border border-success/25 bg-success/10 px-2 py-0.5 text-[0.5rem] font-semibold text-success transition hover:scale-105"
                  onClick={() => jumpNext("any", c.id)}
                >
                  Next Avail ▸
                </button>
                <button
                  type="button"
                  className="rounded border px-2 py-0.5 text-[0.5rem] font-semibold transition hover:scale-105 border-[#a078ff]/25 bg-[#a078ff]/10 text-[#a078ff]"
                  onClick={() => jumpNext("evening", c.id)}
                >
                  Next Evening ▸
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Error diagnostic banner (legacy Build BJ) ── */}
      {(loadErrors.length > 0 || actionError) && (
        <div className="mb-3 flex items-center gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5">
          <span className="text-xl">⚠️</span>
          <div>
            <div className="text-[0.75rem] font-semibold text-destructive">
              {actionError ? "Action failed" : "Data Loading Issues"}
            </div>
            <div className="mt-0.5 text-[0.62rem] text-muted-foreground">
              {actionError ?? `Some data could not be loaded: ${loadErrors.join("; ")}`}
            </div>
            {!actionError && (
              <button type="button" className={cn(CREATE_BTN, "mt-1")} onClick={reload}>
                Retry
              </button>
            )}
          </div>
          {actionError && (
            <button
              type="button"
              className={cn(CANCEL_BTN, "ml-auto")}
              onClick={() => setActionError(null)}
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* ── 3. Weekly Availability Heatmap ── */}
      <div className="mb-4 overflow-hidden rounded-xl border border-border bg-card">
        <button
          type="button"
          className="flex w-full items-center justify-between border-b border-border bg-secondary px-4 py-2.5 hover:bg-accent"
          onClick={() => setHeatmapCollapsed((v) => !v)}
        >
          <span className="font-serif text-[0.95rem] tracking-wide text-primary">
            Weekly Availability Overview
          </span>
          <span
            className={cn(
              "text-muted-foreground transition-transform",
              heatmapCollapsed && "-rotate-90",
            )}
          >
            ▾
          </span>
        </button>
        {!heatmapCollapsed && (
          <div className="overflow-x-auto px-4 py-3">
            <table className="w-full border-collapse text-[0.58rem]">
              <thead>
                <tr>
                  <th className="min-w-[100px] py-1 pr-2 text-left font-semibold text-muted-foreground">
                    Consultant
                  </th>
                  {dates.map((dt) => {
                    const d = new Date(`${dt}T12:00:00`);
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    const isToday = dt === todayISO;
                    const isTomorrow = dt === fmtISO(tomorrow);
                    return (
                      <th
                        key={dt}
                        className={cn(
                          "min-w-[30px] whitespace-nowrap px-1 py-1 text-center text-[0.55rem] font-semibold text-muted-foreground",
                          isToday && "border-b-2 border-primary text-primary",
                          isTomorrow && "border-b-2 border-info text-info",
                        )}
                      >
                        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]}
                        <br />
                        {dt.split("-")[2]}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {consultants.map((c) => (
                  <tr key={c.id}>
                    <td className="whitespace-nowrap border-r border-border py-1 pr-2 text-[0.62rem] font-medium">
                      {c.name.split(" ")[0]}
                    </td>
                    {dates.map((dt, dayIdx) => {
                      let cls = "bg-white/5 border border-white/10";
                      let tip = `${c.name} — ${dt}: `;
                      let openLabel: number | null = null;
                      if (!hasSubmitted(c.id)) {
                        tip += "No availability submitted";
                      } else {
                        let totalAvail = 0;
                        let totalBooked = 0;
                        for (const h of LG_SLOT_HOURS) {
                          if (isSlotAvailable(c.id, dt, h)) {
                            totalAvail++;
                            if (slotAppointments(c.id, dt, h).length > 0) totalBooked++;
                          }
                        }
                        const open = totalAvail - totalBooked;
                        if (totalAvail === 0) tip += "Not available";
                        else if (open === 0) {
                          cls = "bg-destructive/50 border border-destructive/30";
                          tip += `Fully booked (${totalBooked}/${totalAvail})`;
                        } else if (totalBooked > 0) {
                          cls = "bg-warning/50 border border-warning/30";
                          tip += `${open} open, ${totalBooked} booked`;
                          openLabel = open;
                        } else {
                          cls = "bg-success/50 border border-success/30";
                          tip += `${totalAvail} slots open`;
                        }
                      }
                      return (
                        <td key={dt} className="px-1 py-0.5 text-center" title={tip}>
                          <button
                            type="button"
                            onClick={() => jumpTo(c.id, dayIdx)}
                            className={cn(
                              "mx-auto flex h-[18px] w-[22px] items-center justify-center rounded-[3px] transition-transform hover:scale-125",
                              cls,
                            )}
                          >
                            {openLabel !== null && (
                              <span className="text-[0.45rem] font-bold text-white">
                                {openLabel}
                              </span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 flex items-center gap-3 text-[0.55rem] text-muted-foreground">
              <span>
                <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-success/50 align-middle" />
                Open
              </span>
              <span>
                <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-warning/45 align-middle" />
                Partial
              </span>
              <span>
                <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-destructive/45 align-middle" />
                Full
              </span>
              <span>
                <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-white/5 align-middle" />
                N/A
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── 4. Global day navigator ── */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-lg bg-secondary px-4 py-2.5">
        <span className="mr-1 whitespace-nowrap text-[0.68rem] font-semibold text-muted-foreground">
          View Day:
        </span>
        {dates.map((dt, i) => (
          <button
            key={dt}
            type="button"
            onClick={() =>
              setActiveDays(Object.fromEntries(consultants.map((c) => [c.id, i])))
            }
            className={cn(
              "border-b-2 border-transparent px-3 py-1 text-[0.62rem] text-muted-foreground transition-colors hover:text-foreground",
              i === globalDay && "border-primary font-semibold text-primary",
            )}
          >
            {dt === todayISO ? "● " : ""}
            {fmtDayShort(dt)}
          </button>
        ))}
        {(appts.loading || avail.loading) && (
          <span className="ml-auto text-[0.55rem] italic text-muted-foreground">Loading…</span>
        )}
      </div>

      {/* ── 5. Available-only toggle + search ── */}
      <div className="mb-2.5 flex flex-wrap items-center gap-2 px-1">
        <label className="flex cursor-pointer select-none items-center gap-1.5">
          <input
            type="checkbox"
            checked={availableOnly}
            onChange={(e) => setAvailableOnly(e.target.checked)}
            className="h-[15px] w-[15px] cursor-pointer accent-[hsl(var(--primary))]"
          />
          <span className="text-[0.68rem] font-semibold text-primary">
            Show Available Slots Only
          </span>
        </label>
        {availableOnly && (
          <span className="ml-1 text-[0.58rem] italic text-muted-foreground">
            Weekly view · Available slots only
          </span>
        )}
        <div className="relative ml-auto min-w-[220px] max-w-[350px] flex-1">
          <input
            type="text"
            placeholder="Search leads..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSearchOpen(true);
            }}
            onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
            onFocus={() => setSearchOpen(true)}
            className="w-full rounded-lg border border-input bg-card py-1.5 pl-7 pr-2.5 text-[0.7rem] focus:border-primary focus:outline-none"
          />
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[0.75rem] text-muted-foreground">
            ⌕
          </span>
          {searchOpen && search.trim() && (
            <div className="absolute left-0 right-0 top-full z-50 max-h-[300px] overflow-y-auto rounded-lg border border-border bg-popover shadow-xl">
              {searchResults.length === 0 ? (
                <div className="px-3 py-2 text-[0.62rem] italic text-muted-foreground">
                  No matching leads this week
                </div>
              ) : (
                searchResults.map((a) => {
                  const c = consultants.find((x) => x.id === a.consultantId);
                  const dayIdx = dates.indexOf(a.date);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      className="flex w-full items-center gap-2 border-b border-border/60 px-3 py-1.5 text-left hover:bg-accent"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        if (dayIdx >= 0) jumpTo(a.consultantId, dayIdx);
                        setSearchOpen(false);
                      }}
                    >
                      <span className="text-[0.68rem] font-semibold">{a.customer}</span>
                      <span className="text-[0.58rem] text-muted-foreground">
                        {a.phone ?? ""}
                      </span>
                      <span className="ml-auto text-[0.55rem] text-primary">
                        {c?.name ?? a.consultantId} · {fmtDayShort(a.date)} ·{" "}
                        {hourLabel(a.hour)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── 6. Content ── */}
      {availableOnly ? (
        <WeeklyAvailableView
          consultants={consultants}
          dates={dates}
          todayISO={todayISO}
          isSlotAvailable={isSlotAvailable}
          slotAppointments={slotAppointments}
          entryDrafts={entryDrafts}
          setEntryDrafts={setEntryDrafts}
          createLead={createLead}
          busy={busy}
          bookingMode={!!bloomeLeadId}
          bookingName={bookingName}
          bookBloomeSlot={bookBloomeSlot}
        />
      ) : (
        consultants.map((c) => (
          <ConsultantSection
            key={c.id}
            consultant={c}
            color={colorOf(c.id)}
            dates={dates}
            todayISO={todayISO}
            activeDay={activeDays[c.id] ?? 0}
            setActiveDay={(i) => setActiveDays((d) => ({ ...d, [c.id]: i }))}
            collapsed={!!collapsed[c.id]}
            toggleCollapsed={() => setCollapsed((m) => ({ ...m, [c.id]: !m[c.id] }))}
            dayLeadsByDate={dataIndex.get(c.id) ?? new Map()}
            hasSubmitted={hasSubmitted(c.id)}
            isSlotAvailable={isSlotAvailable}
            entryDrafts={entryDrafts}
            setEntryDrafts={setEntryDrafts}
            editDrafts={editDrafts}
            setEditDrafts={setEditDrafts}
            fieldEdit={fieldEdit}
            setFieldEdit={setFieldEdit}
            saveFieldEdit={saveFieldEdit}
            setReschedule={setReschedule}
            createLead={createLead}
            saveEdit={saveEdit}
            removeLead={removeLead}
            busy={busy}
            bookingMode={!!bloomeLeadId}
            bookingName={bookingName}
            bookBloomeSlot={bookBloomeSlot}
            setDisposition={setDisposition}
            onOpenChecklist={setChecklistAppt}
          />
        ))
      )}

      {reschedule && (
        <RescheduleModal
          state={reschedule}
          setState={setReschedule}
          onConfirm={commitReschedule}
          onClose={() => setReschedule(null)}
          busy={busy}
          dates={dates}
        />
      )}

      {checklistAppt && (
        <ChecklistDialog
          leadId={checklistAppt.leadId}
          leadName={
            checklistAppt.customer ||
            [checklistAppt.firstName, checklistAppt.lastName].filter(Boolean).join(" ") ||
            "this lead"
          }
          onClose={() => setChecklistAppt(null)}
          onSaved={reload}
        />
      )}
    </div>
  );
}

// ===========================================================================
// Reschedule modal — pick a new slot + reason for a lead being rebooked.
// Confirming marks the lead "Has Been Rescheduled" (disposition
// been_rescheduled) and drops it into the chosen slot. Replaces the legacy
// inline reschedule panel.
// ===========================================================================

function RescheduleModal({
  state,
  setState,
  onConfirm,
  onClose,
  busy,
  dates,
}: {
  state: { apptId: string; date: string; hour: number; reason: string };
  setState: React.Dispatch<
    React.SetStateAction<{
      apptId: string;
      date: string;
      hour: number;
      reason: string;
    } | null>
  >;
  onConfirm: () => void;
  onClose: () => void;
  busy: boolean;
  dates: string[];
}) {
  const bookableHours = LG_SLOT_HOURS.filter((h) => h <= API_LAST_BOOKABLE_HOUR);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold">Reschedule lead</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a new day and time. The lead will be marked{" "}
          <span className="font-medium text-foreground">Has Been Rescheduled</span>{" "}
          and placed in the chosen slot.
        </p>

        <div className="mt-4 space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Day
            </label>
            <select
              value={state.date}
              onChange={(e) =>
                setState((r) => (r ? { ...r, date: e.target.value } : r))
              }
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {dates.map((dt) => (
                <option key={dt} value={dt}>
                  {fmtDayLong(dt)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Time
            </label>
            <select
              value={state.hour}
              onChange={(e) =>
                setState((r) =>
                  r ? { ...r, hour: Number(e.target.value) } : r,
                )
              }
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              {bookableHours.map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Reason
            </label>
            <select
              value={state.reason}
              onChange={(e) =>
                setState((r) => (r ? { ...r, reason: e.target.value } : r))
              }
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Reason…</option>
              <option>Customer requested</option>
              <option>Consultant unavailable</option>
              <option>No answer</option>
              <option>Other</option>
            </select>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className={CANCEL_BTN}
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className={CREATE_BTN}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Rebooking…" : "Confirm rebooking"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Weekly available-only view (legacy Build DB — day-first layout)
// ===========================================================================

function WeeklyAvailableView({
  consultants,
  dates,
  todayISO,
  isSlotAvailable,
  slotAppointments,
  entryDrafts,
  setEntryDrafts,
  createLead,
  busy,
  bookingMode,
  bookingName,
  bookBloomeSlot,
}: {
  consultants: ScheduleConsultant[];
  dates: string[];
  todayISO: string;
  isSlotAvailable: (cid: string, date: string, hour: number) => boolean;
  slotAppointments: (cid: string, date: string, hour: number) => ScheduleAppointment[];
  entryDrafts: Record<string, EntryDraft>;
  setEntryDrafts: React.Dispatch<React.SetStateAction<Record<string, EntryDraft>>>;
  createLead: (cid: string, date: string, slotIdx: number) => void;
  busy: boolean;
  bookingMode: boolean;
  bookingName: string | null;
  bookBloomeSlot: (cid: string, date: string, hour: number) => void;
}) {
  let anyDay = false;

  const blocks = dates.map((dt) => {
    const dayBlocks = consultants
      .map((c) => {
        const openSlots: number[] = [];
        const entryIdxs: number[] = [];
        LG_SLOT_HOURS.forEach((hour, slotIdx) => {
          const key = `${c.id}_${dt}_${slotIdx}`;
          const booked = slotAppointments(c.id, dt, hour).length > 0;
          if (entryDrafts[key]) entryIdxs.push(slotIdx);
          else if (isSlotAvailable(c.id, dt, hour) && !booked) openSlots.push(slotIdx);
        });
        return { consultant: c, openSlots, entryIdxs };
      })
      .filter((b) => b.openSlots.length > 0 || b.entryIdxs.length > 0);
    return { dt, dayBlocks };
  });

  return (
    <div>
      {blocks.map(({ dt, dayBlocks }) => {
        if (dayBlocks.length === 0) return null;
        anyDay = true;
        const totalSlots = dayBlocks.reduce((s, b) => s + b.openSlots.length, 0);
        return (
          <div key={dt} className="mb-3.5">
            <div className="flex items-center gap-2.5 rounded-t-lg border-l-4 border-primary bg-secondary px-4 py-2.5">
              <span className="text-[0.88rem] font-bold uppercase tracking-wide">
                {dt === todayISO ? "● " : ""}
                {fmtDayLong(dt)}
              </span>
              <span className="ml-auto text-[0.6rem] text-muted-foreground">
                {totalSlots} open slot{totalSlots === 1 ? "" : "s"} · {dayBlocks.length}{" "}
                consultant{dayBlocks.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="rounded-b-lg border border-t-0 border-border bg-card px-3 py-2">
              {dayBlocks.map(({ consultant: c, openSlots, entryIdxs }) => (
                <div key={c.id} className="border-b border-dashed border-border px-1 py-2.5 last:border-0">
                  <div className="mb-1.5 flex items-center gap-2.5">
                    <span className="text-[0.78rem] font-bold text-primary">
                      Consultant Name — {c.name}
                    </span>
                    <span className="text-[0.55rem] text-muted-foreground">
                      {c.region ?? ""}
                    </span>
                    <span className="ml-auto text-[0.55rem] text-muted-foreground/60">
                      {openSlots.length} open
                    </span>
                  </div>

                  {/* Active entry-mode rows */}
                  {entryIdxs.map((slotIdx) => {
                    const key = `${c.id}_${dt}_${slotIdx}`;
                    const draft = entryDrafts[key] ?? EMPTY_DRAFT;
                    return (
                      <div key={key} className="mb-1 rounded-md bg-secondary px-2 py-1.5">
                        <div className="mb-1 text-[0.62rem] font-semibold text-primary">
                          {LG_TIME_SLOTS[slotIdx]}
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          {ENTRY_FIELDS.map((f) =>
                            f.type === "select" ? (
                              <select
                                key={f.key}
                                value={draft[f.key]}
                                onChange={(e) =>
                                  setEntryDrafts((d) => ({
                                    ...d,
                                    [key]: { ...(d[key] ?? EMPTY_DRAFT), [f.key]: e.target.value },
                                  }))
                                }
                                className="rounded border border-input bg-card px-1 py-0.5 text-[0.6rem]"
                              >
                                {f.options!.map((o) => (
                                  <option key={o} value={o}>
                                    {o || "—"}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                key={f.key}
                                type="text"
                                placeholder={`${f.label}${f.required ? " *" : ""}`}
                                value={draft[f.key]}
                                onChange={(e) =>
                                  setEntryDrafts((d) => ({
                                    ...d,
                                    [key]: { ...(d[key] ?? EMPTY_DRAFT), [f.key]: e.target.value },
                                  }))
                                }
                                className="w-[110px] rounded border border-input bg-card px-1 py-0.5 text-[0.6rem]"
                              />
                            ),
                          )}
                          <button
                            type="button"
                            className={CREATE_BTN}
                            disabled={busy}
                            onClick={() => createLead(c.id, dt, slotIdx)}
                          >
                            Create
                          </button>
                          <button
                            type="button"
                            className={CANCEL_BTN}
                            onClick={() =>
                              setEntryDrafts((d) => {
                                const out = { ...d };
                                delete out[key];
                                return out;
                              })
                            }
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Open-slot chips */}
                  {openSlots.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {openSlots.map((slotIdx) => (
                        <button
                          key={slotIdx}
                          type="button"
                          title={
                            bookingMode
                              ? `Book ${bookingName ?? "lead"} at ${LG_TIME_SLOTS[slotIdx]}`
                              : `Book a lead at ${LG_TIME_SLOTS[slotIdx]}`
                          }
                          className="rounded-full border border-success/50 bg-success/10 px-2.5 py-1 text-[0.62rem] font-semibold text-success hover:bg-success/20"
                          onClick={() => {
                            if (bookingMode) {
                              bookBloomeSlot(c.id, dt, LG_SLOT_HOURS[slotIdx]);
                            } else {
                              const key = `${c.id}_${dt}_${slotIdx}`;
                              setEntryDrafts((d) => ({ ...d, [key]: { ...EMPTY_DRAFT } }));
                            }
                          }}
                        >
                          + {LG_TIME_SLOTS[slotIdx]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {!anyDay && (
        <div className="px-8 py-8 text-center text-[0.75rem] italic text-muted-foreground">
          No open slots this week across the team.
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Per-consultant section (legacy .lg-consultant-section)
// ===========================================================================

function ConsultantSection({
  consultant,
  color,
  dates,
  todayISO,
  activeDay,
  setActiveDay,
  collapsed,
  toggleCollapsed,
  dayLeadsByDate,
  hasSubmitted,
  isSlotAvailable,
  entryDrafts,
  setEntryDrafts,
  editDrafts,
  setEditDrafts,
  fieldEdit,
  setFieldEdit,
  saveFieldEdit,
  setReschedule,
  createLead,
  saveEdit,
  removeLead,
  busy,
  bookingMode,
  bookingName,
  bookBloomeSlot,
  setDisposition,
  onOpenChecklist,
}: {
  consultant: ScheduleConsultant;
  color: string;
  dates: string[];
  todayISO: string;
  activeDay: number;
  setActiveDay: (i: number) => void;
  collapsed: boolean;
  toggleCollapsed: () => void;
  dayLeadsByDate: Map<string, ScheduleAppointment[]>;
  hasSubmitted: boolean;
  isSlotAvailable: (cid: string, date: string, hour: number) => boolean;
  entryDrafts: Record<string, EntryDraft>;
  setEntryDrafts: React.Dispatch<React.SetStateAction<Record<string, EntryDraft>>>;
  editDrafts: Record<string, EntryDraft>;
  setEditDrafts: React.Dispatch<React.SetStateAction<Record<string, EntryDraft>>>;
  fieldEdit: { apptId: string; key: keyof EntryDraft; value: string } | null;
  setFieldEdit: React.Dispatch<
    React.SetStateAction<{ apptId: string; key: keyof EntryDraft; value: string } | null>
  >;
  saveFieldEdit: () => void;
  setReschedule: React.Dispatch<
    React.SetStateAction<{ apptId: string; date: string; hour: number; reason: string } | null>
  >;
  createLead: (cid: string, date: string, slotIdx: number) => void;
  saveEdit: (a: ScheduleAppointment) => void;
  removeLead: (a: ScheduleAppointment) => void;
  busy: boolean;
  bookingMode: boolean;
  bookingName: string | null;
  bookBloomeSlot: (cid: string, date: string, hour: number) => void;
  setDisposition: (apptId: string, disposition: string) => void;
  onOpenChecklist?: (a: ScheduleAppointment) => void;
}) {
  const cid = consultant.id;
  const activeDate = dates[activeDay];
  const dayLeads = dayLeadsByDate.get(activeDate) ?? [];
  const totalBooked = dates.reduce((s, dt) => s + (dayLeadsByDate.get(dt)?.length ?? 0), 0);

  // ---- Next-call badge (legacy buildNextCallBadge) -------------------------
  const nextCall = React.useMemo(() => {
    const todayLeads = dayLeadsByDate.get(todayISO) ?? [];
    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    let best: ScheduleAppointment | null = null;
    let bestMins = Infinity;
    for (const l of todayLeads) {
      if (NEXT_CALL_DONE_DISPOSITIONS.has((l.disposition ?? "").toLowerCase())) continue;
      const mins = l.hour * 60 + l.minute;
      if (mins >= nowMins && mins < bestMins) {
        best = l;
        bestMins = mins;
      }
    }
    if (!best) return null;
    return { lead: best, diff: bestMins - nowMins };
  }, [dayLeadsByDate, todayISO]);

  const cancelledLeadsForDay = dayLeads.filter(isAdditionalLead);
  const activeLeads = dayLeads.filter((l) => !isAdditionalLead(l));

  // Leads whose time doesn't match a standard hourly slot.
  const unmatched = activeLeads.filter(
    (l) => l.minute !== 0 || !LG_SLOT_HOURS.includes(l.hour),
  );

  return (
    <div
      id={`lg-section-${cid}`}
      className="mb-7 overflow-hidden rounded-xl border border-border bg-card scroll-mt-4"
    >
      {/* Header */}
      <button
        type="button"
        onClick={toggleCollapsed}
        className="flex w-full items-center justify-between border-b border-border bg-secondary px-5 py-3 text-left hover:bg-accent"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-serif text-base tracking-wide" style={{ color }}>
            {consultant.name}
          </span>
          <span className="text-[0.62rem] text-muted-foreground">
            {consultant.region ?? "Consultant"} · {totalBooked} leads booked
          </span>
          {/* Next-call badge */}
          {nextCall ? (
            <span
              className={cn(
                "ml-2 inline-flex items-center gap-1 whitespace-nowrap rounded-xl border px-2.5 py-0.5 text-[0.58rem] font-semibold",
                nextCall.diff <= 5
                  ? "animate-pulse border-destructive/25 bg-destructive/10 text-destructive"
                  : nextCall.diff <= 15
                    ? "border-warning/25 bg-warning/10 text-warning"
                    : "border-success/25 bg-success/10 text-success",
              )}
            >
              <span className="text-[0.52rem]">📞</span>
              {nextCall.lead.firstName || "Next call"}
              {nextCall.diff <= 0
                ? " — NOW"
                : ` in ${
                    nextCall.diff >= 60
                      ? `${Math.floor(nextCall.diff / 60)}h ${nextCall.diff % 60}m`
                      : `${nextCall.diff}m`
                  }`}
            </span>
          ) : (
            <span className="ml-2 inline-flex items-center gap-1 whitespace-nowrap rounded-xl border border-border bg-white/5 px-2.5 py-0.5 text-[0.58rem] font-semibold text-muted-foreground/60">
              <span className="text-[0.52rem]">✓</span> No more calls today
            </span>
          )}
        </div>
        <span
          className={cn(
            "text-muted-foreground transition-transform",
            collapsed && "-rotate-90",
          )}
        >
          ▾
        </span>
      </button>

      {!collapsed && (
        <>
          {/* Day tabs */}
          <div className="flex overflow-x-auto border-b border-border bg-card px-4">
            {dates.map((dt, i) => {
              const count = dayLeadsByDate.get(dt)?.length ?? 0;
              return (
                <button
                  key={dt}
                  type="button"
                  onClick={() => setActiveDay(i)}
                  className={cn(
                    "whitespace-nowrap border-b-2 border-transparent px-3.5 py-2 text-[0.65rem] text-muted-foreground transition-colors hover:text-foreground",
                    i === activeDay && "border-primary font-semibold text-primary",
                  )}
                >
                  {dt === todayISO ? "● " : ""}
                  {fmtDayShort(dt)}
                  {count > 0 && (
                    <span className="ml-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[0.55rem] font-bold text-primary">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Day content */}
          <div className="overflow-x-auto px-4 py-3">
            {!hasSubmitted && (
              <div className="mb-2.5 flex items-center gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5">
                <span className="text-xl">🚫</span>
                <div>
                  <span className="text-[0.75rem] font-semibold text-destructive">
                    Availability Not Submitted
                  </span>
                  <div className="mt-0.5 text-[0.62rem] text-muted-foreground">
                    {consultant.name} has not submitted availability for this week.
                  </div>
                </div>
              </div>
            )}

            <table className="w-full min-w-[1100px] border-collapse text-[0.75rem]">
              <thead>
                <tr>
                  {["#", "Time", "Lead Gen", "Disposition"]
                    .concat(ENTRY_FIELDS.map((f) => f.label))
                    .concat(["Actions"])
                    .map((h) => (
                      <th
                        key={h}
                        className="sticky top-0 z-[2] whitespace-nowrap border-b border-border bg-card px-2 py-1.5 text-left text-[0.58rem] uppercase tracking-widest text-muted-foreground/60"
                      >
                        {h}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {LG_SLOT_HOURS.map((hour, slotIdx) => {
                  const timeLabel = LG_TIME_SLOTS[slotIdx];
                  const slotLeads = activeLeads.filter(
                    (l) => l.hour === hour && l.minute === 0,
                  );
                  const lead = slotLeads[0] ?? null;
                  const extras = slotLeads.slice(1);
                  const entryKey = `${cid}_${activeDate}_${slotIdx}`;
                  const entryDraft = entryDrafts[entryKey];
                  const editDraft = lead ? editDrafts[lead.id] : undefined;
                  const slotAvail = isSlotAvailable(cid, activeDate, hour);

                  const rows: React.ReactNode[] = [];

                  if (entryDraft) {
                    // ── ENTRY MODE ──
                    rows.push(
                      <tr key={`entry-${entryKey}`} className="bg-secondary">
                        <td className="px-1 py-1 text-muted-foreground/40">{slotIdx + 1}</td>
                        <td className="whitespace-nowrap px-1 py-1 font-semibold text-primary">
                          {timeLabel}
                        </td>
                        <td className="px-1 py-1 text-[0.65rem] text-muted-foreground">—</td>
                        <td className="px-1 py-1 text-[0.62rem] italic text-muted-foreground/40">
                          —
                        </td>
                        {ENTRY_FIELDS.map((f) => (
                          <td key={f.key} className="px-1 py-1">
                            {f.type === "select" ? (
                              <select
                                value={entryDraft[f.key]}
                                onChange={(e) =>
                                  setEntryDrafts((d) => ({
                                    ...d,
                                    [entryKey]: { ...d[entryKey], [f.key]: e.target.value },
                                  }))
                                }
                                className={ENTRY_INPUT}
                              >
                                {f.options!.map((o) => (
                                  <option key={o} value={o}>
                                    {o || "—"}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type={f.key === "email" ? "email" : "text"}
                                placeholder={`${f.label}${f.required ? " *" : ""}`}
                                maxLength={f.key === "postcode" ? 4 : undefined}
                                value={entryDraft[f.key]}
                                autoFocus={f.key === "firstName"}
                                onChange={(e) =>
                                  setEntryDrafts((d) => ({
                                    ...d,
                                    [entryKey]: { ...d[entryKey], [f.key]: e.target.value },
                                  }))
                                }
                                className={cn(ENTRY_INPUT, f.width)}
                              />
                            )}
                          </td>
                        ))}
                        <td className="whitespace-nowrap px-1 py-1">
                          <div className="flex gap-1">
                            <button
                              type="button"
                              className={CREATE_BTN}
                              disabled={busy}
                              onClick={() => createLead(cid, activeDate, slotIdx)}
                            >
                              Create Lead
                            </button>
                            <button
                              type="button"
                              className={CANCEL_BTN}
                              onClick={() =>
                                setEntryDrafts((d) => {
                                  const out = { ...d };
                                  delete out[entryKey];
                                  return out;
                                })
                              }
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>,
                    );
                  } else if (lead && editDraft) {
                    // ── EDIT MODE ──
                    rows.push(
                      <tr key={`edit-${lead.id}`} className="bg-secondary">
                        <td className="px-1 py-1 text-muted-foreground/40">{slotIdx + 1}</td>
                        <td className="whitespace-nowrap px-1 py-1 font-semibold text-primary">
                          {timeLabel}
                        </td>
                        <td className="px-1 py-1 text-[0.65rem] text-muted-foreground">
                          {lead.bookedByName ?? "—"}
                        </td>
                        <td className="px-1 py-1">
                          <DispositionSelect
                            value={lead.disposition}
                            apptId={lead.id}
                            onSet={setDisposition}
                            disabled={busy}
                          />
                        </td>
                        {ENTRY_FIELDS.map((f) => (
                          <td key={f.key} className="px-1 py-1">
                            {f.type === "select" ? (
                              <select
                                value={editDraft[f.key]}
                                onChange={(e) =>
                                  setEditDrafts((d) => ({
                                    ...d,
                                    [lead.id]: { ...d[lead.id], [f.key]: e.target.value },
                                  }))
                                }
                                className={ENTRY_INPUT}
                              >
                                {f.options!.map((o) => (
                                  <option key={o} value={o}>
                                    {o || "—"}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type={f.key === "email" ? "email" : "text"}
                                value={editDraft[f.key]}
                                maxLength={f.key === "postcode" ? 4 : undefined}
                                onChange={(e) =>
                                  setEditDrafts((d) => ({
                                    ...d,
                                    [lead.id]: { ...d[lead.id], [f.key]: e.target.value },
                                  }))
                                }
                                className={cn(ENTRY_INPUT, f.width)}
                              />
                            )}
                          </td>
                        ))}
                        <td className="whitespace-nowrap px-1 py-1">
                          <div className="flex gap-1">
                            <button
                              type="button"
                              className={CREATE_BTN}
                              disabled={busy}
                              onClick={() => saveEdit(lead)}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className={CANCEL_BTN}
                              onClick={() =>
                                setEditDrafts((d) => {
                                  const out = { ...d };
                                  delete out[lead.id];
                                  return out;
                                })
                              }
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>,
                    );
                  } else if (lead) {
                    // ── FILLED SLOT ──
                    rows.push(
                      <tr
                        key={lead.id}
                        className="transition-colors hover:bg-white/[0.06] [&>td]:border-b [&>td]:border-white/10"
                      >
                        <td className="px-2 py-1.5 text-muted-foreground/40">{slotIdx + 1}</td>
                        <td className="whitespace-nowrap px-2 py-1.5 font-semibold text-primary">
                          {timeLabel}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-[0.65rem] text-primary">
                          {lead.bookedByName ?? "—"}
                        </td>
                        <td className="px-2 py-1.5">
                          <DispositionSelect
                            value={lead.disposition}
                            apptId={lead.id}
                            onSet={setDisposition}
                            disabled={busy}
                          />
                        </td>
                        {ENTRY_FIELDS.map((f) => {
                          const isEditing =
                            fieldEdit?.apptId === lead.id && fieldEdit.key === f.key;
                          const val = draftFromAppt(lead)[f.key];
                          return (
                            <td
                              key={f.key}
                              title="Click to edit"
                              className="cursor-pointer px-2 py-1.5 hover:rounded hover:bg-primary/5"
                              onClick={() =>
                                !isEditing &&
                                setFieldEdit({ apptId: lead.id, key: f.key, value: val })
                              }
                            >
                              {isEditing ? (
                                <input
                                  autoFocus
                                  type="text"
                                  value={fieldEdit.value}
                                  onChange={(e) =>
                                    setFieldEdit((fe) =>
                                      fe ? { ...fe, value: e.target.value } : fe,
                                    )
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") saveFieldEdit();
                                    if (e.key === "Escape") setFieldEdit(null);
                                  }}
                                  onBlur={saveFieldEdit}
                                  className="w-full rounded border border-primary bg-background px-1 py-0.5 text-[0.68rem] focus:outline-none"
                                />
                              ) : (
                                val || <span className="text-muted-foreground/40">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="whitespace-nowrap px-2 py-1.5">
                          <button
                            type="button"
                            className={EDIT_BTN}
                            onClick={() =>
                              setEditDrafts((d) => ({ ...d, [lead.id]: draftFromAppt(lead) }))
                            }
                          >
                            Edit
                          </button>{" "}
                          <button
                            type="button"
                            className={cn(EDIT_BTN, "bg-info/10 text-info border-info/30")}
                            onClick={() =>
                              setReschedule({
                                apptId: lead.id,
                                date: activeDate,
                                hour,
                                reason: "",
                              })
                            }
                          >
                            Reschedule
                          </button>{" "}
                          <button
                            type="button"
                            className={REMOVE_BTN}
                            disabled={busy}
                            onClick={() => removeLead(lead)}
                          >
                            ✕
                          </button>{" "}
                          <ChecklistButton appt={lead} onOpen={onOpenChecklist} />
                        </td>
                      </tr>,
                    );
                    // Reschedule is performed via the RescheduleModal (rendered
                    // once at the top level), driven by the `reschedule` state.
                  } else if (!slotAvail) {
                    // ── UNAVAILABLE SLOT ──
                    rows.push(
                      <tr
                        key={`unavail-${slotIdx}`}
                        className="opacity-35 [&>td]:border-b [&>td]:border-white/10 [&>td]:bg-white/[0.015]"
                        style={{ borderLeft: "3px solid rgba(239,68,68,0.25)" }}
                      >
                        <td className="px-2 py-1.5 text-muted-foreground/40">{slotIdx + 1}</td>
                        <td className="whitespace-nowrap px-2 py-1.5">{timeLabel}</td>
                        <td colSpan={ENTRY_FIELDS.length + 2} className="px-2 py-1.5">
                          <span className="text-[0.52rem] font-semibold uppercase tracking-widest text-destructive">
                            Unavailable
                          </span>
                        </td>
                        <td />
                      </tr>,
                    );
                  } else {
                    // ── EMPTY AVAILABLE SLOT ──
                    rows.push(
                      <tr
                        key={`empty-${slotIdx}`}
                        className="italic text-primary transition-colors hover:bg-primary/10 [&>td]:border-b [&>td]:border-white/10 [&>td]:bg-primary/[0.06]"
                        style={{ borderLeft: "3px solid rgba(212,175,55,0.45)" }}
                      >
                        <td className="px-2 py-1.5 not-italic text-muted-foreground/40">
                          {slotIdx + 1}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5">{timeLabel}</td>
                        <td colSpan={ENTRY_FIELDS.length + 2} />
                        <td className="px-2 py-1.5 not-italic">
                          <button
                            type="button"
                            className={cn(
                              ADD_BTN,
                              bookingMode &&
                                "border-success/50 bg-success/10 text-success hover:bg-success hover:text-white",
                            )}
                            onClick={() => {
                              if (bookingMode) bookBloomeSlot(cid, activeDate, hour);
                              else
                                setEntryDrafts((d) => ({
                                  ...d,
                                  [`${cid}_${activeDate}_${slotIdx}`]: { ...EMPTY_DRAFT },
                                }));
                            }}
                          >
                            {bookingMode
                              ? `+ Book ${bookingName ?? "lead"} here`
                              : "+ Enter Lead"}
                          </button>
                        </td>
                      </tr>,
                    );
                  }

                  // ── STACKED extras (legacy Build FC) ──
                  extras.forEach((extra) => {
                    rows.push(
                      <tr
                        key={extra.id}
                        className="bg-primary/[0.04] [&>td]:border-b [&>td]:border-white/10"
                      >
                        <td className="px-2 py-1.5 text-muted-foreground/40">↳</td>
                        <td className="whitespace-nowrap px-2 py-1.5 font-semibold text-primary">
                          {timeLabel}{" "}
                          <span className="ml-1 inline-block rounded-lg border border-primary/45 bg-primary/15 px-1 py-px text-[0.5rem] font-bold tracking-wide text-primary">
                            🧷 STACKED
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-[0.65rem] text-primary">
                          {extra.bookedByName ?? "—"}
                        </td>
                        <td className="px-2 py-1.5">
                          <DispositionSelect
                            value={extra.disposition}
                            apptId={extra.id}
                            onSet={setDisposition}
                            disabled={busy}
                          />
                        </td>
                        {ENTRY_FIELDS.map((f) => (
                          <td key={f.key} className="px-2 py-1.5 text-[0.68rem]">
                            {draftFromAppt(extra)[f.key] || (
                              <span className="text-muted-foreground/40">—</span>
                            )}
                          </td>
                        ))}
                        <td className="whitespace-nowrap px-2 py-1.5">
                          <button
                            type="button"
                            className={EDIT_BTN}
                            title="Edit this stacked lead"
                            onClick={() =>
                              setEditDrafts((d) => ({
                                ...d,
                                [extra.id]: draftFromAppt(extra),
                              }))
                            }
                          >
                            Edit
                          </button>{" "}
                          <ChecklistButton appt={extra} onOpen={onOpenChecklist} />
                        </td>
                      </tr>,
                    );
                    // Stacked edit row
                    if (editDrafts[extra.id]) {
                      rows.push(
                        <tr key={`edit-${extra.id}`} className="bg-secondary">
                          <td className="px-1 py-1 text-muted-foreground/40">↳</td>
                          <td className="whitespace-nowrap px-1 py-1 font-semibold text-primary">
                            {timeLabel}
                          </td>
                          <td className="px-1 py-1 text-[0.65rem] text-muted-foreground">
                            {extra.bookedByName ?? "—"}
                          </td>
                          <td className="px-1 py-1">
                            <DispositionSelect
                            value={extra.disposition}
                            apptId={extra.id}
                            onSet={setDisposition}
                            disabled={busy}
                          />
                          </td>
                          {ENTRY_FIELDS.map((f) => (
                            <td key={f.key} className="px-1 py-1">
                              <input
                                type="text"
                                value={editDrafts[extra.id][f.key]}
                                onChange={(e) =>
                                  setEditDrafts((d) => ({
                                    ...d,
                                    [extra.id]: { ...d[extra.id], [f.key]: e.target.value },
                                  }))
                                }
                                className={cn(ENTRY_INPUT, f.width)}
                              />
                            </td>
                          ))}
                          <td className="whitespace-nowrap px-1 py-1">
                            <div className="flex gap-1">
                              <button
                                type="button"
                                className={CREATE_BTN}
                                disabled={busy}
                                onClick={() => saveEdit(extra)}
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                className={CANCEL_BTN}
                                onClick={() =>
                                  setEditDrafts((d) => {
                                    const out = { ...d };
                                    delete out[extra.id];
                                    return out;
                                  })
                                }
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>,
                      );
                    }
                  });

                  return rows;
                })}

                {/* ── UNMATCHED (non-standard times) ── */}
                {unmatched.length > 0 && (
                  <>
                    <tr>
                      <td
                        colSpan={ENTRY_FIELDS.length + 5}
                        className="border-t border-border px-1 pb-1 pt-2 text-[0.65rem] font-semibold tracking-wider text-primary"
                      >
                        ADDITIONAL LEADS (non-standard times)
                      </td>
                    </tr>
                    {unmatched.map((l, ui) => (
                      <tr key={l.id} className="[&>td]:border-b [&>td]:border-white/10">
                        <td className="px-2 py-1.5 text-muted-foreground/40">
                          {LG_SLOT_HOURS.length + ui + 1}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-primary">
                          {hourLabel(l.hour).replace(":00", `:${String(l.minute).padStart(2, "0")}`)}
                        </td>
                        <td className="px-2 py-1.5 text-[0.65rem] text-primary">
                          {l.bookedByName ?? "—"}
                        </td>
                        <td className="px-2 py-1.5">
                          <DispositionSelect
                            value={l.disposition}
                            apptId={l.id}
                            onSet={setDisposition}
                            disabled={busy}
                          />
                        </td>
                        {ENTRY_FIELDS.map((f) => (
                          <td key={f.key} className="px-2 py-1.5 text-[0.68rem]">
                            {draftFromAppt(l)[f.key] || (
                              <span className="text-muted-foreground/40">—</span>
                            )}
                          </td>
                        ))}
                        <td className="whitespace-nowrap px-2 py-1.5">
                          <ChecklistButton appt={l} onOpen={onOpenChecklist} />
                        </td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>

            {/* ── 📌 ADDITIONAL LEADS (cancelled / rescheduled) section ── */}
            {cancelledLeadsForDay.length > 0 && (
              <AdditionalLeadsSection
                leads={cancelledLeadsForDay}
                consultantName={consultant.name}
                date={activeDate}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ===========================================================================
// Additional Leads section (legacy lgBuildCancelledSection / Build FH)
// ===========================================================================

const DISP_META: Record<string, { label: string; cls: string }> = {
  cancel: { label: "Cancelled", cls: "border-destructive/35 bg-destructive/10 text-destructive" },
  not_interested: {
    label: "Not Interested",
    cls: "border-destructive/35 bg-destructive/10 text-destructive",
  },
  dnq: { label: "DNQ", cls: "border-destructive/35 bg-destructive/10 text-destructive" },
  reschedule: { label: "Reschedule", cls: "border-primary/40 bg-primary/10 text-primary" },
  been_rescheduled: { label: "Reschedule", cls: "border-primary/40 bg-primary/10 text-primary" },
};

function AdditionalLeadsSection({
  leads,
  consultantName,
  date,
}: {
  leads: ScheduleAppointment[];
  consultantName: string;
  date: string;
}) {
  const sorted = [...leads].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));

  const counts: Record<string, number> = {};
  for (const l of sorted) {
    const key = l.disposition === "been_rescheduled" ? "reschedule" : l.disposition ?? "cancel";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const summary = [
    counts.cancel && `${counts.cancel} cancelled`,
    counts.reschedule && `${counts.reschedule} rescheduled`,
    counts.not_interested && `${counts.not_interested} not interested`,
    counts.dnq && `${counts.dnq} DNQ`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mt-3.5 overflow-hidden rounded-[10px] border border-primary/30 bg-primary/[0.04]">
      <div className="flex items-center gap-2.5 border-b border-primary/25 bg-primary/10 px-3.5 py-2.5">
        <span className="text-[0.75rem] font-bold tracking-wide text-primary">
          📌 ADDITIONAL LEADS
        </span>
        <span className="text-[0.58rem] text-muted-foreground">
          {consultantName} · {fmtDayShort(date)}
        </span>
        <span className="ml-auto text-[0.55rem] italic text-muted-foreground/60">
          {summary} · timeslot freed
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-[0.72rem]">
          <thead>
            <tr>
              {[
                "#",
                "Time",
                "Name",
                "Phone",
                "Address",
                "Bills",
                "Source",
                "Company",
                "Notes",
                "Disposition",
              ].map((h) => (
                <th
                  key={h}
                  className="whitespace-nowrap px-2 py-1.5 text-left text-[0.58rem] uppercase tracking-widest text-muted-foreground/60"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((l, idx) => {
              const meta = DISP_META[l.disposition ?? ""] ?? DISP_META.cancel;
              const fullAddr = [l.address, l.suburb, l.state, l.postcode]
                .filter(Boolean)
                .join(", ");
              return (
                <tr key={l.id} className="border-b border-white/5">
                  <td className="px-2 py-1.5 text-muted-foreground/40">{idx + 1}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">
                    {hourLabel(l.hour)}
                  </td>
                  <td className="px-2 py-1.5">
                    <strong>
                      {[l.firstName, l.lastName].filter(Boolean).join(" ") || "—"}
                    </strong>
                    <div className="text-[0.5rem] text-muted-foreground/40">
                      Lead Gen: {l.bookedByName ?? "—"}
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="text-[0.7rem]">{l.phone ?? "—"}</div>
                    {l.email && (
                      <div className="text-[0.55rem] text-muted-foreground">{l.email}</div>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-[0.65rem]">
                    {fullAddr || <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-2 py-1.5 text-[0.65rem] text-muted-foreground">
                    {l.bills ?? ""}
                  </td>
                  <td className="px-2 py-1.5 text-[0.65rem] text-muted-foreground">
                    {l.source ?? ""}
                  </td>
                  <td
                    className={cn(
                      "px-2 py-1.5 text-[0.65rem] font-semibold",
                      (l.company ?? "").toLowerCase().includes("dc")
                        ? "text-primary"
                        : "text-info",
                    )}
                  >
                    {l.company ?? "—"}
                  </td>
                  <td className="max-w-[220px] px-2 py-1.5 text-[0.62rem]">{l.notes ?? ""}</td>
                  <td className="px-2 py-1.5">
                    <span
                      className={cn(
                        "inline-block whitespace-nowrap rounded-[10px] border px-2 py-0.5 text-[0.58rem] font-bold tracking-wide",
                        meta.cls,
                      )}
                    >
                      {meta.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
