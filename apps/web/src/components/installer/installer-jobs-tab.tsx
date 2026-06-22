"use client";

import { useApi } from "@/lib/api/use-api";
import { apiPatch } from "@/lib/api/client";
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

interface Installation {
  id: string;
  status: string;
  installDate: string | null;
  scheduledAt: string | null;
  installer: { id: string; name: string } | null;
  sale: {
    saleRef: string | null;
    lead: { firstName: string; surName: string } | null;
  } | null;
}

const STATUSES = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "ON_HOLD", "CANCELLED"];
const COLORS: Record<string, string> = {
  SCHEDULED: "bg-sky-100 text-sky-700",
  IN_PROGRESS: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  ON_HOLD: "bg-orange-100 text-orange-700",
  CANCELLED: "bg-zinc-100 text-zinc-600",
};

/**
 * Installer jobs — scoped to the installer's own installations
 * (installs:read:own). Updating status hits PATCH /installations/:id.
 */
export function InstallerJobsTab() {
  const jobs = useApi<Installation[]>("/installations");
  const sortable = useRowReorder(jobs, (j) => j.id, "/installations/reorder");

  async function setStatus(id: string, status: string) {
    try {
      await apiPatch(`/installations/${id}`, { status });
      jobs.reload();
    } catch {
      /* surfaced by the segment error boundary if persistent */
    }
  }

  return (
    <section className="rounded-xl border bg-card p-5">
      <h3 className="mb-4 text-sm font-semibold">
        Installations {jobs.data ? `(${jobs.data.length})` : ""}
      </h3>
      {jobs.loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : jobs.error ? (
        <p className="text-sm text-destructive">{jobs.error}</p>
      ) : (jobs.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No installations assigned yet.
        </p>
      ) : (
        <DataTable sortable={sortable}>
          <THead>
            <tr>
              <DragTH />
              <TH>Sale</TH>
              <TH>Customer</TH>
              <TH>Installer</TH>
              <TH>Scheduled</TH>
              <TH>Status</TH>
              <TH>Update</TH>
            </tr>
          </THead>
          <TBody>
            {(jobs.data ?? []).map((j) => (
              <TR key={j.id} sortableId={j.id}>
                <TD className="font-mono text-xs">
                  {j.sale?.saleRef ?? "—"}
                </TD>
                <TD>
                  {j.sale?.lead
                    ? `${j.sale.lead.firstName} ${j.sale.lead.surName}`
                    : "—"}
                </TD>
                <TD>{j.installer?.name ?? "—"}</TD>
                <TD className="whitespace-nowrap text-muted-foreground">
                  {j.scheduledAt
                    ? new Date(j.scheduledAt).toLocaleString()
                    : j.installDate
                      ? new Date(j.installDate).toLocaleDateString()
                      : "—"}
                </TD>
                <TD>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${COLORS[j.status] ?? "bg-muted"}`}>
                    {j.status}
                  </span>
                </TD>
                <TD>
                  <select
                    className="h-8 rounded-md border bg-background px-2 text-xs"
                    value={j.status}
                    onChange={(e) => setStatus(j.id, e.target.value)}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </TD>
              </TR>
            ))}
          </TBody>
        </DataTable>
      )}
    </section>
  );
}
