"use client";

import * as React from "react";
import { Loader2, X } from "lucide-react";
import { Company, LeadSource } from "@astra/shared";
import { Button } from "@/components/ui/button";
import { useApi } from "@/lib/api/use-api";
import { apiPatch } from "@/lib/api/client";

/**
 * Edit Lead modal — the v2 port of astrasolar-app's `openLeadEdit` / "Edit"
 * button on a My Leads row. Fetches the lead's full record, lets the consultant
 * correct contact / detail fields, and PATCHes /leads/:id.
 */
interface Props {
  leadId: string;
  onClose: () => void;
  onSaved?: () => void;
}

interface ApiLeadFull {
  firstName?: string | null;
  surName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  postCode?: string | null;
  state?: string | null;
  billSpend?: string | null;
  company?: string | null;
  source?: string | null;
  leadGenNotes?: string | null;
}

interface FormState {
  firstName: string;
  surName: string;
  phone: string;
  email: string;
  address: string;
  postCode: string;
  state: string;
  billSpend: string;
  company: string;
  source: string;
  leadGenNotes: string;
}

const COMPANY_OPTS: Array<{ value: string; label: string }> = [
  { value: Company.ASTRA, label: "Astra" },
  { value: Company.DC, label: "DC" },
];
const SOURCE_OPTS: Array<{ value: string; label: string }> = [
  { value: LeadSource.BLOOM_ASTRA, label: "Bloom Astra" },
  { value: LeadSource.REFERRAL, label: "Referral" },
  { value: LeadSource.INBOUND, label: "Inbound" },
  { value: LeadSource.WEBSITE, label: "Website" },
  { value: LeadSource.BRIGHTE, label: "Brighte" },
];

export function LeadEditDialog({ leadId, onClose, onSaved }: Props) {
  const { data, loading } = useApi<ApiLeadFull>(`/leads/${leadId}`);
  const [form, setForm] = React.useState<FormState | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Hydrate once the lead loads.
  React.useEffect(() => {
    if (!data || form) return;
    setForm({
      firstName: data.firstName ?? "",
      surName: data.surName ?? "",
      phone: data.phone ?? "",
      email: data.email ?? "",
      address: data.address ?? "",
      postCode: data.postCode ?? "",
      state: data.state ?? "",
      billSpend: data.billSpend ?? "",
      company: data.company ?? "",
      source: data.source ?? "",
      leadGenNotes: data.leadGenNotes ?? "",
    });
  }, [data, form]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  async function save() {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      await apiPatch(`/leads/${leadId}`, {
        firstName: form.firstName.trim(),
        surName: form.surName.trim(),
        phone: form.phone || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
        postCode: form.postCode || undefined,
        state: form.state || undefined,
        billSpend: form.billSpend || undefined,
        company: form.company || undefined,
        source: form.source || undefined,
        leadGenNotes: form.leadGenNotes || undefined,
      });
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the lead.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Edit lead"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-xl max-h-[92vh] overflow-hidden rounded-xl border bg-card shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Edit Lead</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-muted-foreground hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading || !form ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
              <Text label="First Name" value={form.firstName} onChange={(v) => set("firstName", v)} />
              <Text label="Surname" value={form.surName} onChange={(v) => set("surName", v)} />
              <Text label="Phone" value={form.phone} onChange={(v) => set("phone", v)} placeholder="61400000000" />
              <Text label="Email" type="email" value={form.email} onChange={(v) => set("email", v)} placeholder="customer@email.com" />
              <Text label="Address" value={form.address} onChange={(v) => set("address", v)} full />
              <Text label="State" value={form.state} onChange={(v) => set("state", v)} placeholder="ACT, NSW, …" />
              <Text label="Postcode" value={form.postCode} onChange={(v) => set("postCode", v)} placeholder="2600" />
              <Text label="Bills (avg / quarter)" value={form.billSpend} onChange={(v) => set("billSpend", v)} placeholder="$650" />
              <Select label="Company" value={form.company} onChange={(v) => set("company", v)} options={COMPANY_OPTS} />
              <Select label="Source" value={form.source} onChange={(v) => set("source", v)} options={SOURCE_OPTS} />
              <div className="sm:col-span-2">
                <Label>LG Notes</Label>
                <textarea
                  value={form.leadGenNotes}
                  onChange={(e) => set("leadGenNotes", e.target.value)}
                  rows={3}
                  placeholder="Anything the consultant should know"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}
          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || !form} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Lead
          </Button>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs font-medium text-muted-foreground">{children}</label>;
}

function Text({
  label, value, onChange, placeholder, type = "text", full,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : undefined}>
      <Label>{label}</Label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
      />
    </div>
  );
}

function Select({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
      >
        <option value="">— Select —</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
