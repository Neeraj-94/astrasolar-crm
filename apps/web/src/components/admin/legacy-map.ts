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

/**
 * Reverse of the display mapping: turns a pipeline grid status edit (rich
 * legacy vocabulary) into the v2 `SaleStatusDetails` field + 4-value
 * `StageState` so it can be persisted via PATCH /sales/:id/status-details.
 * Returns null for fields that don't map onto a StageState column.
 */
export function gridStatusToStage(
  field: string,
  value: string,
): { apiField: string; stage: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "NOT_REQUIRED" } | null {
  const v = value || "";
  switch (field) {
    case "financeStatus":
      return {
        apiField: "financeStatus",
        stage:
          v === "finance_approved"
            ? "COMPLETED"
            : v === "not_applied" || v === "declined" || v === "withdrawn"
              ? "NOT_REQUIRED"
              : v
                ? "IN_PROGRESS"
                : "PENDING",
      };
    case "adminStatus":
      return {
        apiField: "preapprovalStatus",
        stage:
          v === "pre_approval_approved"
            ? "COMPLETED"
            : v === "cancelled"
              ? "NOT_REQUIRED"
              : v === "needs_applying" || !v
                ? "PENDING"
                : "IN_PROGRESS",
      };
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
    financeStatus?: Stage;
    preapprovalStatus?: Stage;
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
  finance?: Array<{ id: string }> | null;
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

  const finance = pick(sd.financeStatus, {
    COMPLETED: "finance_approved",
    IN_PROGRESS: "applied",
    NOT_REQUIRED: "not_applied",
  });
  if (finance) status.financeStatus = finance;

  const admin = pick(sd.preapprovalStatus, {
    COMPLETED: "pre_approval_approved",
    IN_PROGRESS: "submitted",
    PENDING: "needs_applying",
  });
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
  } else if (sd.preapprovalStatus === "COMPLETED") {
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
  const hasFinance = (s.finance?.length || 0) > 0;

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
    nmi: sd.nmi || undefined,
    referral: s.referral || undefined,
    installNotes: s.installNotes || undefined,
    status: mapStatus(s),
  };
}
