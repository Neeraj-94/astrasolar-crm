/**
 * Lead lifecycle helpers.
 *
 * These functions enforce the lead-centric data model:
 *   - One primary lead record per prospect.
 *   - Scheduling actions appended to `scheduleLog` (not stored elsewhere).
 *   - Sales object generated inside the lead record when disposition = "sold".
 *   - Workflow status objects (adminStatus, installStatus, financeStatus,
 *     postInstallStatus) stamped with `lastUpdatedBy` and `lastUpdatedAt`.
 *   - User references are stored as `{ id, name }` only — never the full
 *     user profile.
 *
 * All writes go through these helpers so consumers don't need to remember
 * the conventions on each call site.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import type {
  AdminStatus,
  Disposition,
  FinanceStatus,
  InstallStatus,
  IsoTimestamp,
  PostInstallStatus,
  SalesObject,
  ScheduleActionType,
  ScheduleLog,
  ScheduleLogEntry,
  UserRef,
} from "./types";

/**
 * Run `npm run db:push` (or `npm run db:migrate`) after this change so the
 * generated Prisma client picks up the new columns. Until then, the
 * client's static types don't include `scheduleLog`, `sales`, `disposition`,
 * `adminStatus`, `installStatus`, `financeStatus`, or `postInstallStatus`,
 * which is why we cast through `db` here. After `prisma generate` runs,
 * this cast becomes a no-op and you can switch it back to `prisma` if you
 * want stricter typing.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

// ----------------------------------------------------------------------------
// Small utilities
// ----------------------------------------------------------------------------

function nowIso(): IsoTimestamp {
  return new Date().toISOString();
}

/**
 * Cast unknown JSONB column values to a known shape. Prisma returns these as
 * `JsonValue`; at runtime we know what was stored so a single typed cast at
 * the boundary keeps the rest of the code clean.
 */
function asLifecycle<T>(value: unknown): T | null {
  return (value as T) ?? null;
}

// ----------------------------------------------------------------------------
// scheduleLog
// ----------------------------------------------------------------------------

export interface AppendScheduleLogInput {
  leadId: string;
  action: ScheduleActionType;
  previousValue?: unknown;
  newValue?: unknown;
  updatedBy: UserRef;
  notes?: string;
}

/**
 * Appends a single entry to `Lead.scheduleLog`. Creates the array if it
 * doesn't exist yet. Returns the updated log.
 */
export async function appendScheduleLog(
  input: AppendScheduleLogInput,
): Promise<ScheduleLog> {
  const entry: ScheduleLogEntry = {
    action: input.action,
    previousValue: input.previousValue,
    newValue: input.newValue,
    updatedBy: input.updatedBy,
    timestamp: nowIso(),
    notes: input.notes,
  };

  const existing = await db.lead.findUniqueOrThrow({
    where: { id: input.leadId },
    select: { scheduleLog: true },
  });

  const current = asLifecycle<ScheduleLog>(existing.scheduleLog) ?? [];
  const next: ScheduleLog = [...current, entry];

  await db.lead.update({
    where: { id: input.leadId },
    // Prisma's Json type accepts any serializable value; cast at the boundary.
    data: { scheduleLog: next as unknown as object },
  });

  return next;
}

// ----------------------------------------------------------------------------
// disposition + sales generation
// ----------------------------------------------------------------------------

export interface SetDispositionInput {
  leadId: string;
  /** New disposition value (e.g. "sold", "lost", "callback"). */
  disposition: Disposition;
  /** Who is making the change. */
  updatedBy: UserRef;
  /** Optional notes attached to the schedule log entry. */
  notes?: string;
  /**
   * Required if disposition becomes "sold" — the sales object to attach to
   * the lead. Will be ignored for any other disposition.
   */
  salesPayload?: Omit<SalesObject, "saleDate"> & { saleDate?: IsoTimestamp };
}

