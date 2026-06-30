/**
 * Maps the live v2 `GET /sales` response onto the pipeline's `PipelineSale`
 * shape used by the Admin Sales Pipeline tab.
 *
 * The v2 backend stores the seven lifecycle statuses as a 4-value `StageState`
 * enum (PENDING / IN_PROGRESS / COMPLETED / NOT_REQUIRED), whereas the
 * astrasolar-app pipeline UI uses richer per-column vocabularies. This is the
 * "degraded mapping" agreed for the wiring pass: each StageState is mapped to
 * the nearest legacy option so real records render in the existing UI.
 */
import type { PipelineSale, PipelineStatus } from "./legacy-data";

// financeStatus / preapprovalStatus now use dedicated DB enums (not StageState).
// These tables convert between the DB enum and the legacy pipeline grid vocab.
const FINANCE_DB_TO_GRID: Record<string, string> = {
  APPLIED: "applied",
  DOCS_SUBMITTED: "finance_docs_submitted",
  APPROVED: "finance_approved",
  DECLINED: "declined",
  WITHDRAWN: "withdrawn",
  UNDER_REVIEW: "under_review",
  PENDING_ACCEPTANCE: "pending_acceptance",
  NOT_APPLIED: "not_applied",
  AWAITING_DOCS: "awaiting_docs",
};
const FINANCE_GRID_TO_DB: Record<string, string> = {
  applied: "APPLIED",
  finance_docs_submitted: "DOCS_SUBMITTED",
  finance_approved: "APPROVED",
  declined: "DECLINED",
  withdrawn: "WITHDRAWN",
  under_review: "UNDER_REVIEW",
  pending_acceptance: "PENDING_ACCEPTANCE",
  not_applied: "NOT_APPLIED",
  awaiting_docs: "AWAITING_DOCS",
};
const PREAPPROVAL_DB_TO_GRID: Record<string, string> = {
  APPROVED: "pre_approval_approved",
  NEEDS_APPLYING: "needs_applying",
  SUBMITTED: "submitted",
  AWAITING_PAYMENT: "awaiting_payment_preapproval",
  AWAITING_INFO: "awaiting_info",
  INCOMPLETE_INFORMATION: "incomplete_info",
  ON_HOLD: "on_hold",
  CANCELLED: "cancelled",
};
const PREAPPROVAL_GRID_TO_DB: Record<string, string> = {
  needs_applying: "NEEDS_APPLYING",
  submitted: "SUBMITTED",
  pre_approval_submitted: "SUBMITTED",
  pre_approval_approved: "APPROVED",
  awaiting_payment_preapproval: "AWAITING_PAYMENT",
  awaiting_info: "AWAITING_INFO",
  incomplete_info: "INCOMPLETE_INFORMATION",
  on_hold: "ON_HOLD",
  cancelled: "CANCELLED",
};

/**
 * Reverse of the display mapping: turns a pipeline grid status edit (rich
 * legacy vocabulary) into the v2 `SaleStatusDetails` field + 4-value
 * `StageState` so it can be persisted via PATCH /sales/:id/status-details.
 * Returns null for fields that don't map onto a StageState column.
 */
