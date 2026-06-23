"use client";

import * as React from "react";
import {
  BatteryCharging,
  Check,
  Copy,
  Star,
  Sun,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/leads/shared";
import { fmtAud, permitFlagLabel } from "@/lib/checklist/types";
import type { SystemOption, SystemRecommendationResult } from "@astra/shared";

interface Props {
  result: SystemRecommendationResult;
  recommendedOptionId: string;
  selectedOptionId?: string | null;
  onSelect: (optionId: string) => void;
}

export function ChecklistResults({
  result,
  recommendedOptionId,
  selectedOptionId,
  onSelect,
}: Props) {
  // Recommended option first, then the rest in their given order.
  const ordered = React.useMemo(() => {
    const rec = result.options.find((o) => o.option_id === recommendedOptionId);
    const rest = result.options.filter((o) => o.option_id !== recommendedOptionId);
    return rec ? [rec, ...rest] : result.options;
  }, [result.options, recommendedOptionId]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        5 quote-ready options. Prices and repayments are{" "}
        <strong className="text-foreground">indicative</strong> and subject to
        lender approval — not financial advice.
      </p>
      <div className="grid gap-3">
        {ordered.map((opt) => (
          <OptionCard
            key={opt.option_id}
            option={opt}
            recommended={opt.option_id === recommendedOptionId}
            selected={opt.option_id === selectedOptionId}
            onSelect={() => onSelect(opt.option_id)}
          />
        ))}
      </div>
    </div>
  );
}

function OptionCard({
  option,
  recommended,
  selected,
  onSelect,
}: {
  option: SystemOption;
  recommended: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const [copied, setCopied] = React.useState(false);

  function copySummary() {
    void navigator.clipboard?.writeText(summariseOption(option)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4",
        recommended
          ? "border-primary ring-1 ring-primary/40 shadow-sm"
          : "border-border",
        selected && "ring-2 ring-emerald-500/60",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {recommended && (
          <StatusBadge tone="primary" variant="soft" dot>
            <Star className="mr-1 h-3 w-3" />
            Most Recommended
          </StatusBadge>
        )}
        <span className="text-sm font-semibold text-foreground">
          {option.label}
        </span>
        {option.permit_flags.map((f) => (
          <StatusBadge key={f} tone="warning" variant="soft">
            {permitFlagLabel(f)}
          </StatusBadge>
        ))}
        <span className="ml-auto text-base font-semibold tabular-nums text-foreground">
          {fmtAud(option.price.total_inc_gst)}
          <span className="ml-1 text-[10px] font-normal uppercase text-muted-foreground">
            inc GST · indicative
          </span>
        </span>
      </div>

      <p className="mt-1.5 text-sm text-muted-foreground">{option.summary}</p>

      {/* Sizing */}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
        <Spec icon={<Sun className="h-3.5 w-3.5" />} label="Array">
          {option.sizing.array_kw} kW
        </Spec>
        <Spec icon={<Zap className="h-3.5 w-3.5" />} label="Inverter">
          {option.sizing.inverter_kw} kW · {option.sizing.inverter_phase}
        </Spec>
        {option.sizing.battery_kwh != null && (
          <Spec icon={<BatteryCharging className="h-3.5 w-3.5" />} label="Battery">
            {option.sizing.battery_kwh} kWh
          </Spec>
        )}
      </div>

      {/* Products */}
      <dl className="mt-3 grid gap-1 text-xs sm:grid-cols-2">
        <Row label="Panels">{option.products.panels}</Row>
        <Row label="Inverter">{option.products.inverter}</Row>
        {option.products.battery && <Row label="Battery">{option.products.battery}</Row>}
        {option.products.extras && option.products.extras.length > 0 && (
          <Row label="Extras">{option.products.extras.join(", ")}</Row>
        )}
      </dl>

      {/* Finance */}
      {option.finance.products.length > 0 && (
        <div className="mt-3 rounded-md bg-muted/40 p-2.5 text-xs">
          <p className="mb-1 font-medium text-foreground">Finance (indicative)</p>
          <ul className="space-y-0.5">
            {option.finance.products.map((f, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 text-muted-foreground">
                <span>
                  {f.name} — {fmtAud(f.amount)} over {f.term_years}y
                </span>
                <span className="tabular-nums text-foreground">
                  ~{fmtAud(f.approx_repayment)}/{f.frequency.replace("fortnightly", "fn")}
                </span>
              </li>
            ))}
          </ul>
          {option.finance.combined_repayment_note && (
            <p className="mt-1 text-muted-foreground">{option.finance.combined_repayment_note}</p>
          )}
        </div>
      )}

      {/* Rationale / tradeoffs */}
      <div className="mt-3 grid gap-1 text-xs">
        <p className="text-foreground">
          <span className="font-medium">Why: </span>
          {option.rationale}
        </p>
        <p className="text-muted-foreground">
          <span className="font-medium">Tradeoffs: </span>
          {option.tradeoffs}
        </p>
      </div>

      {/* Actions */}
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" variant={selected ? "secondary" : "default"} onClick={onSelect}>
          {selected ? (
            <>
              <Check className="h-3.5 w-3.5" /> Selected
            </>
          ) : (
            "Use this option"
          )}
        </Button>
        <Button size="sm" variant="ghost" onClick={copySummary}>
          <Copy className="h-3.5 w-3.5" />
          {copied ? "Copied" : "Copy summary"}
        </Button>
      </div>
    </div>
  );
}

function Spec({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-foreground">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium tabular-nums">{children}</span>
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-muted-foreground">{label}:</dt>
      <dd className="text-foreground">{children}</dd>
    </div>
  );
}

function summariseOption(o: SystemOption): string {
  const lines = [
    `${o.label} — ${fmtAud(o.price.total_inc_gst)} inc GST (indicative)`,
    o.summary,
    `Sizing: ${o.sizing.array_kw}kW array, ${o.sizing.inverter_kw}kW ${o.sizing.inverter_phase} inverter${
      o.sizing.battery_kwh != null ? `, ${o.sizing.battery_kwh}kWh battery` : ""
    }`,
    `Panels: ${o.products.panels}`,
    `Inverter: ${o.products.inverter}`,
    o.products.battery ? `Battery: ${o.products.battery}` : null,
    o.products.extras?.length ? `Extras: ${o.products.extras.join(", ")}` : null,
    ...o.finance.products.map(
      (f) =>
        `Finance: ${f.name} ${fmtAud(f.amount)} over ${f.term_years}y ~${fmtAud(
          f.approx_repayment,
        )}/${f.frequency}`,
    ),
    `Why: ${o.rationale}`,
    `Tradeoffs: ${o.tradeoffs}`,
  ].filter(Boolean);
  return lines.join("\n");
}
