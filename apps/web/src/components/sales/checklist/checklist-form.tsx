"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { SaveChecklistRequest } from "@astra/shared";
import {
  BUDGET_POSTURE_OPTIONS,
  CATEGORY_OPTIONS,
  CHECKLIST_STATE_OPTIONS,
  DRIVER_OPTIONS,
  PHASE_OPTIONS,
  PREFERENCE_OPTIONS,
  ROOF_TYPE_OPTIONS,
  SPEND_PERIOD_OPTIONS,
} from "@/lib/checklist/types";

type Form = SaveChecklistRequest;

interface Props {
  value: Form;
  onChange: (next: Form) => void;
  /** Field keys flagged missing by the API on a blocked generate. */
  missing: Set<string>;
}

export function ChecklistForm({ value, onChange, missing }: Props) {
  const set = <K extends keyof Form>(key: K, v: Form[K]) =>
    onChange({ ...value, [key]: v });

  const priorRequired = !!value.category && value.category !== "new";

  return (
    <div className="space-y-6">
      <Group title="Lead & site">
        <Field label="State" required miss={missing.has("state")}>
          <Select
            value={value.state ?? ""}
            onChange={(v) => set("state", v || undefined)}
            placeholder="Select state"
            options={CHECKLIST_STATE_OPTIONS.map((s) => ({ value: s, label: s }))}
          />
        </Field>
        <Field
          label="NMI"
          required
          miss={missing.has("nmi") || missing.has("nmi (must be 10–11 chars)")}
          hint="10–11 characters"
        >
          <Text
            value={value.nmi ?? ""}
            onChange={(v) => set("nmi", v || undefined)}
            placeholder="National Meter Identifier"
          />
        </Field>
        <Field label="Roof type" required miss={missing.has("roofType")}>
          <Select
            value={value.roofType ?? ""}
            onChange={(v) => set("roofType", (v || undefined) as Form["roofType"])}
            placeholder="Select roof type"
            options={ROOF_TYPE_OPTIONS}
          />
        </Field>
        <Field label="Phase" required miss={missing.has("phase")}>
          <Select
            value={value.phase ?? ""}
            onChange={(v) => set("phase", (v || undefined) as Form["phase"])}
            placeholder="Single or 3-phase"
            options={PHASE_OPTIONS}
          />
        </Field>
        <Field label="Storeys">
          <Number
            value={value.storeys}
            onChange={(n) => set("storeys", n)}
            placeholder="e.g. 1"
          />
        </Field>
        <Field label="Orientation / aspect">
          <Text
            value={value.orientation ?? ""}
            onChange={(v) => set("orientation", v || undefined)}
            placeholder="e.g. North-facing"
          />
        </Field>
        <Field label="Switchboard">
          <Text
            value={value.switchboard ?? ""}
            onChange={(v) => set("switchboard", v || undefined)}
            placeholder="Age / condition"
          />
        </Field>
        <Field label="Shading notes" full>
          <Text
            value={value.shadingNotes ?? ""}
            onChange={(v) => set("shadingNotes", v || undefined)}
            placeholder="Trees, neighbouring buildings…"
          />
        </Field>
      </Group>

      <Group title="Energy profile">
        <Field label="Electricity spend" required miss={missing.has("spendAmount")}>
          <div className="flex gap-2">
            <Number
              value={value.spendAmount}
              onChange={(n) => set("spendAmount", n)}
              placeholder="$ amount"
            />
            <Select
              value={value.spendPeriod ?? "quarter"}
              onChange={(v) => set("spendPeriod", v as Form["spendPeriod"])}
              options={SPEND_PERIOD_OPTIONS}
            />
          </div>
        </Field>
        <Field label="Budget posture" required miss={missing.has("budgetPosture")}>
          <Select
            value={value.budgetPosture ?? ""}
            onChange={(v) => set("budgetPosture", (v || undefined) as Form["budgetPosture"])}
            placeholder="How are they paying?"
            options={BUDGET_POSTURE_OPTIONS}
          />
        </Field>
        <Field label="Day / night usage split">
          <div className="flex items-center gap-2 text-xs">
            <Number
              value={value.usageSplit?.day}
              onChange={(n) =>
                set("usageSplit", {
                  day: n ?? 0,
                  night: n != null ? 100 - n : (value.usageSplit?.night ?? 0),
                })
              }
              placeholder="Day %"
            />
            <span className="text-muted-foreground">/</span>
            <span className="tabular-nums text-muted-foreground">
              {value.usageSplit?.day != null ? `${100 - value.usageSplit.day}% night` : "night"}
            </span>
          </div>
        </Field>
        <Field label="Customer drivers" required miss={missing.has("drivers")} full>
          <CheckboxGroup
            options={DRIVER_OPTIONS}
            selected={value.drivers ?? []}
            onChange={(next) => set("drivers", next as Form["drivers"])}
          />
        </Field>
      </Group>

      <Group title="System category">
        <Field label="Category" required miss={missing.has("category")}>
          <Select
            value={value.category ?? ""}
            onChange={(v) => set("category", (v || undefined) as Form["category"])}
            placeholder="New / Replacement / …"
            options={CATEGORY_OPTIONS}
          />
        </Field>
        {priorRequired && (
          <div
            className={cn(
              "sm:col-span-2 rounded-md border p-3",
              missing.has("priorSystem (required for non-new systems)")
                ? "border-destructive/60 bg-destructive/5"
                : "border-border bg-muted/30",
            )}
          >
            <p className="mb-2 text-xs font-medium text-foreground">
              Prior system details{" "}
              <span className="text-destructive">*</span>
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Existing array (kW)">
                <Number
                  value={value.priorSystem?.existingArrayKw}
                  onChange={(n) => setPrior(value, onChange, "existingArrayKw", n)}
                  placeholder="e.g. 5"
                />
              </Field>
              <Field label="Array age (yrs)">
                <Number
                  value={value.priorSystem?.existingArrayAgeYears}
                  onChange={(n) => setPrior(value, onChange, "existingArrayAgeYears", n)}
                  placeholder="e.g. 8"
                />
              </Field>
              <Field label="Existing inverter">
                <Text
                  value={value.priorSystem?.existingInverter ?? ""}
                  onChange={(v) => setPrior(value, onChange, "existingInverter", v || undefined)}
                  placeholder="Make / model / size"
                />
              </Field>
              <Field label="Inverter phase">
                <Text
                  value={value.priorSystem?.existingInverterPhase ?? ""}
                  onChange={(v) =>
                    setPrior(value, onChange, "existingInverterPhase", v || undefined)
                  }
                  placeholder="single / 3-phase"
                />
              </Field>
              <Field label="Condition">
                <Select
                  value={
                    value.priorSystem?.working == null
                      ? ""
                      : value.priorSystem.working
                        ? "working"
                        : "faulty"
                  }
                  onChange={(v) =>
                    setPrior(
                      value,
                      onChange,
                      "working",
                      v === "" ? undefined : v === "working",
                    )
                  }
                  placeholder="Working / faulty"
                  options={[
                    { value: "working", label: "Working" },
                    { value: "faulty", label: "Faulty" },
                  ]}
                />
              </Field>
              <Field label="Existing battery">
                <Text
                  value={value.priorSystem?.existingBattery ?? ""}
                  onChange={(v) => setPrior(value, onChange, "existingBattery", v || undefined)}
                  placeholder="If any"
                />
              </Field>
              <Field label="Kept / removed / added" full>
                <Text
                  value={value.priorSystem?.keptRemovedAdded ?? ""}
                  onChange={(v) => setPrior(value, onChange, "keptRemovedAdded", v || undefined)}
                  placeholder="What stays, what goes, what's added"
                />
              </Field>
              <Field label="Disposal" full>
                <Text
                  value={value.priorSystem?.disposal ?? ""}
                  onChange={(v) => setPrior(value, onChange, "disposal", v || undefined)}
                  placeholder="Disposal vs left with customer"
                />
              </Field>
            </div>
          </div>
        )}
      </Group>

      <Group title="Constraints & preferences">
        <Field label="Battery">
          <Select
            value={value.batteryPref ?? "let_ai_decide"}
            onChange={(v) => set("batteryPref", v as Form["batteryPref"])}
            options={PREFERENCE_OPTIONS}
          />
        </Field>
        <Field label="EV charger">
          <Select
            value={value.evChargerPref ?? "let_ai_decide"}
            onChange={(v) => set("evChargerPref", v as Form["evChargerPref"])}
            options={PREFERENCE_OPTIONS}
          />
        </Field>
        <Field label="Hard budget ceiling">
          <Number
            value={value.budgetCeiling}
            onChange={(n) => set("budgetCeiling", n)}
            placeholder="$ max (optional)"
          />
        </Field>
        <Field label="Excluded brands">
          <Text
            value={(value.excludedBrands ?? []).join(", ")}
            onChange={(v) =>
              set(
                "excludedBrands",
                v
                  ? v.split(",").map((s) => s.trim()).filter(Boolean)
                  : undefined,
              )
            }
            placeholder="Comma-separated"
          />
        </Field>
        <Field label="Preferred brands">
          <Text
            value={(value.preferredBrands ?? []).join(", ")}
            onChange={(v) =>
              set(
                "preferredBrands",
                v
                  ? v.split(",").map((s) => s.trim()).filter(Boolean)
                  : undefined,
              )
            }
            placeholder="Comma-separated"
          />
        </Field>
      </Group>
    </div>
  );
}

function setPrior(
  value: Form,
  onChange: (next: Form) => void,
  key: string,
  v: unknown,
) {
  onChange({
    ...value,
    priorSystem: { ...(value.priorSystem ?? {}), [key]: v },
  });
}

// ── primitives ───────────────────────────────────────────────────────────────

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  miss,
  hint,
  full,
  children,
}: {
  label: string;
  required?: boolean;
  miss?: boolean;
  hint?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-1", full && "sm:col-span-2")}>
      <span className="text-xs font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
        {hint && <span className="ml-1 font-normal text-muted-foreground">({hint})</span>}
        {miss && <span className="ml-1 font-normal text-destructive">— required</span>}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Text({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      className={inputCls}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function Number({
  value,
  onChange,
  placeholder,
}: {
  value?: number;
  onChange: (n: number | undefined) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      className={inputCls}
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === "" ? undefined : globalThis.Number(v));
      }}
    />
  );
}

function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}) {
  return (
    <select
      className={inputCls}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function CheckboxGroup({
  options,
  selected,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(v: string) {
    onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]);
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition-colors",
              on
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background hover:bg-accent",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