export function gridStatusToStage(
  field: string,
  value: string,
): { apiField: string; stage: string | null } | null {
  const v = value || "";
  switch (field) {
    case "financeStatus":
      // financeStatus has its own DB enum — persist the enum value directly.
      return { apiField: "financeStatus", stage: v ? (FINANCE_GRID_TO_DB[v] ?? null) : null };
    case "adminStatus":
      // preapprovalStatus has its own DB enum — persist the enum value directly.
      return { apiField: "preapprovalStatus", stage: v ? (PREAPPROVAL_GRID_TO_DB[v] ?? null) : null };
    case "meterChange":
      return {
        apiField: "meterChangeStatus",
        stage:
          v === "completed"
            ? "COMPLETED"
            : v === "not_required"
              ? "NOT_REQUIRED"
              : v === "in_progress"
                ? "IN_PROGRESS"
                : "PENDING",
      };
    case "installStatus":
      return {
        apiField: "installStatus",
        stage:
          v === "installation_complete"
            ? "COMPLETED"
            : v === "installation_started"
              ? "IN_PROGRESS"
              : "PENDING",
      };
    case "finalisations":
      return { apiField: "cesStatus", stage: v === "cec_uploaded" ? "COMPLETED" : "PENDING" };
    case "paymentStatus":
      return {
        apiField: "paymentStatus",
        stage:
          v === "full_payment_received"
            ? "COMPLETED"
            : v === "part_payment_received"
              ? "IN_PROGRESS"
              : "PENDING",
      };
    default:
      return null; // installation / installAdminStatus / installDate → no StageState column
  }
}

type Stage = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "NOT_REQUIRED" | null | undefined;

/** Shape of one Sale from `GET /sales` (only the fields the pipeline needs). */
export interface ApiSale {
  id: string;
  saleRef?: string | null;
  openSolarId?: string | null;
  company?: string | null; // 'ASTRA' | 'DC'
  status?: string | null; // SaleStatus
  soldPrice?: string | number | null;
  totalRRP?: string | number | null;
  totalCommission?: string | number | null;
  saleType?: string | null;
  systemType?: string | null;
  energyProvider?: string | null;
  referral?: string | null;
  installNotes?: string | null;
  saleDate?: string | null;
  owner?: { id: string; name: string } | null;
  lead?: {
    id?: string | null;
    firstName?: string | null;
    surName?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    postCode?: string | null;
    state?: string | null;
    leadGen?: { id: string; name: string } | null;
  } | null;
  statusDetails?: {
    financeStatus?: string | null; // FinanceStatus enum
    preapprovalStatus?: string | null; // PreapprovalStatus enum
    meterChangeStatus?: Stage;
    installStatus?: Stage;
    paymentStatus?: Stage;
    commissioningStatus?: Stage;
    cesStatus?: Stage;
  } | null;
  systemDetails?: {
    systemSize?: string | number | null;
    numPanels?: number | null;
    panelModel?: string | null;
    panelWatt?: number | null;
    inverterModel?: string | null;
    inverterType?: string | null;
    batteryBrand?: string | null;
    batteryModel?: string | null;
    batterySize?: string | number | null;
    phase?: string | null;
    roofType?: string | null;
    storeys?: number | null;
    switchboard?: string | null;
    nmi?: string | null;
  } | null;
  installation?: {
    status?: string | null; // InstallationStatus
    installDate?: string | null;
    scheduledAt?: string | null;
  } | null;
  paymentDetails?: { paymentDate?: string | null } | null;
  finance?: Array<{ id: string; lender?: string | null }> | null;
}

function toYmd(v?: string | null): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return undefined;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function pick<T extends string>(stage: Stage, map: Partial<Record<NonNullable<Stage>, T>>): T | undefined {
  if (!stage) return undefined;
  return map[stage];
}

