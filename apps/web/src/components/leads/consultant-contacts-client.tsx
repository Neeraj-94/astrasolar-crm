"use client";

/**
 * Consultant Contacts — client component (Leads dashboard).
 *
 * Faithful port of the astrasolar-app "Consultant Contacts" tab. Each
 * consultant has a callback number AND a ClickSend sender ID per brand — one
 * pair for Astra Solar, one pair for DC Solar. A blank field reverts that one
 * to the system default; Remove clears the whole row.
 *
 * Storage moved from Firebase RTDB to the API/Postgres stack: reads come from
 * the server component, writes go through ConsultantContactsApi. Edit access is
 * gated by `canEdit` (Lead Gen / Admin / CEO / Super Admin); everyone else sees
 * the table read-only.
 */

import { useMemo, useState } from "react";
import { Phone, Check, Loader2, AlertCircle } from "lucide-react";
import type { ConsultantContactDto } from "@astra/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ConsultantContactsApi } from "@/lib/api/endpoints";
import { PageHeader } from "./shared";

type RowState = "idle" | "saving" | "saved" | "error";

interface Draft {
  contactPhoneAstra: string;
  senderIdAstra: string;
  contactPhoneDc: string;
  senderIdDc: string;
}

// ---- validation (mirrors the API + legacy lgValidate* helpers) -------------

function validateAuMobile(raw: string): { ok: boolean; reason?: string } {
  const s = (raw || "").trim();
  if (!s) return { ok: true }; // empty = "use default"
  let digits = s.replace(/[\s\-()]/g, "");
  if (digits.startsWith("+61")) digits = "0" + digits.slice(3);
  else if (digits.startsWith("61") && digits.length === 11)
    digits = "0" + digits.slice(2);
  if (!/^\d+$/.test(digits))
    return { ok: false, reason: "Numbers, +, spaces, parentheses and dashes only." };
  if (!/^04\d{8}$/.test(digits))
    return {
      ok: false,
      reason:
        "Must be a 10-digit Australian mobile starting with 04 (e.g. 0412 345 678).",
    };
  return { ok: true };
}

function validateSenderId(raw: string): { ok: boolean; reason?: string } {
  const s = (raw || "").trim();
  if (!s) return { ok: true };
  if (!/^[A-Za-z0-9]{3,11}$/.test(s))
    return {
      ok: false,
      reason: "Sender ID must be 3–11 letters/digits, no spaces (e.g. ASTRASOLAR).",
    };
  return { ok: true };
}

function toDraft(c: ConsultantContactDto): Draft {
  return {
    contactPhoneAstra: c.contactPhoneAstra ?? "",
    senderIdAstra: c.senderIdAstra ?? "",
    contactPhoneDc: c.contactPhoneDc ?? "",
    senderIdDc: c.senderIdDc ?? "",
  };
}

function lastUpdatedHint(c: ConsultantContactDto): string {
  if (!c.updatedAt) return "Using system defaults";
  const when = new Date(c.updatedAt).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `Last updated ${when}${c.updatedByName ? ` by ${c.updatedByName}` : ""}`;
}

const inputCls =
  "w-full max-w-[170px] rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 disabled:cursor-not-allowed";
const senderCls = cn(inputCls, "max-w-[135px] uppercase");

