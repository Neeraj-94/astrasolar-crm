"use client";

import * as React from "react";
import "./legacy-admin.css";
import {
  INSTALL_REGIONS,
  REGION_TABS,
  REGION_DEPOTS,
  TIME_SLOTS,
  type TimeSlot,
  type Region,
  type Installer,
  type Booking,
  type PipelineSale,
  bookingKey,
  ymd,
  mondayOf,
} from "./legacy-data";
import { seedInstallations, seedPipeline } from "./legacy-seed";

/**
 * Admin → Installation Calendar tab.
 *
 * Faithful port of astrasolar-app `#admin-tab-calendar` (index.html ~8636) and
 * the `adminInstallCalendar` / `renderInstallCalendar*` / `*BookingModal` /
 * `renderWeeklyStockRequirements` logic. Runs on in-memory seed data; the live
 * `/installations` feed lands in the wiring pass.
 */

type CalView = "day" | "week" | "month";
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const MONTH_FMT = new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric" });
const DAY_FMT = new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long" });

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function isWeekend(d: Date): boolean {
  const g = d.getDay();
  return g === 0 || g === 6;
}
function sameYmd(a: Date, b: Date): boolean {
  return ymd(a) === ymd(b);
}

/** Region/installer pairs in scope for the current region selection. */
function scopedPairs(regionSel: string): { region: Region; installer: Installer }[] {
  const out: { region: Region; installer: Installer }[] = [];
  INSTALL_REGIONS.forEach((r) => {
    if (regionSel !== "all" && r.id !== regionSel) return;
    r.installers.forEach((inst) => out.push({ region: r, installer: inst }));
  });
  return out;
}

interface BookingContext {
  regionId: string;
  date: string;
  installerId: string;
  timeSlot: TimeSlot;
  isExisting: boolean;
}