/**
 * Updates the lead's disposition. If the new disposition is "sold", a `sales`
 * object is generated on the lead record (using `salesPayload`). The change
 * is always recorded in `scheduleLog`.
 *
 * Note: this does NOT touch the relational `Sale` table. The JSONB `sales`
 * object is the canonical store per the lead-centric model. Create a
 * `Sale` row separately if you need it for cross-lead reporting.
 */
export async function setLeadDisposition(input: SetDispositionInput): Promise<void> {
  const existing = await db.lead.findUniqueOrThrow({
    where: { id: input.leadId },
    select: { disposition: true, scheduleLog: true },
  });

  const previousDisposition = existing.disposition ?? null;
  const newDisposition = input.disposition;

  // Build the log entry for this change.
  const logEntry: ScheduleLogEntry = {
    action: "disposition_changed",
    previousValue: previousDisposition,
    newValue: newDisposition,
    updatedBy: input.updatedBy,
    timestamp: nowIso(),
    notes: input.notes,
  };

  const currentLog = asLifecycle<ScheduleLog>(existing.scheduleLog) ?? [];
  const nextLog: ScheduleLog = [...currentLog, logEntry];

  // If becoming "sold", build the sales object.
  let salesPatch: Record<string, unknown> = {};
  if (newDisposition === "sold") {
    if (!input.salesPayload) {
      throw new Error(
        "salesPayload is required when setting disposition to \"sold\"",
      );
    }
    if (!input.salesPayload.consultant?.id || !input.salesPayload.consultant?.name) {
      throw new Error(
        "salesPayload.consultant must include both id and name (UserRef)",
      );
    }
    const salesObj: SalesObject = {
      saleDate: input.salesPayload.saleDate ?? nowIso(),
      ...input.salesPayload,
    };
    salesPatch = { sales: salesObj as unknown as object };
  }

  await db.lead.update({
    where: { id: input.leadId },
    data: {
      disposition: newDisposition,
      scheduleLog: nextLog as unknown as object,
      ...salesPatch,
    },
  });
}

// ----------------------------------------------------------------------------
// Status object updates — adminStatus / installStatus / financeStatus /
// postInstallStatus. All merge into the existing object and stamp
// lastUpdatedBy + lastUpdatedAt.
// ----------------------------------------------------------------------------

type StatusKey =
  | "adminStatus"
  | "installStatus"
  | "financeStatus"
  | "postInstallStatus";

async function patchStatusObject<T extends object>(
  leadId: string,
  key: StatusKey,
  patch: Partial<T>,
  updatedBy: UserRef,
): Promise<T> {
  const row = await db.lead.findUniqueOrThrow({
    where: { id: leadId },
    select: { [key]: true },
  });
  const current = (asLifecycle<T>(row[key]) ?? ({} as T)) as T;
  const next = {
    ...current,
    ...patch,
    lastUpdatedBy: updatedBy,
    lastUpdatedAt: nowIso(),
  } as T;
  await db.lead.update({
    where: { id: leadId },
    data: { [key]: next as unknown as object },
  });
  return next;
}

export function updateAdminStatus(
  leadId: string,
  patch: Partial<AdminStatus>,
  updatedBy: UserRef,
): Promise<AdminStatus> {
  return patchStatusObject<AdminStatus>(leadId, "adminStatus", patch, updatedBy);
}

export function updateInstallStatus(
  leadId: string,
  patch: Partial<InstallStatus>,
  updatedBy: UserRef,
): Promise<InstallStatus> {
  return patchStatusObject<InstallStatus>(leadId, "installStatus", patch, updatedBy);
}

export function updateFinanceStatus(
  leadId: string,
  patch: Partial<FinanceStatus>,
  updatedBy: UserRef,
): Promise<FinanceStatus> {
  return patchStatusObject<FinanceStatus>(leadId, "financeStatus", patch, updatedBy);
}

export function updatePostInstallStatus(
  leadId: string,
  patch: Partial<PostInstallStatus>,
  updatedBy: UserRef,
): Promise<PostInstallStatus> {
  return patchStatusObject<PostInstallStatus>(
    leadId,
    "postInstallStatus",
    patch,
    updatedBy,
  );
}
