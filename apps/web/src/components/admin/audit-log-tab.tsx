"use client";

import { useApi } from "@/lib/api/use-api";
import { useRowReorder } from "@/lib/api/use-reorder";
import { titleCase } from "@/lib/utils";
import {
  DataTable,
  THead,
  TBody,
  TR,
  TH,
  TD,
  DragTH,
} from "@/components/leads/shared/data-table";

interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  source: string;
  createdAt: string;
  actorName: string | null;
  actorEmail: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Admin → Audit Log. Reads the system-wide audit trail from the API
 * (GET /audit, gated by records:read:all).
 */
export function AdminAuditLogTab() {
  const audit = useApi<AuditRow[]>("/audit?take=200");
  // Session-only reorder — audit entries have no stored position.
  const sortable = useRowReorder(audit, (r) => r.id);

  if (audit.loading)
    return <p className="text-sm text-muted-foreground">Loading audit log…</p>;
  if (audit.error)
    return <p className="text-sm text-destructive">{audit.error}</p>;

  const rows = audit.data ?? [];

  return (
    <section className="rounded-xl border bg-card p-5">
      <h3 className="mb-4 text-sm font-semibold">
        Audit Log {rows.length ? `(${rows.length})` : ""}
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No audit entries yet.</p>
      ) : (
        <DataTable sortable={sortable}>
          <THead>
            <tr>
              <DragTH />
              <TH>When</TH>
              <TH>Actor</TH>
              <TH>Action</TH>
              <TH>Entity</TH>
              <TH>Source</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id} sortableId={r.id}>
                <TD className="whitespace-nowrap text-muted-foreground">
                  {new Date(r.createdAt).toLocaleString()}
                </TD>
                <TD>
                  {r.actorName ?? r.actorEmail ?? r.entityId.slice(0, 8)}
                </TD>
                <TD>
                  <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px]">
                    {r.action}
                  </span>
                </TD>
                <TD>
                  {r.entity}
                  <span className="ml-1 text-xs text-muted-foreground">
                    {r.entityId.slice(0, 8)}
                  </span>
                </TD>
                <TD className="text-muted-foreground">{titleCase(r.source)}</TD>
              </TR>
            ))}
          </TBody>
        </DataTable>
      )}
    </section>
  );
}