export function ConsultantContactsClient({
  initialContacts,
  canEdit,
}: {
  initialContacts: ConsultantContactDto[];
  canEdit: boolean;
}) {
  const [contacts, setContacts] = useState<ConsultantContactDto[]>(initialContacts);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(initialContacts.map((c) => [c.consultantId, toDraft(c)])),
  );
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [rowMsg, setRowMsg] = useState<Record<string, string>>({});

  const byId = useMemo(
    () => Object.fromEntries(contacts.map((c) => [c.consultantId, c])),
    [contacts],
  );

  function setField(id: string, key: keyof Draft, value: string) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], [key]: value } }));
    setRowState((s) => ({ ...s, [id]: "idle" }));
  }

  async function refresh() {
    try {
      const fresh = await ConsultantContactsApi.list();
      setContacts(fresh);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const c of fresh) next[c.consultantId] = toDraft(c);
        return next;
      });
    } catch {
      /* keep optimistic state; a reload will reconcile */
    }
  }

  async function save(id: string) {
    if (!canEdit) return;
    const d = drafts[id];
    if (!d) return;

    const checks: Array<[boolean, string | undefined]> = [
      [validateAuMobile(d.contactPhoneAstra).ok, validateAuMobile(d.contactPhoneAstra).reason],
      [validateSenderId(d.senderIdAstra).ok, validateSenderId(d.senderIdAstra).reason],
      [validateAuMobile(d.contactPhoneDc).ok, validateAuMobile(d.contactPhoneDc).reason],
      [validateSenderId(d.senderIdDc).ok, validateSenderId(d.senderIdDc).reason],
    ];
    const labels = ["Astra number", "Astra sender ID", "DC Solar number", "DC Solar sender ID"];
    const failedIdx = checks.findIndex(([ok]) => !ok);
    if (failedIdx >= 0) {
      setRowState((s) => ({ ...s, [id]: "error" }));
      setRowMsg((m) => ({ ...m, [id]: `${labels[failedIdx]}: ${checks[failedIdx][1]}` }));
      return;
    }

    const allBlank =
      !d.contactPhoneAstra.trim() &&
      !d.senderIdAstra.trim() &&
      !d.contactPhoneDc.trim() &&
      !d.senderIdDc.trim();
    if (allBlank) {
      setRowState((s) => ({ ...s, [id]: "error" }));
      setRowMsg((m) => ({
        ...m,
        [id]: "All fields are blank — click Remove to clear this override.",
      }));
      return;
    }

    setRowState((s) => ({ ...s, [id]: "saving" }));
    try {
      await ConsultantContactsApi.upsert(id, {
        contactPhoneAstra: d.contactPhoneAstra,
        senderIdAstra: d.senderIdAstra,
        contactPhoneDc: d.contactPhoneDc,
        senderIdDc: d.senderIdDc,
      });
      await refresh();
      setRowState((s) => ({ ...s, [id]: "saved" }));
      setRowMsg((m) => ({ ...m, [id]: "" }));
    } catch (e) {
      setRowState((s) => ({ ...s, [id]: "error" }));
      setRowMsg((m) => ({
        ...m,
        [id]: e instanceof Error ? e.message : "Save failed — please try again.",
      }));
    }
  }

  async function remove(id: string) {
    if (!canEdit) return;
    const name = byId[id]?.name ?? id;
    if (
      !window.confirm(
        `Remove ${name}'s contact override?\n\nSMS will revert to the system default number/sender for this consultant.`,
      )
    )
      return;
    setRowState((s) => ({ ...s, [id]: "saving" }));
    try {
      await ConsultantContactsApi.remove(id);
      await refresh();
      setRowState((s) => ({ ...s, [id]: "idle" }));
      setRowMsg((m) => ({ ...m, [id]: "" }));
    } catch (e) {
      setRowState((s) => ({ ...s, [id]: "error" }));
      setRowMsg((m) => ({
        ...m,
        [id]: e instanceof Error ? e.message : "Remove failed — please try again.",
      }));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Leads"
        title="Consultant Contacts"
        description="Per-consultant callback numbers and SMS sender IDs for each brand."
      />

      <p className="max-w-3xl text-sm text-muted-foreground">
        Each consultant has a callback number <strong>and</strong> a ClickSend sender ID per
        brand — one pair for <span className="font-semibold text-primary">Astra Solar</span>, one
        for <span className="font-semibold text-primary">DC Solar</span>. The number that lands in{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">{"{{consultantPhone}}"}</code> on an
        outbound SMS — and the sender shown on the recipient&apos;s phone — are both picked from
        whichever brand the lead was booked under. Leave a field blank to revert just that one to
        the system default; click Remove to clear the whole row.
      </p>

      {contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card py-16 text-center">
          <Phone className="h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-foreground">No consultants found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Active sales consultants will appear here once they exist.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[1000px] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  className="border-b border-r border-border bg-muted/50 px-4 py-2.5 text-left align-bottom text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  Consultant
                </th>
                <th
                  colSpan={2}
                  className="border-b border-r border-border bg-muted/50 px-4 pb-1 pt-2 text-center text-[0.65rem] font-bold uppercase tracking-wider text-primary"
                >
                  Astra Solar
                </th>
                <th
                  colSpan={2}
                  className="border-b border-r border-border bg-muted/50 px-4 pb-1 pt-2 text-center text-[0.65rem] font-bold uppercase tracking-wider text-primary"
                >
                  DC Solar
                </th>
                <th
                  rowSpan={2}
                  className="sticky right-0 z-[2] border-b border-l border-border bg-muted/50 px-4 py-2.5 text-right align-bottom text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground shadow-[-6px_0_10px_-6px_rgba(0,0,0,0.35)]"
                >
                  Actions
                </th>
              </tr>
              <tr>
                <th className="border-b border-border bg-muted/50 px-4 pb-2 pt-1 text-left text-[0.55rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  Number
                </th>
                <th className="border-b border-r border-border bg-muted/50 px-4 pb-2 pt-1 text-left text-[0.55rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  Sender ID
                </th>
                <th className="border-b border-border bg-muted/50 px-4 pb-2 pt-1 text-left text-[0.55rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  Number
                </th>
                <th className="border-b border-r border-border bg-muted/50 px-4 pb-2 pt-1 text-left text-[0.55rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  Sender ID
                </th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => {
                const id = c.consultantId;
                const d = drafts[id] ?? toDraft(c);
                const state = rowState[id] ?? "idle";
                const msg = rowMsg[id];
                return (
                  <tr key={id}>
                    <td className="border-b border-r border-border px-4 py-3 align-middle">
                      <div className="font-semibold text-foreground">{c.name || id}</div>
                      {c.role && (
                        <div className="mt-0.5 text-xs text-muted-foreground">{c.role}</div>
                      )}
                      <div className="mt-0.5 text-[0.65rem] text-muted-foreground">
                        {lastUpdatedHint(c)}
                      </div>
                      {state === "error" && msg && (
                        <div className="mt-1 flex items-center gap-1 text-[0.65rem] text-destructive">
                          <AlertCircle className="h-3 w-3 shrink-0" />
                          <span>{msg}</span>
                        </div>
                      )}
                    </td>
                    <td className="border-b border-border px-4 py-2.5 align-middle">
                      <input
                        type="tel"
                        value={d.contactPhoneAstra}
                        onChange={(e) => setField(id, "contactPhoneAstra", e.target.value)}
                        placeholder={c.contactPhoneAstra ? "" : "e.g. 0412 345 678"}
                        autoComplete="off"
                        disabled={!canEdit}
                        className={inputCls}
                      />
                    </td>
                    <td className="border-b border-r border-border px-4 py-2.5 align-middle">
                      <input
                        type="text"
                        value={d.senderIdAstra}
                        onChange={(e) => setField(id, "senderIdAstra", e.target.value)}
                        placeholder="Default: ASTRASOLAR"
                        maxLength={11}
                        autoComplete="off"
                        disabled={!canEdit}
                        className={senderCls}
                      />
                    </td>
                    <td className="border-b border-border px-4 py-2.5 align-middle">
                      <input
                        type="tel"
                        value={d.contactPhoneDc}
                        onChange={(e) => setField(id, "contactPhoneDc", e.target.value)}
                        placeholder={c.contactPhoneDc ? "" : "e.g. 0412 345 678"}
                        autoComplete="off"
                        disabled={!canEdit}
                        className={inputCls}
                      />
                    </td>
                    <td className="border-b border-r border-border px-4 py-2.5 align-middle">
                      <input
                        type="text"
                        value={d.senderIdDc}
                        onChange={(e) => setField(id, "senderIdDc", e.target.value)}
                        placeholder="Default: DCSOLAR"
                        maxLength={11}
                        autoComplete="off"
                        disabled={!canEdit}
                        className={senderCls}
                      />
                    </td>
                    <td className="sticky right-0 z-[1] whitespace-nowrap border-b border-l border-border bg-card px-4 py-2.5 text-right align-middle shadow-[-6px_0_10px_-6px_rgba(0,0,0,0.35)]">
                      {canEdit ? (
                        <div className="flex items-center justify-end gap-2">
                          {state === "saved" && (
                            <span className="flex items-center gap-1 text-xs text-emerald-500">
                              <Check className="h-3.5 w-3.5" /> Saved
                            </span>
                          )}
                          <Button
                            size="sm"
                            variant="default"
                            disabled={state === "saving"}
                            onClick={() => save(id)}
                          >
                            {state === "saving" ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              "Save"
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={state === "saving" || !c.hasOverride}
                            onClick={() => remove(id)}
                          >
                            Remove
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Read-only</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        <strong className="text-foreground">Contact number format:</strong> Australian mobile, e.g.{" "}
        <code className="rounded bg-muted px-1 py-0.5">0412 345 678</code> or{" "}
        <code className="rounded bg-muted px-1 py-0.5">+61 412 345 678</code>.&nbsp;·&nbsp;
        <strong className="text-foreground">Sender ID:</strong> 3–11 alphanumeric characters, no
        spaces, e.g. <code className="rounded bg-muted px-1 py-0.5">ASTRASOLAR</code>.
      </p>
    </div>
  );
}
