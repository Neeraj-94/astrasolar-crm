"use client";

/**
 * Blacklist Leads — client component (Leads dashboard).
 *
 * Faithful port of the astrasolar-app "Blacklist Leads" tab. Add a person by
 * name / phone / email / address (>=2 fields). On submit the server sweeps
 * Bloome / No Answers / Leads Schedule, removes matching records (>=2 fields
 * align), and writes removal-log rows shown below. "Re-scan All Tabs" re-runs
 * the sweep against the current entries.
 *
 * Storage moved from Firebase RTDB to the API/Postgres stack: reads come from
 * the server component, writes go through BlacklistApi.
 */

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import type {
  BlacklistEntryDto,
  BlacklistLogDto,
  BlacklistSweepResult,
} from "@astra/shared";
import { Button } from "@/components/ui/button";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { BlacklistApi } from "@/lib/api/endpoints";
import { PageHeader } from "./shared";

type Banner = { kind: "success" | "error" | "info"; text: string } | null;

const fmtDate = (iso?: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const sweepSummary = (s: BlacklistSweepResult) =>
  s.removed === 0
    ? `Re-scan complete — no matching leads found (${s.scanned} scanned).`
    : `Re-scan complete — removed ${s.removed} lead${s.removed === 1 ? "" : "s"} ` +
      `(Bloome ${s.bySource.bloome}, No Answers ${s.bySource.noAnswers}, ` +
      `Leads Schedule ${s.bySource.leadsSchedule}).`;

const labelCls =
  "mb-1 block text-[0.6rem] font-medium uppercase tracking-wider text-muted-foreground";
const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";
const thCls =
  "border-b border-border bg-muted/50 px-3 py-2.5 text-left text-[0.58rem] font-semibold uppercase tracking-wider text-muted-foreground";
const tdCls = "border-b border-border px-3 py-2 align-middle";

const EMPTY = { firstName: "", lastName: "", phone: "", email: "", address: "" };

export function BlacklistClient({
  initialEntries,
  initialLog,
}: {
  initialEntries: BlacklistEntryDto[];
  initialLog: BlacklistLogDto[];
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [log, setLog] = useState(initialLog);
  const [form, setForm] = useState({ ...EMPTY });
  const [submitting, setSubmitting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);

  const filledCount = [
    form.firstName,
    form.lastName,
    form.phone,
    form.email,
    form.address,
  ].filter((v) => v.trim()).length;

  async function refresh() {
    try {
      const [e, l] = await Promise.all([
        BlacklistApi.listEntries(),
        BlacklistApi.listLog(),
      ]);
      setEntries(e);
      setLog(l);
    } catch {
      /* keep current state; a reload reconciles */
    }
  }

  async function submit() {
    if (filledCount < 2) {
      setBanner({
        kind: "error",
        text: "Fill at least 2 fields — matches need ≥2 fields to align.",
      });
      return;
    }
    setSubmitting(true);
    setBanner(null);
    try {
      const res = await BlacklistApi.addEntry({
        firstName: form.firstName.trim() || undefined,
        lastName: form.lastName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
      });
      setForm({ ...EMPTY });
      await refresh();
      setBanner({
        kind: "success",
        text: `Added to blacklist. ${sweepSummary(res.sweep)}`,
      });
    } catch (e) {
      setBanner({
        kind: "error",
        text: e instanceof Error ? e.message : "Failed to add entry.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    if (
      !window.confirm(
        "Remove this entry from the blacklist?\n\nExisting log entries are kept for audit. Future matches will no longer be auto-removed.",
      )
    )
      return;
    try {
      await BlacklistApi.removeEntry(id);
      await refresh();
      setBanner({ kind: "info", text: "Entry removed." });
    } catch (e) {
      setBanner({
        kind: "error",
        text: e instanceof Error ? e.message : "Remove failed.",
      });
    }
  }

  async function rescan() {
    setScanning(true);
    setBanner(null);
    try {
      const res = await BlacklistApi.sweep();
      await refresh();
      setBanner({ kind: "success", text: sweepSummary(res) });
    } catch (e) {
      setBanner({
        kind: "error",
        text: e instanceof Error ? e.message : "Re-scan failed.",
      });
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Leads"
        title="Blacklist Leads"
        description="Block individuals from being booked or added. Matching leads in Bloome, No Answers, and the Leads Schedule are automatically removed and logged. Fill at least two fields — entries require ≥2 fields to match an incoming lead."
      />

      {banner && (
        <div
          className={
            "rounded-md border px-4 py-2.5 text-sm " +
            (banner.kind === "success"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
              : banner.kind === "error"
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-border bg-muted text-muted-foreground")
          }
        >
          {banner.text}
        </div>
      )}

      {/* Add Entry form */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 text-sm font-semibold text-foreground">
          + Add to Blacklist
        </div>
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={labelCls}>First Name</label>
            <input
              className={inputCls}
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              placeholder="e.g. John"
              autoComplete="off"
            />
          </div>
          <div>
            <label className={labelCls}>Last Name</label>
            <input
              className={inputCls}
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              placeholder="e.g. Smith"
              autoComplete="off"
            />
          </div>
          <div>
            <label className={labelCls}>Phone Number</label>
            <input
              className={inputCls}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="e.g. 0412 345 678"
              autoComplete="off"
            />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input
              className={inputCls}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="e.g. john@example.com"
              autoComplete="off"
            />
          </div>
          <div>
            <label className={labelCls}>Address</label>
            <AddressAutocomplete
              className={inputCls}
              value={form.address}
              onChange={(address) => setForm({ ...form, address })}
              onSelect={(a) =>
                setForm((f) => ({ ...f, address: a.formatted }))
              }
              placeholder="Start typing an address…"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="destructive" onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit"}
          </Button>
          <Button variant="outline" onClick={() => setForm({ ...EMPTY })} disabled={submitting}>
            Clear
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">
            Tip: phone + email is enough — exact, normalised match. ({filledCount}/5 filled)
          </span>
        </div>
      </div>

      {/* Entries */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold text-foreground">
            Blacklisted Leads{" "}
            <span className="ml-1 font-normal text-muted-foreground">
              ({entries.length})
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={rescan}
            disabled={scanning}
            title="Re-check Bloome / No Answers / Leads Schedule for matching leads"
          >
            <RefreshCw className={"h-3.5 w-3.5 " + (scanning ? "animate-spin" : "")} />
            Re-scan All Tabs
          </Button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr>
                <th className={thCls}>First Name</th>
                <th className={thCls}>Last Name</th>
                <th className={thCls}>Phone</th>
                <th className={thCls}>Email</th>
                <th className={thCls}>Address</th>
                <th className={thCls}>Date Added</th>
                <th className={thCls}>Added By</th>
                <th className={thCls + " text-right"}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-8 text-center text-sm text-muted-foreground"
                  >
                    No blacklist entries yet.
                  </td>
                </tr>
              ) : (
                entries.map((e) => (
                  <tr key={e.id}>
                    <td className={tdCls}>{e.firstName || "—"}</td>
                    <td className={tdCls}>{e.lastName || "—"}</td>
                    <td className={tdCls + " whitespace-nowrap"}>{e.phone || "—"}</td>
                    <td className={tdCls}>{e.email || "—"}</td>
                    <td className={tdCls}>{e.address || "—"}</td>
                    <td className={tdCls + " whitespace-nowrap text-muted-foreground"}>
                      {fmtDate(e.addedAt)}
                    </td>
                    <td className={tdCls + " text-muted-foreground"}>
                      {e.addedByName || "—"}
                    </td>
                    <td className={tdCls + " text-right"}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => remove(e.id)}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Removal log */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold text-foreground">
            Removal Log{" "}
            <span className="ml-1 font-normal text-muted-foreground">
              ({log.length})
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            Auto-removals from Bloome / No Answers / Leads Schedule. Most recent first.
          </span>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead>
              <tr>
                <th className={thCls}>Detected</th>
                <th className={thCls}>Removed</th>
                <th className={thCls}>Source</th>
                <th className={thCls}>Lead</th>
                <th className={thCls}>Phone</th>
                <th className={thCls}>Email</th>
                <th className={thCls}>Address</th>
                <th className={thCls}>Matched On</th>
                <th className={thCls}>Removed By</th>
              </tr>
            </thead>
            <tbody>
              {log.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-8 text-center text-sm text-muted-foreground"
                  >
                    No removals yet.
                  </td>
                </tr>
              ) : (
                log.map((r) => {
                  const name =
                    `${r.matchedFirstName || ""} ${r.matchedLastName || ""}`.trim() ||
                    "—";
                  return (
                    <tr key={r.id}>
                      <td className={tdCls + " whitespace-nowrap text-muted-foreground"}>
                        {fmtDate(r.detectedAt)}
                      </td>
                      <td className={tdCls + " whitespace-nowrap text-muted-foreground"}>
                        {fmtDate(r.removedAt)}
                      </td>
                      <td className={tdCls + " whitespace-nowrap"}>
                        <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[0.6rem] font-semibold text-destructive">
                          {r.source}
                        </span>
                      </td>
                      <td className={tdCls}>{name}</td>
                      <td className={tdCls + " whitespace-nowrap"}>
                        {r.matchedPhone || "—"}
                      </td>
                      <td className={tdCls}>{r.matchedEmail || "—"}</td>
                      <td className={tdCls}>{r.matchedAddress || "—"}</td>
                      <td className={tdCls + " text-muted-foreground"}>
                        {r.matchedOn || "—"}
                      </td>
                      <td className={tdCls + " text-muted-foreground"}>
                        {r.removedByName || "system"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
