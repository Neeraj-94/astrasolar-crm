"use client";

import * as React from "react";
import { Info, Mail, Phone, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CONSULTANTS, type MockConsultant } from "@/lib/leads/mock";
import { cn } from "@/lib/utils";
import {
  ConsultantAvatar,
  Kpi,
  KpiRow,
  PageHeader,
  SearchInput,
  Section,
  StatusBadge,
  SubTabs,
} from "./shared";

interface ContactState {
  astraNumber: string;
  astraSenderId: string;
  dcNumber: string;
  dcSenderId: string;
  dirty: boolean;
}

const DEFAULTS = {
  astraSenderId: "ASTRASOLAR",
  dcSenderId: "DCSOLAR",
};

const PHONE_RE = /^(\+?61|0)\s?4\d{2}\s?\d{3}\s?\d{3}$/;
const SENDER_RE = /^[A-Z0-9]{3,11}$/;

function buildInitial(c: MockConsultant): ContactState {
  return {
    astraNumber: c.astraNumber ?? "",
    astraSenderId: c.astraSenderId ?? "",
    dcNumber: c.dcNumber ?? "",
    dcSenderId: c.dcSenderId ?? "",
    dirty: false,
  };
}

export function ConsultantContactsTab() {
  const [state, setState] = React.useState<Record<string, ContactState>>(() =>
    Object.fromEntries(CONSULTANTS.map((c) => [c.id, buildInitial(c)])),
  );
  const [region, setRegion] = React.useState<"ALL" | "TAS" | "ACT" | "VIC" | "NSW">(
    "ALL",
  );
  const [search, setSearch] = React.useState("");

  const visible = CONSULTANTS.filter(
    (c) => region === "ALL" || c.region === region,
  ).filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
    );
  });

  const dirtyCount = Object.values(state).filter((s) => s.dirty).length;
  const configuredAstra = CONSULTANTS.filter(
    (c) => state[c.id]?.astraNumber || state[c.id]?.astraSenderId,
  ).length;
  const configuredDc = CONSULTANTS.filter(
    (c) => state[c.id]?.dcNumber || state[c.id]?.dcSenderId,
  ).length;

  function update(id: string, patch: Partial<ContactState>) {
    setState((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch, dirty: true },
    }));
  }

  function reset(id: string) {
    const c = CONSULTANTS.find((x) => x.id === id);
    if (!c) return;
    setState((prev) => ({ ...prev, [id]: buildInitial(c) }));
  }

  function saveAll() {
    setState((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([k, v]) => [k, { ...v, dirty: false }]),
      ),
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Leads · SMS routing"
        title="Consultant Contacts"
        description="Per-consultant callback number and SMS sender ID, separately for Astra Solar and DC Solar. Templates pick the right pair based on the brand the lead was booked under."
        actions={
          <Button
            size="sm"
            className="gap-2"
            disabled={dirtyCount === 0}
            onClick={saveAll}
          >
            <Save className="h-4 w-4" />
            Save changes
            {dirtyCount > 0 && (
              <span className="ml-1 rounded-full bg-primary-foreground/20 px-1.5 py-0.5 text-xs tabular-nums">
                {dirtyCount}
              </span>
            )}
          </Button>
        }
      />

      <KpiRow>
        <Kpi
          label="Consultants"
          value={CONSULTANTS.length}
          hint={`${CONSULTANTS.filter((c) => c.active).length} active`}
          tone="primary"
        />
        <Kpi
          label="Astra configured"
          value={configuredAstra}
          hint={`of ${CONSULTANTS.length}`}
          tone="warning"
        />
        <Kpi
          label="DC configured"
          value={configuredDc}
          hint={`of ${CONSULTANTS.length}`}
          tone="purple"
        />
        <Kpi
          label="Unsaved changes"
          value={dirtyCount}
          hint={dirtyCount === 0 ? "Everything in sync" : "Click save to sync"}
          tone={dirtyCount > 0 ? "warning" : "success"}
        />
      </KpiRow>

      <div className="rounded-lg border bg-card/50 p-3 flex items-start gap-3 text-sm">
        <Info className="h-4 w-4 mt-0.5 text-primary shrink-0" />
        <div className="text-muted-foreground">
          Templates substitute{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            {"{{consultantPhone}}"}
          </code>{" "}
          with the brand-specific number. If a consultant has no override for a
          brand, the system default ({DEFAULTS.astraSenderId} /{" "}
          {DEFAULTS.dcSenderId}) is used. Leave any field blank to revert just
          that one.
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SubTabs
          value={region}
          onChange={(v) =>
            setRegion(v as "ALL" | "TAS" | "ACT" | "VIC" | "NSW")
          }
          tabs={[
            { key: "ALL", label: "All regions", count: CONSULTANTS.length },
            { key: "TAS", label: "TAS", count: CONSULTANTS.filter((c) => c.region === "TAS").length },
            { key: "ACT", label: "ACT", count: CONSULTANTS.filter((c) => c.region === "ACT").length },
            { key: "VIC", label: "VIC", count: CONSULTANTS.filter((c) => c.region === "VIC").length },
            { key: "NSW", label: "NSW", count: CONSULTANTS.filter((c) => c.region === "NSW").length },
          ]}
        />
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search consultant…"
          className="w-72"
        />
      </div>

      <Section flush>
        <div className="grid divide-y">
          <div className="hidden md:grid grid-cols-[2fr_1.6fr_1fr_1.6fr_1fr_auto] gap-3 px-4 py-3 bg-muted/40 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <div>Consultant</div>
            <div>Astra Solar — Number</div>
            <div>Astra Sender ID</div>
            <div>DC Solar — Number</div>
            <div>DC Sender ID</div>
            <div className="text-right pr-2">Actions</div>
          </div>
          {visible.length === 0 ? (
            <div className="px-4 py-16 text-center text-muted-foreground">
              No consultants match the current filter.
            </div>
          ) : (
            visible.map((c) => {
              const s = state[c.id];
              const astraPhoneValid =
                !s.astraNumber || PHONE_RE.test(s.astraNumber.replace(/\s/g, ""));
              const dcPhoneValid =
                !s.dcNumber || PHONE_RE.test(s.dcNumber.replace(/\s/g, ""));
              const astraSenderValid =
                !s.astraSenderId ||
                SENDER_RE.test(s.astraSenderId.toUpperCase());
              const dcSenderValid =
                !s.dcSenderId || SENDER_RE.test(s.dcSenderId.toUpperCase());
              return (
                <div
                  key={c.id}
                  className={cn(
                    "grid md:grid-cols-[2fr_1.6fr_1fr_1.6fr_1fr_auto] gap-3 px-4 py-3 items-center",
                    s.dirty && "bg-amber-500/5",
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <ConsultantAvatar name={c.name} size="md" />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{c.name}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <Mail className="h-3 w-3" />
                        <span className="truncate">{c.email}</span>
                        <StatusBadge tone="neutral">{c.region}</StatusBadge>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <ContactInput
                      placeholder="0412 345 678"
                      value={s.astraNumber}
                      onChange={(v) => update(c.id, { astraNumber: v })}
                      icon={<Phone className="h-3.5 w-3.5" />}
                      invalid={!astraPhoneValid}
                    />
                    {!astraPhoneValid && (
                      <span className="text-xs text-destructive">
                        Invalid AU mobile
                      </span>
                    )}
                  </div>
                  <ContactInput
                    placeholder={DEFAULTS.astraSenderId}
                    value={s.astraSenderId}
                    onChange={(v) =>
                      update(c.id, { astraSenderId: v.toUpperCase() })
                    }
                    invalid={!astraSenderValid}
                    mono
                  />

                  <div className="flex flex-col gap-1">
                    <ContactInput
                      placeholder="0455 678 901"
                      value={s.dcNumber}
                      onChange={(v) => update(c.id, { dcNumber: v })}
                      icon={<Phone className="h-3.5 w-3.5" />}
                      invalid={!dcPhoneValid}
                    />
                    {!dcPhoneValid && (
                      <span className="text-xs text-destructive">
                        Invalid AU mobile
                      </span>
                    )}
                  </div>
                  <ContactInput
                    placeholder={DEFAULTS.dcSenderId}
                    value={s.dcSenderId}
                    onChange={(v) =>
                      update(c.id, { dcSenderId: v.toUpperCase() })
                    }
                    invalid={!dcSenderValid}
                    mono
                  />

                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 gap-1"
                      onClick={() => reset(c.id)}
                      disabled={!s.dirty}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reset
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Section>
    </div>
  );
}

function ContactInput({
  value,
  onChange,
  placeholder,
  icon,
  invalid,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  icon?: React.ReactNode;
  invalid?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="relative">
      {icon && (
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
          {icon}
        </span>
      )}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "h-9 w-full rounded-md border border-input bg-background text-sm placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring px-3",
          icon && "pl-8",
          mono && "tabular-nums tracking-wide uppercase",
          invalid && "border-destructive focus-visible:ring-destructive",
        )}
      />
    </div>
  );
}
