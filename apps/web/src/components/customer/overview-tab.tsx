"use client";

import { CheckCircle2, Circle, Clock, MinusCircle, Home, Calendar } from "lucide-react";
import { useApi } from "@/lib/api/use-api";
import { Section, Kpi, KpiRow } from "@/components/leads/shared";
import { money0, shortDate } from "@/components/dashboards/financials/format";
import { titleCase } from "@/lib/utils";

interface OverviewResponse {
  customerName: string;
  email: string | null;
  phone: string | null;
  address: string;
  hasSale: boolean;
  sale: {
    saleRef: string | null;
    status: string;
    saleType: string | null;
    systemType: string | null;
    soldPrice: number;
    saleDate: string | null;
    consultantName: string | null;
  } | null;
  install: {
    status: string;
    installDate: string | null;
    installerName: string | null;
  } | null;
  progress: { completed: number; total: number };
  timeline: { key: string; label: string; status: string }[];
}

function StageIcon({ status }: { status: string }) {
  if (status === "COMPLETED")
    return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
  if (status === "IN_PROGRESS")
    return <Clock className="h-5 w-5 text-sky-500" />;
  if (status === "NOT_REQUIRED")
    return <MinusCircle className="h-5 w-5 text-muted-foreground" />;
  return <Circle className="h-5 w-5 text-muted-foreground/50" />;
}

export function CustomerOverviewTab() {
  const res = useApi<OverviewResponse>("/customer/overview");
  const d = res.data;

  if (res.error)
    return (
      <Section title="Welcome">
        <p className="text-sm text-muted-foreground">{res.error}</p>
      </Section>
    );
  if (res.loading || !d)
    return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <Section title={`Welcome, ${d.customerName}`}>
        <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Contact
            </div>
            <div>{d.email ?? "—"}</div>
            <div>{d.phone ?? "—"}</div>
          </div>
          <div className="flex items-start gap-2">
            <Home className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Address
              </div>
              <div>{d.address || "—"}</div>
            </div>
          </div>
          {d.sale?.consultantName && (
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Your Consultant
              </div>
              <div>{d.sale.consultantName}</div>
            </div>
          )}
        </div>
      </Section>

      {!d.hasSale ? (
        <Section title="Your System">
          <p className="py-6 text-center text-sm text-muted-foreground">
            No system on file yet. Your consultant will be in touch.
          </p>
        </Section>
      ) : (
        <>
          <KpiRow>
            <Kpi
              label="System Value"
              value={money0(d.sale!.soldPrice)}
              tone="success"
            />
            <Kpi label="Sale Status" value={titleCase(d.sale!.status)} tone="primary" />
            <Kpi
              label="Install Status"
              value={d.install?.status ? titleCase(d.install.status) : "Pending"}
              tone="info"
              icon={<Calendar className="h-4 w-4" />}
              hint={
                d.install?.installDate
                  ? `Booked ${shortDate(d.install.installDate)}`
                  : undefined
              }
            />
            <Kpi
              label="Progress"
              value={`${d.progress.completed}/${d.progress.total}`}
              tone="purple"
              hint="stages complete"
            />
          </KpiRow>

          <Section
            title="Your Installation Journey"
            description="Live status of each step toward switch-on."
          >
            <ol className="space-y-3">
              {d.timeline.map((t) => (
                <li key={t.key} className="flex items-center gap-3">
                  <StageIcon status={t.status} />
                  <span className="flex-1 text-sm font-medium">{t.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {titleCase(t.status)}
                  </span>
                </li>
              ))}
            </ol>
          </Section>
        </>
      )}
    </div>
  );
}