function mapStatus(s: ApiSale): PipelineStatus {
  const sd = s.statusDetails || {};
  const inst = s.installation;
  const status: PipelineStatus = {};

  if (s.openSolarId) status.openSolarId = s.openSolarId;

  // financeStatus / preapprovalStatus carry their own DB enums → map straight
  // onto the legacy grid vocabulary.
  const finance = sd.financeStatus ? FINANCE_DB_TO_GRID[sd.financeStatus] : undefined;
  if (finance) status.financeStatus = finance;

  const admin = sd.preapprovalStatus ? PREAPPROVAL_DB_TO_GRID[sd.preapprovalStatus] : undefined;
  if (admin) status.adminStatus = admin;

  const meter = pick(sd.meterChangeStatus, {
    COMPLETED: "completed",
    IN_PROGRESS: "in_progress",
    NOT_REQUIRED: "not_required",
  });
  if (meter) status.meterChange = meter;

  // Legacy `installation` field (ready_to_book ↔ installation_booked) is
  // derived from the v2 Installation relation.
  if (inst && inst.status && ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "ON_HOLD"].includes(inst.status)) {
    status.installation = "installation_booked";
    status.installAdminStatus = inst.status === "ON_HOLD" ? "on_hold" : "install_details_checked";
  } else if (sd.preapprovalStatus === "APPROVED") {
    status.installation = "ready_to_book";
  }

  const installDate = toYmd(inst?.installDate) || toYmd(inst?.scheduledAt);
  if (installDate) status.installDate = installDate;

  const installStage = pick(sd.installStatus, {
    COMPLETED: "installation_complete",
    IN_PROGRESS: "installation_started",
    PENDING: "installation_due",
  });
  // Only surface install status once it's actually booked.
  if (status.installation === "installation_booked" && installStage) status.installStatus = installStage;

  if (sd.cesStatus === "COMPLETED") status.finalisations = "cec_uploaded";

  const pay = pick(sd.paymentStatus, {
    COMPLETED: "full_payment_received",
    IN_PROGRESS: "part_payment_received",
    PENDING: "payment_due",
  });
  if (pay) status.paymentStatus = pay;

  return status;
}

export function mapApiSaleToPipeline(s: ApiSale): PipelineSale {
  const lead = s.lead || {};
  const sd = s.systemDetails || {};
  const isDC = (s.company || "").toUpperCase() === "DC";
  const sizeKw = sd.systemSize != null && sd.systemSize !== "" ? `${Number(sd.systemSize)}kW` : "";
  const battery = sd.batteryModel || sd.batteryBrand || "";
  const financeLenders = (s.finance ?? [])
    .map((f) => (f.lender || "").trim())
    .filter(Boolean);
  const hasFinance = financeLenders.length > 0;

  return {
    key: s.id,
    leadId: lead.id || undefined,
    consultantId: s.owner?.id || "",
    consultantName: s.owner?.name || "—",
    company: isDC ? "DC ELEC" : "Astra",
    companyType: isDC ? "dcnt" : "astra",
    firstName: lead.firstName || "",
    surname: lead.surName || "",
    phone: lead.phone || "",
    email: lead.email || undefined,
    address: lead.address || undefined,
    suburb: undefined, // v2 Lead has no suburb field
    postcode: lead.postCode || undefined,
    state: lead.state || "",
    leadGen: lead.leadGen?.name || "",
    solar: sizeKw,
    battery,
    extrasTotal: 0,
    soldPrice: s.soldPrice != null ? Number(s.soldPrice) : 0,
    paymentMethod: hasFinance ? "finance" : "cash",
    paymentDate: toYmd(s.paymentDetails?.paymentDate),
    systemType: undefined,
    systemSize: sd.systemSize != null ? String(sd.systemSize) : undefined,
    numPanels: sd.numPanels != null ? String(sd.numPanels) : undefined,
    panelModel: sd.panelModel || undefined,
    inverterModel: sd.inverterModel || undefined,
    phase: sd.phase || undefined,
    batteryModel: sd.batteryModel || undefined,
    switchboard: sd.switchboard || undefined,
    roofType: sd.roofType || undefined,
    storeys: sd.storeys != null ? String(sd.storeys) : undefined,
    // Extra detail-panel fields
    saleStatus: s.status || undefined,
    saleType: s.saleType || undefined,
    systemTypeCode: s.systemType || undefined,
    totalRRP: s.totalRRP != null ? Number(s.totalRRP) : undefined,
    totalCommission: s.totalCommission != null ? Number(s.totalCommission) : undefined,
    saleDate: toYmd(s.saleDate),
    energyProvider: s.energyProvider || undefined,
    financeLenders,
    nmi: sd.nmi || undefined,
    referral: s.referral || undefined,
    installNotes: s.installNotes || undefined,
    status: mapStatus(s),
  };
}
