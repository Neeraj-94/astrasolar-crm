"use client";

import { useState } from "react";
import { useApi } from "@/lib/api/use-api";
import { apiPost, apiPatch } from "@/lib/api/client";
import { useRowReorder } from "@/lib/api/use-reorder";
import {
  DataTable,
  THead,
  TBody,
  TR,
  TH,
  TD,
  DragTH,
} from "@/components/leads/shared/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface LeadRow {
  id: string;
  company: string;
  stage: string;
  outcome: string | null;
  disposition: string | null;
  billSpend: string | number | null;
  leadDate: string;
  contact: { firstName: string; surname: string; phone?: string | null } | null;
  owner: { id: string; name: string } | null;
  currentConsultant: { id: string; name: string } | null;
}
interface SelectableUser {
  id: string;
  name: string;
  roleKeys: string[];
}

const STAGE_COLORS: Record<string, string> = {
  INTAKE: "bg-sky-100 text-sky-700",
  BOOKED: "bg-amber-100 text-amber-700",
  CONVERTED: "bg-emerald-100 text-emerald-700",
  CLOSED: "bg-zinc-100 text-zinc-600",
};

const DISPOSITIONS = [
  "NO_ANSWER",
  "TO_BE_RESCHEDULED",
  "RESCHEDULED",
  "DID_NOT_QUALIFY",
  "CANCELLED",
  "NOT_INTERESTED",
  "SOLD",
];

export function LeadsListTab() {
  const leads = useApi<LeadRow[]>("/leads");
  const users = useApi<SelectableUser[]>("/users/selectable");
  const sortable = useRowReorder(leads, (l) => l.id, "/leads/reorder");

  const [form, setForm] = useState({
    firstName: "",
    surname: "",
    phone: "",
    company: "ASTRA",
    leadDate: new Date().toISOString().slice(0, 10),
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Inline booking state (which lead row is being booked).
  const [bookingFor, setBookingFor] = useState<string | null>(null);
  const [booking, setBooking] = useState({
    consultantId: "",
    scheduledAt: "",
  });

  const consultants = (users.data ?? []).filter(
    (u) =>
      u.roleKeys.includes("sales_consultant") ||
      u.roleKeys.includes("super_admin"),
  );
  const consultantOptions = consultants.length ? consultants : users.data ?? [];

  async function createLead(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await apiPost("/leads", {
        contact: {
          firstName: form.firstName,
          surname: form.surname,
          phone: form.phone || undefined,
        },
        company: form.company,
        leadDate: form.leadDate,
      });
      setForm({ ...form, firstName: "", surname: "", phone: "" });
      leads.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create lead");
    } finally {
      setBusy(false);
    }
  }

  async function confirmBooking(leadId: string) {
    if (!booking.consultantId || !booking.scheduledAt) return;
    setErr(null);
    try {
      await apiPost(`/leads/${leadId}/book`, {
        consultantId: booking.consultantId,
        scheduledAt: new Date(booking.scheduledAt).toISOString(),
      });
      setBookingFor(null);
      setBooking({ consultantId: "", scheduledAt: "" });
      leads.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not book lead");
    }
  }

  async function setDisposition(leadId: string, disposition: string) {
    if (!disposition) return;
    setErr(null);
    try {
      await apiPatch(`/leads/${leadId}/disposition`, { disposition });
      leads.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not set disposition");
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold">New lead</h3>
        <form onSubmit={createLead} className="grid grid-cols-1 gap-3 sm:grid-cols-6">
          <div className="space-y-1">
            <Label htmlFor="l-first">First name</Label>
            <Input id="l-first" required value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="l-last">Surname</Label>
            <Input id="l-last" required value={form.surname}
              onChange={(e) => setForm({ ...form, surname: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="l-phone">Phone</Label>
            <Input id="l-phone" value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="l-company">Brand</Label>
            <select id="l-company"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}>
              <option value="ASTRA">Astra</option>
              <option value="DC">DC</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="l-date">Lead date</Label>
            <Input id="l-date" type="date" value={form.leadDate}
              onChange={(e) => setForm({ ...form, leadDate: e.target.value })} />
          </div>
          <div className="flex items-end">
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Adding…" : "Add lead"}
            </Button>
          </div>
        </form>
        {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold">
          Leads {leads.data ? `(${leads.data.length})` : ""}
        </h3>
        {leads.loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : leads.error ? (
          <p className="text-sm text-destructive">{leads.error}</p>
        ) : (leads.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No leads in your scope yet.</p>
        ) : (
          <DataTable sortable={sortable}>
            <THead>
              <tr>
                <DragTH />
                <TH>Contact</TH>
                <TH>Brand</TH>
                <TH>Stage</TH>
                <TH>Consultant</TH>
                <TH>Disposition</TH>
                <TH>Action</TH>
              </tr>
            </THead>
            <TBody>
                {(leads.data ?? []).map((l) => (
                  <TR key={l.id} sortableId={l.id} className="align-top">
                    <TD>
                      {l.contact
                        ? `${l.contact.firstName} ${l.contact.surname}`
                        : "—"}
                    </TD>
                    <TD>{l.company}</TD>
                    <TD>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${STAGE_COLORS[l.stage] ?? "bg-muted"}`}>
                        {l.stage}
                      </span>
                    </TD>
                    <TD>{l.currentConsultant?.name ?? "—"}</TD>
                    <TD className="text-muted-foreground">{l.disposition ?? "—"}</TD>
                    <TD>
                      {/* INTAKE -> book */}
                      {l.stage === "INTAKE" &&
                        (bookingFor === l.id ? (
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <select
                              className="h-8 rounded-md border bg-background px-2 text-xs"
                              value={booking.consultantId}
                              onChange={(e) =>
                                setBooking({ ...booking, consultantId: e.target.value })
                              }
                            >
                              <option value="">Consultant…</option>
                              {consultantOptions.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                            <input
                              type="datetime-local"
                              className="h-8 rounded-md border bg-background px-2 text-xs"
                              value={booking.scheduledAt}
                              onChange={(e) =>
                                setBooking({ ...booking, scheduledAt: e.target.value })
                              }
                            />
                            <Button size="sm" onClick={() => confirmBooking(l.id)}>
                              Confirm
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setBookingFor(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => setBookingFor(l.id)}>
                            Book
                          </Button>
                        ))}

                      {/* BOOKED -> set disposition (SOLD creates the sale) */}
                      {l.stage === "BOOKED" && (
                        <select
                          className="h-8 rounded-md border bg-background px-2 text-xs"
                          defaultValue=""
                          onChange={(e) => setDisposition(l.id, e.target.value)}
                        >
                          <option value="">Set disposition…</option>
                          {DISPOSITIONS.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      )}

                      {l.stage === "CONVERTED" && (
                        <span className="text-xs font-medium text-emerald-600">
                          Sold ✓
                        </span>
                      )}
                      {l.stage === "CLOSED" && (
                        <span className="text-xs text-muted-foreground">Closed</span>
                      )}
                    </TD>
                  </TR>
                ))}
            </TBody>
          </DataTable>
        )}
      </section>
    </div>
  );
}
