"use client";

import { Sun, BatteryCharging, Zap } from "lucide-react";
import { useApi } from "@/lib/api/use-api";
import { Section } from "@/components/leads/shared";

interface SystemResponse {
  hasSystem: boolean;
  system: {
    panelModel: string | null;
    panelWatt: number | null;
    numPanels: number | null;
    systemSize: number | null;
    batteryBrand: string | null;
    batteryModel: string | null;
    batterySize: number | null;
    batteryModules: number | null;
    inverterModel: string | null;
    inverterType: string | null;
    phase: string | null;
    roofType: string | null;
    storeys: number | null;
    nmi: string | null;
  } | null;
}

function Spec({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value ?? "—"}</span>
    </div>
  );
}

export function CustomerSystemTab() {
  const res = useApi<SystemResponse>("/customer/system");
  const d = res.data;

  if (res.error)
    return <p className="text-sm text-muted-foreground">{res.error}</p>;
  if (res.loading || !d)
    return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (!d.hasSystem || !d.system)
    return (
      <Section title="My System">
        <p className="py-6 text-center text-sm text-muted-foreground">
          Your system details aren&apos;t available yet.
        </p>
      </Section>
    );

  const s = d.system;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Section
        title="Solar"
        actions={<Sun className="h-5 w-5 text-amber-500" />}
      >
        <Spec label="System Size" value={s.systemSize ? `${s.systemSize} kW` : null} />
        <Spec label="Panels" value={s.numPanels} />
        <Spec label="Panel Model" value={s.panelModel} />
        <Spec label="Panel Output" value={s.panelWatt ? `${s.panelWatt} W` : null} />
        <Spec label="Roof Type" value={s.roofType} />
        <Spec label="Storeys" value={s.storeys} />
      </Section>

      <Section
        title="Battery"
        actions={<BatteryCharging className="h-5 w-5 text-emerald-500" />}
      >
        <Spec label="Brand" value={s.batteryBrand} />
        <Spec label="Model" value={s.batteryModel} />
        <Spec label="Capacity" value={s.batterySize ? `${s.batterySize} kWh` : null} />
        <Spec label="Modules" value={s.batteryModules} />
      </Section>

      <Section
        title="Inverter & Electrical"
        actions={<Zap className="h-5 w-5 text-sky-500" />}
      >
        <Spec label="Inverter Model" value={s.inverterModel} />
        <Spec label="Inverter Type" value={s.inverterType} />
        <Spec label="Phase" value={s.phase} />
        <Spec label="NMI" value={s.nmi} />
      </Section>
    </div>
  );
}