export function InstallationCalendarTab() {
  const [region, setRegion] = React.useState<string>("all");
  const [view, setView] = React.useState<CalView>("week");
  const [day, setDay] = React.useState<Date>(() => new Date());
  const [weekStart, setWeekStart] = React.useState<Date>(() => mondayOf(new Date()));
  const [month, setMonth] = React.useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [bookings, setBookings] = React.useState<Record<string, Booking>>(() => seedInstallations());
  const [availability, setAvailability] = React.useState<Record<string, boolean>>({}); // key -> false (unavailable)
  const [availEdit, setAvailEdit] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [stockWeek, setStockWeek] = React.useState<Date | null>(null);
  const [stockRegion, setStockRegion] = React.useState("all");
  const [ctx, setCtx] = React.useState<BookingContext | null>(null);

  // Pipeline sales (for the Ready-to-Book customer picker). Local copy in mock mode.
  const salesRef = React.useRef<PipelineSale[]>(seedPipeline());

  // ── availability helpers ──
  const availKey = (regionId: string, installerId: string, date: string) => `${regionId}/${installerId}/${date}`;
  const isAvailable = (regionId: string, installerId: string, date: string) =>
    availability[availKey(regionId, installerId, date)] !== false;
  function toggleAvail(regionId: string, installerId: string, date: string) {
    setAvailability((prev) => {
      const k = availKey(regionId, installerId, date);
      const next = { ...prev };
      if (next[k] === false) delete next[k];
      else next[k] = false;
      return next;
    });
  }

  // ── navigation ──
  function shift(delta: number) {
    if (view === "day") setDay((d) => addDays(d, delta));
    else if (view === "week") setWeekStart((d) => addDays(d, delta * 7));
    else setMonth((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));
  }
  function goToday() {
    const now = new Date();
    setDay(now);
    setWeekStart(mondayOf(now));
    setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  }

  const monthLabel =
    view === "day" ? DAY_FMT.format(day) : view === "week" ? `Week of ${DAY_FMT.format(weekStart)}` : MONTH_FMT.format(month);

  // ── booking modal open ──
  function openSlot(regionId: string, date: string, installerId: string, slot: TimeSlot) {
    const key = bookingKey(regionId, date, installerId, slot);
    setCtx({ regionId, date, installerId, timeSlot: slot, isExisting: !!bookings[key] });
  }
  function saveBooking(b: Booking) {
    const key = bookingKey(b.regionId, b.date, b.installerId, b.timeSlot);
    setBookings((prev) => ({ ...prev, [key]: b }));
    // Flip linked sale to installation_booked (local mock).
    if (b.saleKey) {
      const sale = salesRef.current.find((s) => s.key === b.saleKey);
      if (sale) sale.status.installation = "installation_booked";
    }
    setCtx(null);
  }
  function removeBooking(c: BookingContext) {
    const key = bookingKey(c.regionId, c.date, c.installerId, c.timeSlot);
    setBookings((prev) => {
      const next = { ...prev };
      const b = next[key];
      if (b?.saleKey) {
        const sale = salesRef.current.find((s) => s.key === b.saleKey);
        if (sale) sale.status.installation = "ready_to_book";
      }
      delete next[key];
      return next;
    });
    setCtx(null);
  }
  function reschedule(c: BookingContext, target: { regionId: string; date: string; installerId: string; slot: TimeSlot }, reason: string) {
    const fromKey = bookingKey(c.regionId, c.date, c.installerId, c.timeSlot);
    setBookings((prev) => {
      const next = { ...prev };
      const b = next[fromKey];
      if (!b) return prev;
      const moved: Booking = {
        ...b,
        regionId: target.regionId,
        date: target.date,
        installerId: target.installerId,
        timeSlot: target.slot,
      };
      delete next[fromKey];
      next[bookingKey(target.regionId, target.date, target.installerId, target.slot)] = moved;
      return next;
    });
    setCtx(null);
  }

  return (
    <div className="astra-legacy">
      <div className="install-calendar-wrap">
        {/* Region tabs */}
        <div className="install-state-tabs">
          {REGION_TABS.map((t) => (
            <button
              key={t.id}
              className={`install-state-tab${region === t.id ? " active" : ""}`}
              onClick={() => setRegion(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Search (month view) */}
        <div style={{ padding: "8px 0", display: "flex", alignItems: "center", gap: 8 }}>
          <input
            className="calendar-search-input"
            placeholder="Search installs by name, address, installer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="calendar-search-clear" onClick={() => setSearch("")}>
            Clear
          </button>
        </div>

        {/* Crew availability bar (hidden for All Regions) */}
        {region !== "all" && (
          <div className="avail-mgr-bar">
            <span className="avail-mgr-label">Crew Availability:</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1 }}>
              {INSTALL_REGIONS.find((r) => r.id === region)?.installers.map((inst) => {
                const dateStr = view === "day" ? ymd(day) : ymd(view === "week" ? weekStart : month);
                const on = isAvailable(region, inst.id, dateStr);
                return (
                  <span
                    key={inst.id}
                    className={`avail-crew-chip ${on ? "on" : "off"}`}
                    onClick={() => availEdit && toggleAvail(region, inst.id, dateStr)}
                    style={{ cursor: availEdit ? "pointer" : "default" }}
                    title={availEdit ? "Click to toggle availability for the anchor day" : inst.name}
                  >
                    <span className="avail-crew-dot" />
                    {inst.name}
                  </span>
                );
              })}
            </div>
            <button className={`avail-mgr-btn${availEdit ? " active" : ""}`} onClick={() => setAvailEdit((v) => !v)}>
              {availEdit ? "Done" : "Edit Schedule"}
            </button>
          </div>
        )}

        {/* Calendar nav */}
        <div className="cal-board">
          <div className="calendar-nav">
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div className="calendar-month">{monthLabel}</div>
              <div className="cal-view-toggle" role="tablist" aria-label="Calendar view">
                {(["day", "week", "month"] as CalView[]).map((v) => (
                  <button key={v} className={view === v ? "active" : ""} onClick={() => setView(v)}>
                    {v}
                  </button>
                ))}
              </div>
              <button className="cal-today-btn" onClick={goToday}>
                Today
              </button>
            </div>
            <div className="calendar-arrows">
              <button className="calendar-arrow-btn" onClick={() => shift(-1)} aria-label="Previous">
                ←
              </button>
              <button className="calendar-arrow-btn" onClick={() => shift(1)} aria-label="Next">
                →
              </button>
            </div>
          </div>

          {/* Views */}
          <div className="cal-board-body">
            {view === "day" && (
              <DayView region={region} day={day} bookings={bookings} isAvailable={isAvailable} onSlot={openSlot} />
            )}
            {view === "week" && (
              <WeekView region={region} weekStart={weekStart} bookings={bookings} isAvailable={isAvailable} onSlot={openSlot} />
            )}
            {view === "month" && (
              <MonthView region={region} month={month} bookings={bookings} isAvailable={isAvailable} onSlot={openSlot} search={search} />
            )}
          </div>
        </div>

        {/* Weekly stock */}
        <WeeklyStock
          bookings={bookings}
          anchor={view === "day" ? day : view === "week" ? weekStart : month}
          stockWeek={stockWeek}
          setStockWeek={setStockWeek}
          stockRegion={stockRegion}
          setStockRegion={setStockRegion}
        />
      </div>

      {ctx && (
        <BookingModal
          ctx={ctx}
          booking={bookings[bookingKey(ctx.regionId, ctx.date, ctx.installerId, ctx.timeSlot)]}
          sales={salesRef.current}
          bookings={bookings}
          onClose={() => setCtx(null)}
          onSave={saveBooking}
          onRemove={() => removeBooking(ctx)}
          onReschedule={(target, reason) => reschedule(ctx, target, reason)}
        />
      )}
    </div>
  );
}

// ───────────────────────────── Day view ─────────────────────────────
function DayView({
  region,
  day,
  bookings,
  isAvailable,
  onSlot,
}: {
  region: string;
  day: Date;
  bookings: Record<string, Booking>;
  isAvailable: (r: string, i: string, d: string) => boolean;
  onSlot: (r: string, d: string, i: string, slot: TimeSlot) => void;
}) {
  const dateStr = ymd(day);
  const pairs = scopedPairs(region);
  if (pairs.length === 0) return <div className="cal-day-empty-state">No installers in this region.</div>;
  return (
    <div className="cal-day-view-wrap">
      {pairs.map(({ region: r, installer }) => {
        const amKey = bookingKey(r.id, dateStr, installer.id, "am");
        const pmKey = bookingKey(r.id, dateStr, installer.id, "pm");
        const am = bookings[amKey];
        const pm = bookings[pmKey];
        const avail = isAvailable(r.id, installer.id, dateStr);
        const full = !!am && !!pm;
        const cls = `cal-day-installer-card${full ? " fully-booked" : ""}${!avail ? " unavailable" : ""}`;
        return (
          <div key={`${r.id}_${installer.id}`} className={cls}>
            <div className="cal-day-installer-header">
              <span className="cal-day-installer-name">{installer.name}</span>
              <span className="cal-day-region-tag">{r.state}</span>
            </div>
            <div className="cal-day-slots">
              {TIME_SLOTS.map((slot) => {
                const b = slot === "am" ? am : pm;
                if (!avail) {
                  return (
                    <div key={slot} className="cal-day-slot empty">
                      Installer unavailable
                    </div>
                  );
                }
                if (!b) {
                  return (
                    <div key={slot} className="cal-day-slot empty" onClick={() => onSlot(r.id, dateStr, installer.id, slot)}>
                      <div className="slot-time">{slot === "am" ? "AM · Morning" : "PM · Afternoon"}</div>+ Book installation
                    </div>
                  );
                }
                return (
                  <div key={slot} className="cal-day-slot booked" onClick={() => onSlot(r.id, dateStr, installer.id, slot)}>
                    <div className="slot-time">
                      {slot === "am" ? "AM · Morning" : "PM · Afternoon"} ·{" "}
                      {b.status === "booked" ? "● CONFIRMED" : "● NEEDS BOOKING"}
                    </div>
                    <div className="slot-cust">{b.customerName}</div>
                    <div className="slot-addr">
                      {b.address}
                      {b.suburb ? `, ${b.suburb}` : ""}
                    </div>
                    <div className="slot-meta-row">
                      {b.company && <span className={`slot-company-tag ${b.company}`}>{b.company === "dcnt" ? "DC ELEC" : "ASTRA"}</span>}
                      {b.product && <span style={{ fontSize: "0.55rem", color: "var(--text-dim)" }}>{b.product}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ───────────────────────────── Week view ─────────────────────────────
const WEEK_FIELDS_LEFT: [string, keyof Booking][] = [
  ["Address", "address"],
  ["Suburb", "suburb"],
  ["Full Name", "customerName"],
  ["Sales Rep", "consultant"],
  ["Number", "phone"],
  ["System Type", "systemType"],
  ["Back up", "backup"],
];
const WEEK_FIELDS_RIGHT: [string, keyof Booking][] = [
  ["System size", "systemSize"],
  ["No. Panels", "numPanels"],
  ["Panel", "panel"],
  ["Inverter", "inverter"],
  ["Phases", "phases"],
  ["Hot Water", "hotWater"],
  ["Battery", "battery"],
];

function WeekView({
  region,
  weekStart,
  bookings,
  isAvailable,
  onSlot,
}: {
  region: string;
  weekStart: Date;
  bookings: Record<string, Booking>;
  isAvailable: (r: string, i: string, d: string) => boolean;
  onSlot: (r: string, d: string, i: string, slot: TimeSlot) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const pairs = scopedPairs(region);
  const today = new Date();

  return (
    <div className="cal-week-view-wrap">
      <div className="cal-week-grid-table">
        {/* Header row */}
        <div className="cal-week-grid-row cal-week-grid-header-row">
          <div className="cal-week-grid-corner" />
          {days.map((d, i) => (
            <div key={i} className={`cal-week-grid-day-header${sameYmd(d, today) ? " is-today" : ""}`}>
              <div className="cal-week-grid-day-name">{DOW[i]}</div>
              <div className="cal-week-grid-day-date">{d.getDate()}</div>
            </div>
          ))}
        </div>
        {/* Installer rows */}
        {pairs.map(({ region: r, installer }) => (
          <div key={`${r.id}_${installer.id}`} className="cal-week-grid-row cal-week-grid-installer-row">
            <div className="cal-week-grid-installer-cell">
              <span className="cal-week-grid-installer-name">{installer.name}</span>
              <span className="cal-week-grid-installer-region">{r.state}</span>
            </div>
            {days.map((d, i) => {
              const dateStr = ymd(d);
              const avail = isAvailable(r.id, installer.id, dateStr);
              const cls = `cal-week-grid-day-cell${isWeekend(d) ? " weekend" : ""}${sameYmd(d, today) ? " today" : ""}`;
              return (
                <div key={i} className={cls}>
                  {TIME_SLOTS.map((slot) => {
                    const b = bookings[bookingKey(r.id, dateStr, installer.id, slot)];
                    if (!avail) {
                      return (
                        <div key={slot} className="cal-week-bk-block cal-week-bk-unavail">
                          <span className="cal-week-bk-slot-tag">{slot.toUpperCase()}</span>
                          <span className="cal-week-bk-unavail-msg">OFF</span>
                        </div>
                      );
                    }
                    if (!b) {
                      return (
                        <div
                          key={slot}
                          className="cal-week-bk-block cal-week-bk-empty"
                          onClick={() => onSlot(r.id, dateStr, installer.id, slot)}
                        >
                          <span className="cal-week-bk-slot-tag">{slot.toUpperCase()}</span>
                          <div style={{ textAlign: "center", paddingTop: 40 }}>+ Book</div>
                        </div>
                      );
                    }
                    return (
                      <div
                        key={slot}
                        className="cal-week-bk-block cal-week-bk-booked"
                        onClick={() => onSlot(r.id, dateStr, installer.id, slot)}
                      >
                        <span className="cal-week-bk-slot-tag">{slot.toUpperCase()}</span>
                        <div className="cal-week-bk-grid">
                          {WEEK_FIELDS_LEFT.map(([label, key], idx) => {
                            const right = WEEK_FIELDS_RIGHT[idx];
                            return (
                              <React.Fragment key={label}>
                                <div className="cal-week-bk-cell cal-week-bk-label">{label}</div>
                                <div className="cal-week-bk-cell cal-week-bk-value">{String(b[key] ?? "—") || "—"}</div>
                                {right ? (
                                  <>
                                    <div className="cal-week-bk-cell cal-week-bk-label">{right[0]}</div>
                                    <div className="cal-week-bk-cell cal-week-bk-value">{String(b[right[1]] ?? "—") || "—"}</div>
                                  </>
                                ) : (
                                  <>
                                    <div className="cal-week-bk-cell" />
                                    <div className="cal-week-bk-cell" />
                                  </>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
        {pairs.length === 0 && <div className="cal-week-grid-empty">No installers in this region.</div>}
      </div>
    </div>
  );
}

// ───────────────────────────── Month view ─────────────────────────────
function MonthView({
  region,
  month,
  bookings,
  isAvailable,
  onSlot,
  search,
}: {
  region: string;
  month: Date;
  bookings: Record<string, Booking>;
  isAvailable: (r: string, i: string, d: string) => boolean;
  onSlot: (r: string, d: string, i: string, slot: TimeSlot) => void;
  search: string;
}) {
  const y = month.getFullYear();
  const m = month.getMonth();
  const first = new Date(y, m, 1);
  const startDow = (first.getDay() + 6) % 7; // Mon-start offset
  const gridStart = addDays(first, -startDow);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const pairs = scopedPairs(region);
  const q = search.trim().toLowerCase();

  return (
    <div className="calendar-grid">
      {DOW.map((d) => (
        <div key={d} className="calendar-day-header">
          {d}
        </div>
      ))}
      {cells.map((d, i) => {
        const dateStr = ymd(d);
        const inMonth = d.getMonth() === m;
        return (
          <div key={i} className={`calendar-day-cell${inMonth ? "" : " other-month"}`}>
            <div className="calendar-day-num">{d.getDate()}</div>
            <div className="calendar-installer-lanes">
              {pairs.map(({ region: r, installer }) => {
                const avail = isAvailable(r.id, installer.id, dateStr);
                const am = bookings[bookingKey(r.id, dateStr, installer.id, "am")];
                const pm = bookings[bookingKey(r.id, dateStr, installer.id, "pm")];
                if (!am && !pm && avail) return null; // only show lanes with activity / unavailability in month grid
                const full = !!am && !!pm;
                const hit =
                  q &&
                  [am, pm].some(
                    (b) =>
                      b &&
                      `${b.customerName} ${b.address || ""} ${installer.name}`.toLowerCase().includes(q),
                  );
                const dim = q && !hit;
                const laneCls = `calendar-installer-lane${!avail ? " unavailable" : ""}${full ? " fully-booked" : ""}${dim ? " cal-fade-dim" : ""}${hit ? " cal-search-hit" : ""}`;
                return (
                  <div key={`${r.id}_${installer.id}`} className={laneCls}>
                    <span className="calendar-installer-name" title={installer.name}>
                      {region === "all" ? `${installer.name}` : installer.name}
                    </span>
                    <div className="installer-slots">
                      {TIME_SLOTS.map((slot) => {
                        const b = slot === "am" ? am : pm;
                        const dotCls = !b ? "available" : b.status === "booked" ? "confirmed" : "needs-booking";
                        return (
                          <span
                            key={slot}
                            className="installer-time-slot"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (avail) onSlot(r.id, dateStr, installer.id, slot);
                            }}
                          >
                            <span className="slot-label">{slot}</span>
                            <span className={`slot-dot ${dotCls}`} />
                            {b && <span className="slot-client">{b.customerName.split(" ")[0]}</span>}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ───────────────────────────── Weekly stock ─────────────────────────────
function WeeklyStock({
  bookings,
  anchor,
  stockWeek,
  setStockWeek,
  stockRegion,
  setStockRegion,
}: {
  bookings: Record<string, Booking>;
  anchor: Date;
  stockWeek: Date | null;
  setStockWeek: (d: Date | null) => void;
  stockRegion: string;
  setStockRegion: (r: string) => void;
}) {
  const weekStart = mondayOf(stockWeek || anchor);
  const weekEnd = addDays(weekStart, 6);
  const weekLabel = `${DAY_FMT.format(weekStart)} – ${DAY_FMT.format(weekEnd)}`;

  const { panels, inverters, batteries, extras, count } = React.useMemo(() => {
    const panelMap: Record<string, number> = {};
    const invMap: Record<string, number> = {};
    const batMap: Record<string, number> = {};
    const extraMap: Record<string, number> = {};
    const seen = new Set<string>();
    let n = 0;
    Object.entries(bookings).forEach(([key, b]) => {
      const d = new Date(b.date + "T00:00:00");
      if (d < weekStart || d > weekEnd) return;
      if (stockRegion !== "all" && b.regionId !== stockRegion) return;
      const dedup = b.saleKey || key;
      if (seen.has(dedup)) return;
      seen.add(dedup);
      n++;
      if (b.panel) panelMap[b.panel] = (panelMap[b.panel] || 0) + (parseInt(b.numPanels || "0", 10) || 0);
      if (b.inverter) invMap[b.inverter] = (invMap[b.inverter] || 0) + 1;
      if (b.battery) batMap[b.battery] = (batMap[b.battery] || 0) + 1;
      if (b.hotWater) extraMap["Hot Water: " + b.hotWater] = (extraMap["Hot Water: " + b.hotWater] || 0) + 1;
      if (b.switchboard) extraMap["Switchboard: " + b.switchboard] = (extraMap["Switchboard: " + b.switchboard] || 0) + 1;
    });
    return { panels: panelMap, inverters: invMap, batteries: batMap, extras: extraMap, count: n };
  }, [bookings, weekStart.getTime(), weekEnd.getTime(), stockRegion]);

  const total = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);
  const isEmpty = count === 0;

  return (
    <section className="weekly-stock-section">
      <header className="weekly-stock-header">
        <div>
          <h3 className="weekly-stock-title">📦 Weekly Stock Requirement</h3>
          <div className="weekly-stock-sub">
            Stock needed for installations booked <span style={{ fontWeight: 700, color: "var(--gold)" }}>{weekLabel}</span>
          </div>
        </div>
        <div className="weekly-stock-controls">
          <button className="weekly-stock-refresh" title="Previous week" onClick={() => setStockWeek(addDays(weekStart, -7))}>
            ‹
          </button>
          <input
            type="date"
            className="weekly-stock-date-input"
            value={ymd(weekStart)}
            onChange={(e) => e.target.value && setStockWeek(new Date(e.target.value + "T00:00:00"))}
          />
          <button className="weekly-stock-refresh" title="Next week" onClick={() => setStockWeek(addDays(weekStart, 7))}>
            ›
          </button>
          <button className="weekly-stock-refresh" style={{ fontSize: "0.55rem", width: "auto" }} onClick={() => setStockWeek(null)}>
            Today
          </button>
          <label className="weekly-stock-label" style={{ marginLeft: 6 }}>
            Region
          </label>
          <select value={stockRegion} onChange={(e) => setStockRegion(e.target.value)}>
            <option value="all">All regions</option>
            {INSTALL_REGIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      </header>
      {isEmpty ? (
        <div className="weekly-stock-empty">No installations booked for this week.</div>
      ) : (
        <div className="weekly-stock-body">
          <StockCard title="Panels" total={total(panels)} rows={panels} unit="panels" />
          <StockCard title="Inverters" total={total(inverters)} rows={inverters} unit="units" />
          <StockCard title="Batteries" total={total(batteries)} rows={batteries} unit="units" wide />
          <StockCard title="Extras" total={total(extras)} rows={extras} unit="jobs" />
        </div>
      )}
    </section>
  );
}

function StockCard({
  title,
  total,
  rows,
  unit,
  wide,
}: {
  title: string;
  total: number;
  rows: Record<string, number>;
  unit: string;
  wide?: boolean;
}) {
  const entries = Object.entries(rows).sort((a, b) => b[1] - a[1]);
  return (
    <div className={`weekly-stock-card${wide ? " weekly-stock-card--batteries" : ""}`}>
      <h4>
        {title}
        <span className="weekly-stock-total">
          {total} {unit}
        </span>
      </h4>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th style={{ textAlign: "right" }}>Qty</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr>
              <td colSpan={2} style={{ color: "var(--text-faint)" }}>
                None
              </td>
            </tr>
          ) : (
            entries.map(([item, qty]) => (
              <tr key={item}>
                <td>{item}</td>
                <td className="qty">{qty}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ───────────────────────────── Booking modal ─────────────────────────────
const BLANK_BOOKING = (ctx: BookingContext): Booking => ({
  customerName: "",
  phone: "",
  address: "",
  suburb: "",
  postcode: "",
  consultant: "",
  systemType: "",
  backup: "",
  systemSize: "",
  numPanels: "",
  panel: "",
  inverter: "",
  phases: "",
  hotWater: "",
  battery: "",
  product: "",
  roofType: "",
  storey: "",
  switchboard: "",
  status: "needs_booking",
  company: "",
  notes: "",
  saleKey: undefined,
  regionId: ctx.regionId,
  date: ctx.date,
  installerId: ctx.installerId,
  timeSlot: ctx.timeSlot,
});

function BookingModal({
  ctx,
  booking,
  sales,
  bookings,
  onClose,
  onSave,
  onRemove,
  onReschedule,
}: {
  ctx: BookingContext;
  booking?: Booking;
  sales: PipelineSale[];
  bookings: Record<string, Booking>;
  onClose: () => void;
  onSave: (b: Booking) => void;
  onRemove: () => void;
  onReschedule: (target: { regionId: string; date: string; installerId: string; slot: TimeSlot }, reason: string) => void;
}) {
  const region = INSTALL_REGIONS.find((r) => r.id === ctx.regionId);
  const installer = region?.installers.find((i) => i.id === ctx.installerId);
  const [form, setForm] = React.useState<Booking>(() => booking ? { ...booking } : BLANK_BOOKING(ctx));
  const [custSearch, setCustSearch] = React.useState("");
  const [showResults, setShowResults] = React.useState(false);
  const [showResched, setShowResched] = React.useState(false);
  const [reschedReason, setReschedReason] = React.useState("");

  function set<K extends keyof Booking>(k: K, v: Booking[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // Ready-to-Book customers matching the region's state.
  const readyCustomers = React.useMemo(
    () =>
      sales
        .filter(
          (s) =>
            s.status.installation === "ready_to_book" &&
            (s.state || "").toLowerCase() === (region?.state || "").toLowerCase(),
        )
        .sort((a, b) => `${a.firstName} ${a.surname}`.localeCompare(`${b.firstName} ${b.surname}`)),
    [sales, region],
  );

  // Free-text search across all sales (name/phone/suburb).
  const searchResults = React.useMemo(() => {
    const q = custSearch.trim().toLowerCase();
    if (!q) return [];
    return sales
      .filter((s) => `${s.firstName} ${s.surname} ${s.phone} ${s.suburb || ""}`.toLowerCase().includes(q))
      .slice(0, 10);
  }, [custSearch, sales]);

  function autofill(s: PipelineSale) {
    setForm((f) => ({
      ...f,
      customerName: `${s.firstName} ${s.surname}`,
      phone: s.phone,
      address: s.address || "",
      suburb: s.suburb || "",
      postcode: s.postcode || "",
      consultant: s.consultantName,
      systemType: s.systemType || "",
      backup: s.backup || "",
      systemSize: s.systemSize || "",
      numPanels: s.numPanels || "",
      panel: s.panelModel || "",
      inverter: s.inverterModel || "",
      phases: s.phase || "",
      hotWater: s.hotWater || "",
      battery: s.batteryModel || "",
      product: `${s.solar || ""}${s.battery ? " + " + s.battery : ""}`,
      roofType: s.roofType || "",
      storey: s.storeys || "",
      switchboard: s.switchboard || "",
      company: s.companyType,
      saleKey: s.key,
      status: "needs_booking",
    }));
    setCustSearch("");
    setShowResults(false);
  }

  function save() {
    if (!form.customerName.trim()) return window.alert("Customer name is required");
    onSave(form);
  }

  // Reschedule candidate slots — next 30 days, weekdays, open slots in region.
  const reschedSlots = React.useMemo(() => {
    if (!region) return [];
    const out: { regionId: string; date: string; installerId: string; installerName: string; slot: TimeSlot; label: string }[] = [];
    const start = new Date();
    for (let i = 1; i <= 30 && out.length < 8; i++) {
      const d = addDays(start, i);
      if (isWeekend(d)) continue;
      const dateStr = ymd(d);
      for (const inst of region.installers) {
        for (const slot of TIME_SLOTS) {
          if (bookings[bookingKey(region.id, dateStr, inst.id, slot)]) continue;
          out.push({
            regionId: region.id,
            date: dateStr,
            installerId: inst.id,
            installerName: inst.name,
            slot,
            label: DAY_FMT.format(d),
          });
          if (out.length >= 8) break;
        }
        if (out.length >= 8) break;
      }
    }
    return out;
  }, [region, bookings]);

  const driveDepot = REGION_DEPOTS[ctx.regionId];

  return (
    <div className="booking-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="booking-modal">
        <div className="booking-modal-header">
          <h3>{ctx.isExisting ? "Installation Details" : "Book Installation"}</h3>
          <button className="booking-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="booking-modal-body">
          <div className="booking-slot-info">
            <div className="slot-meta">
              <strong>{installer?.name}</strong> · {region?.name}
              <br />
              {DAY_FMT.format(new Date(ctx.date + "T00:00:00"))} · {ctx.timeSlot.toUpperCase()}
            </div>
          </div>

          {driveDepot && (
            <div className="booking-drive-time">
              🚗 Depot origin: {driveDepot}
              {form.address && (
                <a
                  style={{ marginLeft: "auto", float: "right", color: "var(--gold)" }}
                  href={`https://www.google.com/maps/dir/${encodeURIComponent(driveDepot)}/${encodeURIComponent(`${form.address} ${form.suburb || ""}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open Maps ▸
                </a>
              )}
            </div>
          )}

          {/* Customer picker */}
          {!ctx.isExisting && (
            <div className="booking-form-row full">
              <div className="booking-form-group">
                <label>
                  Select Customer <span style={{ fontWeight: 400, color: "var(--text-faint)", fontSize: "0.55rem" }}>— Ready to Book in {region?.state}</span>
                </label>
                <select
                  value={form.saleKey || ""}
                  onChange={(e) => {
                    const s = sales.find((x) => x.key === e.target.value);
                    if (s) autofill(s);
                  }}
                >
                  <option value="">— Select a customer —</option>
                  {readyCustomers.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.firstName} {s.surname} — {s.suburb}
                    </option>
                  ))}
                </select>
                {readyCustomers.length === 0 && (
                  <div className="booking-customer-empty">No Ready-to-Book customers in this state. Enter details manually below.</div>
                )}
              </div>
            </div>
          )}

          <div className="booking-section-header" style={{ marginTop: 6 }}>
            Customer
          </div>
          <div className="booking-form-row">
            <div className="booking-form-group">
              <label>
                Full Name * <span style={{ fontWeight: 400, color: "var(--text-faint)", fontSize: "0.55rem" }}>— type to search sales</span>
              </label>
              <input
                value={form.customerName}
                placeholder="Start typing a customer name..."
                autoComplete="off"
                onChange={(e) => {
                  set("customerName", e.target.value);
                  setCustSearch(e.target.value);
                  setShowResults(e.target.value.length >= 1);
                }}
                onFocus={() => form.customerName.length >= 1 && setShowResults(true)}
              />
              {showResults && searchResults.length > 0 && (
                <div className="booking-search-results">
                  {searchResults.map((s) => (
                    <div key={s.key} className="booking-search-result" onClick={() => autofill(s)}>
                      <div className="bsr-name">
                        {s.firstName} {s.surname}
                      </div>
                      <div className="bsr-meta">
                        {s.phone} · {s.suburb} · {s.state}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="booking-form-group">
              <label>Phone Number</label>
              <input value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} />
            </div>
          </div>
          <div className="booking-form-row full">
            <div className="booking-form-group">
              <label>Address *</label>
              <input value={form.address || ""} onChange={(e) => set("address", e.target.value)} />
            </div>
          </div>
          <div className="booking-form-row">
            <div className="booking-form-group">
              <label>Suburb</label>
              <input value={form.suburb || ""} onChange={(e) => set("suburb", e.target.value)} />
            </div>
            <div className="booking-form-group">
              <label>Postcode</label>
              <input value={form.postcode || ""} onChange={(e) => set("postcode", e.target.value)} />
            </div>
          </div>
          <div className="booking-form-row">
            <div className="booking-form-group">
              <label>Sales Consultant</label>
              <input value={form.consultant || ""} onChange={(e) => set("consultant", e.target.value)} />
            </div>
            <div className="booking-form-group" />
          </div>

          <div className="booking-section-header">System Specifications</div>
          <div className="booking-form-row">
            <div className="booking-form-group">
              <label>System Type</label>
              <input value={form.systemType || ""} onChange={(e) => set("systemType", e.target.value)} />
            </div>
            <div className="booking-form-group">
              <label>Backup</label>
              <input value={form.backup || ""} onChange={(e) => set("backup", e.target.value)} />
            </div>
          </div>
          <div className="booking-form-row">
            <div className="booking-form-group">
              <label>System Size (kW)</label>
              <input value={form.systemSize || ""} onChange={(e) => set("systemSize", e.target.value)} />
            </div>
            <div className="booking-form-group">
              <label>Number of Panels</label>
              <input value={form.numPanels || ""} onChange={(e) => set("numPanels", e.target.value)} />
            </div>
          </div>
          <div className="booking-form-row">
            <div className="booking-form-group">
              <label>Panel</label>
              <input value={form.panel || ""} onChange={(e) => set("panel", e.target.value)} />
            </div>
            <div className="booking-form-group">
              <label>Inverter</label>
              <input value={form.inverter || ""} onChange={(e) => set("inverter", e.target.value)} />
            </div>
          </div>
          <div className="booking-form-row">
            <div className="booking-form-group">
              <label>Phases</label>
              <input value={form.phases || ""} onChange={(e) => set("phases", e.target.value)} />
            </div>
            <div className="booking-form-group">
              <label>Hot Water System</label>
              <input value={form.hotWater || ""} onChange={(e) => set("hotWater", e.target.value)} />
            </div>
          </div>
          <div className="booking-form-row">
            <div className="booking-form-group">
              <label>Battery</label>
              <input value={form.battery || ""} onChange={(e) => set("battery", e.target.value)} />
            </div>
            <div className="booking-form-group">
              <label>Product(s) Summary</label>
              <input value={form.product || ""} onChange={(e) => set("product", e.target.value)} />
            </div>
          </div>

          <div className="booking-section-header">Site Details</div>
          <div className="booking-form-row">
            <div className="booking-form-group">
              <label>Roof Type</label>
              <input value={form.roofType || ""} onChange={(e) => set("roofType", e.target.value)} />
            </div>
            <div className="booking-form-group">
              <label>Levels</label>
              <input value={form.storey || ""} onChange={(e) => set("storey", e.target.value)} />
            </div>
          </div>
          <div className="booking-form-row">
            <div className="booking-form-group">
              <label>Switchboard Upgrade</label>
              <input value={form.switchboard || ""} onChange={(e) => set("switchboard", e.target.value)} />
            </div>
            <div className="booking-form-group">
              <label>Booking Status *</label>
              <select value={form.status} onChange={(e) => set("status", e.target.value)}>
                <option value="needs_booking">Needs Booking</option>
                <option value="booked">Booked</option>
              </select>
            </div>
          </div>
          <div className="booking-form-row">
            <div className="booking-form-group">
              <label>Company</label>
              <select value={form.company || ""} onChange={(e) => set("company", e.target.value)}>
                <option value="">— Select —</option>
                <option value="astra">Astra</option>
                <option value="dcnt">DC ELEC</option>
              </select>
            </div>
            <div className="booking-form-group" />
          </div>
          <div className="booking-form-row full">
            <div className="booking-form-group">
              <label>Notes</label>
              <textarea
                rows={3}
                value={form.notes || ""}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Special instructions, access info, parking, scaffolding..."
              />
            </div>
          </div>

          {/* Reschedule */}
          {ctx.isExisting && (
            <div className="reschedule-section">
              <div style={{ fontSize: "0.62rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-dim)", fontWeight: 600, marginBottom: 8 }}>
                Reschedule / Postpone
              </div>
              <button className="booking-btn secondary" onClick={() => setShowResched((v) => !v)}>
                {showResched ? "Hide slots" : "Find next available slots"}
              </button>
              {showResched && (
                <>
                  <div className="booking-form-row" style={{ marginTop: 10 }}>
                    <div className="booking-form-group">
                      <label>Reason</label>
                      <select className="reschedule-reason" value={reschedReason} onChange={(e) => setReschedReason(e.target.value)}>
                        <option value="">— Select Reason —</option>
                        <option value="weather">Bad Weather</option>
                        <option value="sick">Installer Sick</option>
                        <option value="material">Materials Not Ready</option>
                        <option value="customer">Customer Requested</option>
                        <option value="access">Access Issue</option>
                        <option value="rebook">Job Requires Rebooking</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>
                  <div className="reschedule-slots">
                    {reschedSlots.map((s, i) => (
                      <div
                        key={i}
                        className="reschedule-slot-pick"
                        onClick={() => onReschedule({ regionId: s.regionId, date: s.date, installerId: s.installerId, slot: s.slot }, reschedReason)}
                      >
                        <span className="reschedule-slot-date">{s.label}</span>
                        <span className="reschedule-slot-crew">{s.installerName}</span>
                        <span className="reschedule-slot-time">{s.slot.toUpperCase()}</span>
                      </div>
                    ))}
                    {reschedSlots.length === 0 && <div style={{ color: "var(--text-faint)", fontSize: "0.62rem" }}>No open slots in the next 30 days.</div>}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <div className="booking-modal-footer">
          {ctx.isExisting && (
            <button className="booking-btn danger" onClick={onRemove} style={{ marginRight: "auto" }}>
              Remove
            </button>
          )}
          <button className="booking-btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="booking-btn primary" onClick={save}>
            {ctx.isExisting ? "Update" : "Book Installation"}
          </button>
        </div>
      </div>
    </div>
  );
}
