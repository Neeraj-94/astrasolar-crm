"use client";

import * as React from "react";
import "./legacy-admin.css";
import {
  type PipelineSale,
  type PipelineStatus,
  FINANCE_STATUS,
  PREAPPROVAL_STATUS,
  METER_CHANGE,
  INSTALLATION_STATE,
  INSTALL_ADMIN_STATUS,
  INSTALL_STATUS,
  FINALISATIONS,
  PAYMENT_STATUS,
  STAGE_REQUIREMENTS,
  AUD,
} from "./legacy-data";
import {
  SALE_STATUS_OPTS,
  SALE_TYPE_OPTS,
  SYSTEM_TYPE_OPTS,
  STATE_OPTS,
  COMPANY_OPTS,
  ROOF_TYPE_OPTS,
  STOREYS_OPTS,
  PHASE_OPTS,
  SWITCHBOARD_OPTS,
  BACKUP_OPTS,
  HOTWATER_OPTS,
  AIRCON_OPTS,
  PAYMENT_OPTS,
  EXTRAS_CATALOGUE,
  EXTRAS_COUNTRY,
  BATTERY_EXTRAS_CATALOGUE,
  commissionAdjustment,
  type ExtraItem,
} from "./legacy-data";
import { type ApiSale, mapApiSaleToPipeline, gridStatusToStage } from "./legacy-map";
import { useApi } from "@/lib/api/use-api";
import { apiPatch } from "@/lib/api/client";

/**
 * Admin → Sales Pipeline tab.
 *
 * Faithful port of astrasolar-app `#admin-tab-pipeline` (index.html ~8973) and
 * its `renderAdminPipeline` / `adminPipe*` / `openManualSaleModal` logic.
 * Runs on in-memory seed data; the live `/sales` feed lands in the wiring pass.
 */

type TopFilter = "all" | "in_progress" | "complete";

const HEADERS = [
  "#",
  "Consultant",
  "Company",
  "Open Solar ID",
  "Client",
  "State",
  "Lead Gen",
  "Product",
  "Price",
  "Payment",
  "Finance Status",
  "Pre-Approvals Status",
  "Meter Change",
  "Installation",
  "Status",
  "Install Date",
  "Install Status",
  "Finalisations",
  "Payment Status",
  "Payment Date",
];

// Column indices that are progressively revealed.
const PROG_COLS = [12, 13, 14, 15, 16, 17, 18];

// ── status helpers (verbatim semantics from astrasolar-app) ──
function isComplete(s: PipelineStatus): boolean {
  return s.paymentStatus === "full_payment_received";
}
function isCancelled(s: PipelineStatus): boolean {
  return s.adminStatus === "cancelled";
}
function isInProgress(s: PipelineStatus): boolean {
  if (isComplete(s)) return false;
  return !!(
    s.financeStatus ||
    s.adminStatus ||
    s.installation ||
    s.installStatus ||
    s.finalisations ||
    s.paymentStatus
  );
}
function resolvePayment(sale: PipelineSale): string {
  return (sale.status.paymentMethods || sale.paymentMethod || "cash").toLowerCase();
}

/** Per-row progressive visibility for cols 12–18. */
function rowVisibility(s: PipelineStatus): Record<number, boolean> {
  const vis: Record<number, boolean> = {
    12: false,
    13: false,
    14: false,
    15: false,
    16: false,
    17: false,
    18: false,
  };
  if (s.adminStatus) vis[12] = true; // Meter Change
  const instReady =
    s.adminStatus === "pre_approval_approved" ||
    s.adminStatus === "awaiting_payment_preapproval" ||
    (!!s.adminStatus &&
      (s.meterChange === "completed" || s.meterChange === "not_required"));
  if (instReady) {
    vis[13] = true; // Installation
    vis[14] = true; // Status
  }
  if (s.installation === "installation_booked") {
    vis[15] = true; // Install Date
    vis[16] = true; // Install Status
  }
  if (s.installStatus === "installation_complete") vis[17] = true; // Finalisations
  if (s.finalisations === "cec_uploaded") vis[18] = true; // Payment Status

  // Sticky: any downstream data keeps upstream columns visible.
  if (s.meterChange) vis[12] = true;
  if (s.installation || s.installAdminStatus) {
    vis[12] = vis[13] = vis[14] = true;
  }
  if (s.installDate || s.installStatus) {
    vis[12] = vis[13] = vis[14] = vis[15] = vis[16] = true;
  }
  if (s.finalisations) {
    vis[12] = vis[13] = vis[14] = vis[15] = vis[16] = vis[17] = true;
  }
  if (s.paymentStatus) {
    PROG_COLS.forEach((c) => (vis[c] = true));
  }
  return vis;
}

// ── per-column filter config (filterable columns only) ──
interface ColFilter {
  col: number;
  key: string;
  getVal: (s: PipelineSale) => string;
}
const COL_FILTERS: ColFilter[] = [
  { col: 1, key: "consultant", getVal: (s) => s.consultantName },
  { col: 2, key: "company", getVal: (s) => (s.companyType === "dcnt" ? "DC" : "Astra") },
  { col: 5, key: "state", getVal: (s) => s.state },
  { col: 9, key: "payment", getVal: (s) => (resolvePayment(s) === "cash" ? "Cash" : "Finance") },
  { col: 10, key: "financeStatus", getVal: (s) => FINANCE_STATUS[s.status.financeStatus || ""] || "" },
  { col: 11, key: "adminStatus", getVal: (s) => PREAPPROVAL_STATUS[s.status.adminStatus || ""] || "" },
  { col: 13, key: "installation", getVal: (s) => INSTALLATION_STATE[s.status.installation || ""] || "" },
  { col: 14, key: "installAdminStatus", getVal: (s) => INSTALL_ADMIN_STATUS[s.status.installAdminStatus || ""] || "" },
  { col: 16, key: "installStatus", getVal: (s) => INSTALL_STATUS[s.status.installStatus || ""] || "" },
  { col: 17, key: "finalisations", getVal: (s) => FINALISATIONS[s.status.finalisations || ""] || "" },
  { col: 18, key: "paymentStatus", getVal: (s) => PAYMENT_STATUS[s.status.paymentStatus || ""] || "" },
];

/** Fire-and-forget PATCH with a user-visible alert on failure. */
function firePatch(ep: string, body: Record<string, unknown>, field: string) {
  apiPatch(ep, body).catch((err) => {
    console.error("Failed to save", field, err);
    if (typeof window !== "undefined") {
      const msg = (err && typeof err === "object" && "message" in err ? (err as { message?: string }).message : "") || String(err);
      window.alert(`Could not save ${field}: ${msg}`);
    }
  });
}

const EMPTY_FORM = {
  consultantName: "",
  firstName: "",
  surname: "",
  phone: "",
  email: "",
  address: "",
  suburb: "",
  postcode: "",
  state: "TAS",
  leadGen: "",
  company: "Astra",
  companyType: "astra",
  solar: "",
  battery: "",
  soldPrice: "",
  paymentMethod: "cash",
};

export function AdminSalesPipelineTab() {
  // Live feed from GET /sales (scoped server-side). Mapped into the pipeline
  // shape; local edits stay in `sales` state until the write-back pass lands.
  const feed = useApi<ApiSale[]>("/sales");
  const [sales, setSales] = React.useState<PipelineSale[]>([]);
  React.useEffect(() => {
    if (feed.data) setSales(feed.data.map(mapApiSaleToPipeline));
  }, [feed.data]);

  // Inline expandable detail rows (legacy pipeToggleDetail behaviour).
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  const toggleDetail = (key: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  // Persistence routing: detail field → API endpoint + payload transform.
  // Fields not listed are edited locally only (no clean v2 endpoint yet).
  const editDetail = React.useCallback(
    (key: string, leadId: string | undefined, field: keyof PipelineSale, raw: string) => {
      const num = raw === "" ? undefined : Number(raw);
      // 1) optimistic local update (special-case company → also flip type)
      setSales((prev) =>
        prev.map((s) => {
          if (s.key !== key) return s;
          if (field === "company") {
            const companyType = raw === "DC ELEC" ? "dcnt" : "astra";
            return { ...s, company: raw, companyType };
          }
          const numericFields = ["soldPrice", "totalRRP", "totalCommission", "extrasTotal"];
          return { ...s, [field]: numericFields.includes(field as string) ? num : raw };
        }),
      );
      // 2) persist to the DB where an endpoint exists (skip manual rows)
      if (key.startsWith("manual_")) return;
      const id = key;
      type P = { ep: string; body: Record<string, unknown> };
      const plan: P | null = (() => {
        switch (field) {
          case "soldPrice":
            return { ep: `/sales/${id}/core`, body: { soldPrice: num } };
          case "totalRRP":
            return { ep: `/sales/${id}/core`, body: { totalRRP: num } };
          case "totalCommission":
            return { ep: `/sales/${id}/core`, body: { totalCommission: num } };
          case "energyProvider":
            return { ep: `/sales/${id}/core`, body: { energyProvider: raw } };
          case "referral":
            return { ep: `/sales/${id}/core`, body: { referral: raw } };
          case "installNotes":
            return { ep: `/sales/${id}/core`, body: { installNotes: raw } };
          case "systemTypeCode":
            return { ep: `/sales/${id}/core`, body: { systemType: raw } };
          case "saleType":
            return { ep: `/sales/${id}/core`, body: { saleType: raw } };
          case "numPanels":
            return { ep: `/sales/${id}/system-details`, body: { numPanels: num } };
          case "systemSize":
            return { ep: `/sales/${id}/system-details`, body: { systemSize: num } };
          case "tilts":
            return { ep: `/sales/${id}/system-details`, body: { tilts: num } };
          case "roofType":
            return { ep: `/sales/${id}/system-details`, body: { roofType: raw } };
          case "storeys":
            return { ep: `/sales/${id}/system-details`, body: { storeys: parseInt(raw, 10) || undefined } };
          case "switchboard":
            return { ep: `/sales/${id}/system-details`, body: { switchboard: raw } };
          case "nmi":
            return { ep: `/sales/${id}/system-details`, body: { nmi: raw } };
          case "phase":
            return { ep: `/sales/${id}/system-details`, body: { phase: raw } };
          case "paymentDate":
            return { ep: `/sales/${id}/payment-details`, body: { paymentDate: raw } };
          case "paymentNotes":
            return { ep: `/sales/${id}/payment-details`, body: { paymentNotes: raw } };
          case "saleStatus":
            return { ep: `/sales/${id}/status`, body: { status: raw } };
          case "saleDate":
            return { ep: `/sales/${id}/core`, body: { saleDate: raw } };
          case "company":
            return { ep: `/sales/${id}/core`, body: { company: raw === "DC ELEC" ? "DC" : "ASTRA" } };
          case "panelModel":
            return { ep: `/sales/${id}/system-details`, body: { panelModel: raw } };
          case "inverterModel":
            return { ep: `/sales/${id}/system-details`, body: { inverterModel: raw } };
          case "batteryModel":
            return { ep: `/sales/${id}/system-details`, body: { batteryModel: raw } };
          case "backup":
            return { ep: `/sales/${id}/system-details`, body: { backup: raw } };
          case "hotWater":
            return { ep: `/sales/${id}/system-details`, body: { hotWater: raw } };
          case "aircon":
            return { ep: `/sales/${id}/system-details`, body: { aircon: raw } };
          // Lead-owned contact fields → PATCH /leads/:leadId
          case "phone":
            return leadId ? { ep: `/leads/${leadId}`, body: { phone: raw } } : null;
          case "email":
            return leadId ? { ep: `/leads/${leadId}`, body: { email: raw } } : null;
          case "address":
            return leadId ? { ep: `/leads/${leadId}`, body: { address: raw } } : null;
          case "postcode":
            return leadId ? { ep: `/leads/${leadId}`, body: { postCode: raw } } : null;
          case "state":
            return leadId ? { ep: `/leads/${leadId}`, body: { state: raw } } : null;
          default:
            return null; // local-only field (solar/battery/leadGen/suburb/paymentMethod/extrasTotal)
        }
      })();
      if (plan) firePatch(plan.ep, plan.body, String(field));
    },
    [],
  );

  const [topFilter, setTopFilter] = React.useState<TopFilter>("all");
  const [search, setSearch] = React.useState("");
  const [colFilters, setColFilters] = React.useState<Record<string, string>>({});
  const [editing, setEditing] = React.useState<{ key: string; field: string } | null>(null);
  const [showAddSale, setShowAddSale] = React.useState(false);
  const [copied, setCopied] = React.useState<string | null>(null);
  const [productKey, setProductKey] = React.useState<string | null>(null);

  // ── update a single status field with stage-gating + side effects ──
  function updateField(key: string, field: keyof PipelineStatus, value: string | number | undefined) {
    const current = sales.find((s) => s.key === key);
    if (!current) return;
    // Stage gate (read current status).
    const gate = STAGE_REQUIREMENTS[field as string];
    if (value && gate) {
      const err = gate(current.status);
      if (err) {
        if (typeof window !== "undefined") window.alert(err);
        return;
      }
    }
    // Build the next status object.
    const status = { ...current.status };
    if (value === "" || value === undefined) {
      delete (status as Record<string, unknown>)[field as string];
    } else {
      (status as Record<string, unknown>)[field as string] = value;
    }
    let autoInstallDue = false;
    if (field === "installation" && value === "installation_booked" && !status.installStatus) {
      status.installStatus = "installation_due";
      autoInstallDue = true;
    }
    setSales((prev) => prev.map((s) => (s.key === key ? { ...s, status } : s)));

    // Persist to the DB (skip manual rows).
    if (key.startsWith("manual_")) return;
    const v = value === undefined ? "" : String(value);
    if (field === "openSolarId") {
      firePatch(`/sales/${key}/core`, { openSolarId: v }, field);
      return;
    }
    const mapped = gridStatusToStage(field as string, v);
    if (mapped) {
      firePatch(`/sales/${key}/status-details`, { [mapped.apiField]: mapped.stage }, field);
    }
    if (autoInstallDue) {
      firePatch(`/sales/${key}/status-details`, { installStatus: "PENDING" }, "installStatus");
    }
    // installation / installAdminStatus / installDate have no StageState column —
    // they persist once the Installation Calendar wiring lands.
  }

  function updateSale(key: string, patch: Partial<PipelineSale>) {
    setSales((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  // ── derive visible rows ──
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return sales.filter((s) => {
      // top filter
      if (topFilter === "complete" && !isComplete(s.status)) return false;
      if (topFilter === "in_progress" && !isInProgress(s.status)) return false;
      // search
      if (q) {
        const hay = `${s.consultantName} ${s.firstName} ${s.surname} ${s.phone} ${s.suburb || ""} ${s.status.openSolarId || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      // column filters
      for (const cf of COL_FILTERS) {
        const want = colFilters[cf.key];
        if (want && cf.getVal(s) !== want) return false;
      }
      return true;
    });
  }, [sales, topFilter, search, colFilters]);

  // global visibility = union of row visibility across filtered rows
  const globalVis = React.useMemo(() => {
    const g: Record<number, boolean> = { 12: false, 13: false, 14: false, 15: false, 16: false, 17: false, 18: false };
    filtered.forEach((s) => {
      const v = rowVisibility(s.status);
      PROG_COLS.forEach((c) => {
        if (v[c]) g[c] = true;
      });
    });
    return g;
  }, [filtered]);

  // filter-row option sets (value + count) computed from the full sales list
  const filterOptions = React.useMemo(() => {
    const map: Record<string, { value: string; count: number }[]> = {};
    COL_FILTERS.forEach((cf) => {
      const counts: Record<string, number> = {};
      sales.forEach((s) => {
        const v = cf.getVal(s);
        if (!v) return;
        counts[v] = (counts[v] || 0) + 1;
      });
      map[cf.key] = Object.entries(counts)
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => a.value.localeCompare(b.value));
    });
    return map;
  }, [sales]);

  const anyFilterActive = Object.values(colFilters).some(Boolean) || topFilter !== "all" || !!search;

  function clearAllFilters() {
    setColFilters({});
    setTopFilter("all");
    setSearch("");
  }

  function copyClient(s: PipelineSale) {
    const txt = `${s.firstName} ${s.surname}, ${s.phone}, ${s.address || ""} ${s.suburb || ""} ${s.postcode || ""}`.trim();
    if (typeof navigator !== "undefined" && navigator.clipboard) navigator.clipboard.writeText(txt);
    setCopied(s.key);
    window.setTimeout(() => setCopied((c) => (c === s.key ? null : c)), 1200);
  }

  function headerClass(col: number): string {
    if (!PROG_COLS.includes(col)) return "";
    return globalVis[col] ? "pipe-col-visible" : "pipe-col-hidden";
  }

  return (
    <div className="astra-legacy">
      <div className="admin-pipeline-wrap">
        <div id="admin-pipeline-widget">
          {/* Top control bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 14,
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {(["all", "in_progress", "complete"] as TopFilter[]).map((f) => (
                <button
                  key={f}
                  className={`pipeline-filter-btn${topFilter === f ? " active" : ""}`}
                  onClick={() => setTopFilter(f)}
                >
                  {f === "all" ? "All" : f === "in_progress" ? "In Progress" : "Complete"}
                </button>
              ))}
              <span className="pipeline-count" style={{ marginLeft: 8 }}>
                {feed.loading
                  ? "Loading sales…"
                  : feed.error
                    ? "Failed to load sales"
                    : `${filtered.length} ${filtered.length === 1 ? "sale" : "sales"}`}
              </span>
              {feed.error && (
                <button
                  className="pipeline-filter-btn"
                  style={{ marginLeft: 6 }}
                  onClick={() => feed.reload()}
                >
                  Retry
                </button>
              )}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button
                className="booking-btn primary"
                style={{ padding: "5px 14px", fontSize: "0.6rem" }}
                onClick={() => setShowAddSale(true)}
              >
                + Add Sale
              </button>
              <input
                className="pipeline-search"
                placeholder="Search client, consultant..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: 200 }}
              />
            </div>
          </div>

          {/* Table */}
          <div className="pipeline-table-wrap">
            <table className="pipeline-table" id="admin-pipeline-table">
              <thead>
                <tr>
                  {HEADERS.map((h, i) => (
                    <th key={h} className={headerClass(i)}>
                      {h}
                    </th>
                  ))}
                </tr>
                {/* Per-column filter row */}
                <tr className="pipe-filter-row">
                  {HEADERS.map((_, col) => {
                    if (col === 0) {
                      return (
                        <th key="clear">
                          {anyFilterActive && (
                            <span className="pipe-filter-clear" onClick={clearAllFilters}>
                              ✕ Clear
                            </span>
                          )}
                        </th>
                      );
                    }
                    const cf = COL_FILTERS.find((c) => c.col === col);
                    if (!cf) return <th key={col} className={headerClass(col)} />;
                    return (
                      <th key={col} className={headerClass(col)}>
                        <select
                          className="pipe-filter-select"
                          value={colFilters[cf.key] || ""}
                          onChange={(e) =>
                            setColFilters((p) => {
                              const n = { ...p };
                              if (e.target.value) n[cf.key] = e.target.value;
                              else delete n[cf.key];
                              return n;
                            })
                          }
                        >
                          <option value="">All</option>
                          {filterOptions[cf.key]?.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.value} ({o.count})
                            </option>
                          ))}
                        </select>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={HEADERS.length} style={{ padding: "40px 0", textAlign: "center", color: "var(--text-dim)" }}>
                      {feed.loading
                        ? "Loading sales from the database…"
                        : feed.error
                          ? `Could not load sales: ${feed.error}`
                          : sales.length === 0
                            ? "No sales records found."
                            : "No sales match the current filters."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((s, idx) => {
                    const vis = rowVisibility(s.status);
                    const pay = resolvePayment(s);
                    const isCash = pay === "cash";
                    const rowCls = isCancelled(s.status)
                      ? "pipe-row-cancelled"
                      : isComplete(s.status)
                        ? "pipe-row-complete"
                        : "";
                    return (
                      <React.Fragment key={s.key}>
                      <tr className={rowCls}>
                        {/* 0 # */}
                        <td onClick={() => toggleDetail(s.key)} style={{ cursor: "pointer" }}>
                          {!s.status.openSolarId && <span className="pipe-missing" title="Missing Open Solar ID" />}
                          {idx + 1}
                        </td>
                        {/* 1 Consultant */}
                        <td>
                          <span
                            className="pipe-consultant"
                            style={{ cursor: "pointer" }}
                            onClick={() => toggleDetail(s.key)}
                            title="Show / hide sale details"
                          >
                            {s.consultantName}
                          </span>
                        </td>
                        {/* 2 Company */}
                        <td>
                          <span
                            className="pipe-company-badge"
                            style={
                              s.companyType === "dcnt"
                                ? { background: "hsl(var(--info) / 0.15)", color: "var(--blue)" }
                                : { background: "var(--gold-soft)", color: "var(--gold)" }
                            }
                          >
                            {s.companyType === "dcnt" ? "DC ELEC" : "Astra"}
                          </span>
                        </td>
                        {/* 3 Open Solar ID (inline) */}
                        <td>
                          {editing?.key === s.key && editing.field === "openSolarId" ? (
                            <input
                              autoFocus
                              defaultValue={s.status.openSolarId || ""}
                              className="pipe-date-input"
                              style={{ width: 90 }}
                              onBlur={(e) => {
                                updateField(s.key, "openSolarId", e.target.value.trim());
                                setEditing(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                if (e.key === "Escape") setEditing(null);
                              }}
                            />
                          ) : (
                            <span
                              className="pipe-inline-edit"
                              onClick={() => setEditing({ key: s.key, field: "openSolarId" })}
                            >
                              {s.status.openSolarId || <span style={{ color: "var(--text-faint)" }}>— set —</span>}
                            </span>
                          )}
                        </td>
                        {/* 4 Client */}
                        <td>
                          <span
                            className="pipe-client"
                            style={{ cursor: "pointer", color: "var(--gold)" }}
                            title="Show / hide sale details"
                            onClick={() => toggleDetail(s.key)}
                          >
                            <span className={`pipe-expand-caret${expanded.has(s.key) ? " open" : ""}`}>▶</span>
                            {s.firstName} {s.surname}
                          </span>
                          <button
                            className={`pipe-copy${copied === s.key ? " copied" : ""}`}
                            onClick={() => copyClient(s)}
                            title="Copy client details"
                          >
                            {copied === s.key ? "✓" : "⧉"}
                          </button>
                          <div style={{ fontSize: "0.55rem", color: "var(--text-dim)" }}>{s.phone}</div>
                        </td>
                        {/* 5 State */}
                        <td>{s.state}</td>
                        {/* 6 Lead Gen (inline) */}
                        <td>
                          {editing?.key === s.key && editing.field === "leadGen" ? (
                            <input
                              autoFocus
                              defaultValue={s.leadGen}
                              className="pipe-date-input"
                              style={{ width: 90 }}
                              onBlur={(e) => {
                                updateSale(s.key, { leadGen: e.target.value.trim() });
                                setEditing(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                if (e.key === "Escape") setEditing(null);
                              }}
                            />
                          ) : (
                            <span
                              className="pipe-leadgen pipe-inline-edit"
                              onClick={() => setEditing({ key: s.key, field: "leadGen" })}
                            >
                              {s.leadGen || "—"}
                            </span>
                          )}
                        </td>
                        {/* 7 Product */}
                        <td>
                          <span
                            className="pipe-product pipe-inline-edit"
                            style={{ cursor: "pointer" }}
                            title="Edit product & pricing"
                            onClick={() => setProductKey(s.key)}
                          >
                            {s.solar || "—"}
                            {s.battery ? ` + ${s.battery}` : ""}
                          </span>
                          {!!s.extrasTotal && (
                            <div style={{ fontSize: "0.52rem", color: "var(--text-dim)" }}>
                              + {AUD.format(s.extrasTotal)} extras
                            </div>
                          )}
                        </td>
                        {/* 8 Price */}
                        <td>
                          <span className="pipe-price">{AUD.format(s.soldPrice)}</span>
                          {!!s.status.discount && (
                            <div style={{ fontSize: "0.52rem", color: "var(--text-dim)" }}>
                              −{AUD.format(s.status.discount)}
                            </div>
                          )}
                        </td>
                        {/* 9 Payment */}
                        <td>
                          <PaySelect
                            value={pay}
                            onChange={(v) => updateField(s.key, "paymentMethods", v)}
                          />
                        </td>
                        {/* 10 Finance Status */}
                        <td>
                          {isCash ? (
                            <span className="pipe-badge cash">N/A (Cash)</span>
                          ) : (
                            <PipeSelect
                              map={FINANCE_STATUS}
                              value={s.status.financeStatus}
                              onChange={(v) => updateField(s.key, "financeStatus", v)}
                            />
                          )}
                        </td>
                        {/* 11 Pre-Approvals */}
                        <td>
                          <PipeSelect
                            map={PREAPPROVAL_STATUS}
                            value={s.status.adminStatus}
                            onChange={(v) => updateField(s.key, "adminStatus", v)}
                          />
                        </td>
                        {/* 12 Meter Change */}
                        <ProgCell show={globalVis[12]} rowShow={vis[12]}>
                          <PipeSelect map={METER_CHANGE} value={s.status.meterChange} onChange={(v) => updateField(s.key, "meterChange", v)} />
                        </ProgCell>
                        {/* 13 Installation */}
                        <ProgCell show={globalVis[13]} rowShow={vis[13]}>
                          <PipeSelect map={INSTALLATION_STATE} value={s.status.installation} onChange={(v) => updateField(s.key, "installation", v)} />
                        </ProgCell>
                        {/* 14 Status */}
                        <ProgCell show={globalVis[14]} rowShow={vis[14]}>
                          <PipeSelect map={INSTALL_ADMIN_STATUS} value={s.status.installAdminStatus} onChange={(v) => updateField(s.key, "installAdminStatus", v)} />
                        </ProgCell>
                        {/* 15 Install Date */}
                        <ProgCell show={globalVis[15]} rowShow={vis[15]}>
                          <input
                            type="date"
                            className="pipe-date-input"
                            value={s.status.installDate || ""}
                            onChange={(e) => updateField(s.key, "installDate", e.target.value)}
                          />
                        </ProgCell>
                        {/* 16 Install Status */}
                        <ProgCell show={globalVis[16]} rowShow={vis[16]}>
                          <PipeSelect map={INSTALL_STATUS} value={s.status.installStatus} onChange={(v) => updateField(s.key, "installStatus", v)} />
                        </ProgCell>
                        {/* 17 Finalisations */}
                        <ProgCell show={globalVis[17]} rowShow={vis[17]}>
                          <PipeSelect map={FINALISATIONS} value={s.status.finalisations} onChange={(v) => updateField(s.key, "finalisations", v)} />
                        </ProgCell>
                        {/* 18 Payment Status */}
                        <ProgCell show={globalVis[18]} rowShow={vis[18]}>
                          <PipeSelect map={PAYMENT_STATUS} value={s.status.paymentStatus} onChange={(v) => updateField(s.key, "paymentStatus", v)} />
                        </ProgCell>
                        {/* 19 Payment Date */}
                        <td>
                          <input
                            type="date"
                            className="pipe-date-input"
                            value={s.paymentDate || ""}
                            onChange={(e) => {
                              updateSale(s.key, { paymentDate: e.target.value });
                              if (!s.key.startsWith("manual_"))
                                firePatch(`/sales/${s.key}/payment-details`, { paymentDate: e.target.value }, "paymentDate");
                            }}
                          />
                        </td>
                      </tr>
                      {expanded.has(s.key) && (
                        <tr className="pipe-detail-row">
                          <td colSpan={HEADERS.length}>
                            <SaleDetailPanel sale={s} onEdit={editDetail} />
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showAddSale && (
        <AddSaleModal
          onClose={() => setShowAddSale(false)}
          onSave={(sale) => {
            setSales((prev) => [sale, ...prev]);
            setShowAddSale(false);
          }}
        />
      )}

      {productKey &&
        (() => {
          const s = sales.find((x) => x.key === productKey);
          if (!s) return null;
          return <ProductModal sale={s} onEdit={editDetail} onClose={() => setProductKey(null)} />;
        })()}
    </div>
  );
}

// ── Extras catalogue group (checkbox + qty rows) ──
function ExtrasGroup({
  title,
  items,
  qty,
  onToggle,
  onQty,
}: {
  title: string;
  items: ExtraItem[];
  qty: Record<string, number>;
  onToggle: (id: string, on: boolean) => void;
  onQty: (id: string, q: number) => void;
}) {
  return (
    <>
      <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--gold)", margin: "2px 0 6px" }}>{title}</div>
      {items.map((item) => {
        const checked = (qty[item.id] || 0) > 0;
        return (
          <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", borderBottom: "1px solid var(--border)" }}>
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => onToggle(item.id, e.target.checked)}
              style={{ margin: 0, accentColor: "var(--green)" }}
            />
            <span style={{ flex: 1, fontSize: "0.62rem", color: "var(--text)" }}>
              {item.name}
              {item.note && <span style={{ color: "var(--text-faint)", fontSize: "0.55rem" }}> ({item.note})</span>}
            </span>
            <span style={{ fontSize: "0.58rem", color: "var(--text-dim)", whiteSpace: "nowrap" }}>
              {AUD.format(item.price)} {item.perUnit}
            </span>
            <input
              type="number"
              min={0}
              max={999}
              step={1}
              value={checked ? qty[item.id] : 0}
              disabled={!checked}
              onChange={(e) => onQty(item.id, Math.max(1, parseInt(e.target.value, 10) || 1))}
              style={{ width: 44, padding: "2px 4px", fontSize: "0.6rem", border: "1px solid var(--border)", borderRadius: 4, background: "var(--bg)", color: "var(--text)", textAlign: "center" }}
            />
          </div>
        );
      })}
    </>
  );
}

// ── Edit Product & Pricing modal (ports openPipeProductModal) ──
function ProductModal({
  sale,
  onEdit,
  onClose,
}: {
  sale: PipelineSale;
  onEdit: (key: string, leadId: string | undefined, field: keyof PipelineSale, value: string) => void;
  onClose: () => void;
}) {
  // Local form seeded from the sale; persisted field-by-field on Save.
  const [form, setForm] = React.useState(() => ({
    saleType: sale.saleType ?? "",
    state: sale.state ?? "",
    systemSize: sale.systemSize ?? "",
    numPanels: sale.numPanels ?? "",
    panelModel: sale.panelModel ?? "",
    inverterModel: sale.inverterModel ?? "",
    batteryModel: sale.batteryModel ?? "",
    phase: sale.phase ?? "",
    soldPrice: sale.soldPrice != null ? String(sale.soldPrice) : "",
    extrasTotal: sale.extrasTotal != null ? String(sale.extrasTotal) : "",
    company: sale.company ?? "Astra",
  }));
  type FK = keyof typeof form;
  const set = (k: FK, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const hasBattery = form.saleType === "SOLAR_BATTERY" || form.saleType === "BATTERY_ONLY";
  const hasSolar = form.saleType !== "BATTERY_ONLY";

  // ── Extras editor state ──
  const [extrasOpen, setExtrasOpen] = React.useState(false);
  const [extraQty, setExtraQty] = React.useState<Record<string, number>>({});
  const [customExtras, setCustomExtras] = React.useState<{ description: string; amount: number }[]>([]);
  const [rrpOverride, setRrpOverride] = React.useState("");

  const allExtras = React.useMemo(
    () => [...EXTRAS_CATALOGUE, ...EXTRAS_COUNTRY, ...BATTERY_EXTRAS_CATALOGUE],
    [],
  );
  // Recompute the extras total whenever selections change, and push into the form.
  const extrasFromEditor = React.useMemo(() => {
    let t = 0;
    for (const item of allExtras) t += (extraQty[item.id] || 0) * item.price;
    for (const c of customExtras) t += c.amount || 0;
    return Math.round(t * 100) / 100;
  }, [allExtras, extraQty, customExtras]);
  const editorTouched = Object.values(extraQty).some((q) => q > 0) || customExtras.length > 0;
  React.useEffect(() => {
    if (editorTouched) setForm((f) => ({ ...f, extrasTotal: String(extrasFromEditor) }));
  }, [extrasFromEditor, editorTouched]);

  function toggleExtra(id: string, on: boolean) {
    setExtraQty((p) => {
      const n = { ...p };
      if (on) n[id] = n[id] && n[id] > 0 ? n[id] : 1;
      else delete n[id];
      return n;
    });
  }

  // ── Pricing / commission preview (ports ppRecalcPreview's adjustment math) ──
  const baseRRP = Number(sale.totalRRP) || 0;
  const extrasNum = Number(form.extrasTotal) || 0;
  const overrideNum = Number(rrpOverride) || 0;
  const effectiveRRP = (overrideNum > 0 ? overrideNum : baseRRP) + extrasNum;
  const soldNum = Number(form.soldPrice) || 0;
  const baseCommission = Number(sale.totalCommission) || 0;
  const adj = commissionAdjustment(effectiveRRP, soldNum);
  const totalCommission = Math.round(Math.max(0, baseCommission + adj.amount) * 100) / 100;

  function save() {
    // Map the form back onto PipelineSale fields and persist each changed one.
    const orig: Record<FK, string> = {
      saleType: sale.saleType ?? "",
      state: sale.state ?? "",
      systemSize: sale.systemSize ?? "",
      numPanels: sale.numPanels ?? "",
      panelModel: sale.panelModel ?? "",
      inverterModel: sale.inverterModel ?? "",
      batteryModel: sale.batteryModel ?? "",
      phase: sale.phase ?? "",
      soldPrice: sale.soldPrice != null ? String(sale.soldPrice) : "",
      extrasTotal: sale.extrasTotal != null ? String(sale.extrasTotal) : "",
      company: sale.company ?? "Astra",
    };
    (Object.keys(form) as FK[]).forEach((k) => {
      if (form[k] !== orig[k]) onEdit(sale.key, sale.leadId, k as keyof PipelineSale, form[k]);
    });
    // Pricing: persist a manual RRP override and the recomputed commission.
    if (overrideNum > 0) onEdit(sale.key, sale.leadId, "totalRRP", String(effectiveRRP));
    if (totalCommission !== baseCommission) onEdit(sale.key, sale.leadId, "totalCommission", String(totalCommission));
    onClose();
  }

  return (
    <div className="booking-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="booking-modal">
        <div className="booking-modal-header">
          <h3>Edit Product &amp; Pricing</h3>
          <button className="booking-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="booking-modal-body">
          <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginBottom: 10 }}>
            {sale.consultantName} → {sale.firstName} {sale.surname}
          </div>

          <div className="booking-form-row">
            <div className="booking-form-group">
              <label>Sale Type</label>
              <select value={form.saleType} onChange={(e) => set("saleType", e.target.value)}>
                <option value="">—</option>
                {Object.entries(SALE_TYPE_OPTS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="booking-form-group">
              <label>Location / State</label>
              <select value={form.state} onChange={(e) => set("state", e.target.value)}>
                <option value="">—</option>
                {STATE_OPTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {hasSolar && (
            <>
              <div className="booking-section-header" style={{ marginTop: 4 }}>
                ☀️ Solar
              </div>
              <div className="booking-form-row">
                <div className="booking-form-group">
                  <label>System Size (kW)</label>
                  <input value={form.systemSize} onChange={(e) => set("systemSize", e.target.value)} placeholder="e.g. 6.6" />
                </div>
                <div className="booking-form-group">
                  <label>Number of Panels</label>
                  <input value={form.numPanels} onChange={(e) => set("numPanels", e.target.value)} placeholder="e.g. 16" />
                </div>
              </div>
              <div className="booking-form-row">
                <div className="booking-form-group">
                  <label>Panel Brand &amp; Model</label>
                  <input value={form.panelModel} onChange={(e) => set("panelModel", e.target.value)} placeholder="Brand / model" />
                </div>
                <div className="booking-form-group">
                  <label>Inverter</label>
                  <input value={form.inverterModel} onChange={(e) => set("inverterModel", e.target.value)} placeholder="Brand / model" />
                </div>
              </div>
            </>
          )}

          {hasBattery && (
            <>
              <div className="booking-section-header" style={{ marginTop: 4 }}>
                🔋 Battery
              </div>
              <div className="booking-form-row">
                <div className="booking-form-group">
                  <label>Phase</label>
                  <select value={form.phase} onChange={(e) => set("phase", e.target.value)}>
                    <option value="">—</option>
                    {PHASE_OPTS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="booking-form-group">
                  <label>Battery Model</label>
                  <input value={form.batteryModel} onChange={(e) => set("batteryModel", e.target.value)} placeholder="Brand / model" />
                </div>
              </div>
            </>
          )}

          <div className="booking-section-header" style={{ marginTop: 4 }}>
            💰 Pricing
          </div>
          <div className="booking-form-row">
            <div className="booking-form-group">
              <label>Sold Price ($)</label>
              <input type="number" value={form.soldPrice} onChange={(e) => set("soldPrice", e.target.value)} placeholder="0" />
            </div>
            <div className="booking-form-group">
              <label>
                Extras Total ($)
                <button
                  type="button"
                  onClick={() => setExtrasOpen((o) => !o)}
                  style={{
                    marginLeft: 8,
                    padding: "1px 8px",
                    border: "1px solid var(--gold)",
                    background: "transparent",
                    color: "var(--gold)",
                    borderRadius: 4,
                    cursor: "pointer",
                    fontSize: "0.55rem",
                    fontWeight: 600,
                  }}
                >
                  {extrasOpen ? "▲ Close" : "✏️ Edit"}
                </button>
              </label>
              <input type="number" value={form.extrasTotal} onChange={(e) => set("extrasTotal", e.target.value)} placeholder="0" />
            </div>
          </div>

          {extrasOpen && (
            <div
              style={{
                border: "1px solid var(--gold)",
                borderRadius: 8,
                padding: 10,
                marginBottom: 12,
                maxHeight: 320,
                overflowY: "auto",
                background: "var(--gold-soft)",
              }}
            >
              <ExtrasGroup title="Standard Extras" items={EXTRAS_CATALOGUE} qty={extraQty} onToggle={toggleExtra} onQty={(id, q) => setExtraQty((p) => ({ ...p, [id]: q }))} />
              <ExtrasGroup title="Country Job Surcharges" items={EXTRAS_COUNTRY} qty={extraQty} onToggle={toggleExtra} onQty={(id, q) => setExtraQty((p) => ({ ...p, [id]: q }))} />
              {hasBattery && (
                <ExtrasGroup title="Battery Extras" items={BATTERY_EXTRAS_CATALOGUE} qty={extraQty} onToggle={toggleExtra} onQty={(id, q) => setExtraQty((p) => ({ ...p, [id]: q }))} />
              )}
              <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--gold)", margin: "8px 0 6px" }}>Custom Line Items</div>
              {customExtras.map((c, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0" }}>
                  <input
                    type="text"
                    value={c.description}
                    placeholder="Description"
                    onChange={(e) =>
                      setCustomExtras((p) => p.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))
                    }
                    style={{ flex: 1, padding: "3px 6px", fontSize: "0.62rem", border: "1px solid var(--border)", borderRadius: 4, background: "var(--bg)", color: "var(--text)" }}
                  />
                  <span style={{ fontSize: "0.6rem", color: "var(--text-dim)" }}>$</span>
                  <input
                    type="number"
                    value={c.amount || ""}
                    placeholder="0"
                    onChange={(e) =>
                      setCustomExtras((p) => p.map((x, j) => (j === i ? { ...x, amount: parseFloat(e.target.value) || 0 } : x)))
                    }
                    style={{ width: 70, padding: "3px 6px", fontSize: "0.62rem", border: "1px solid var(--border)", borderRadius: 4, background: "var(--bg)", color: "var(--text)", textAlign: "right" }}
                  />
                  <button
                    type="button"
                    onClick={() => setCustomExtras((p) => p.filter((_, j) => j !== i))}
                    style={{ padding: "2px 6px", border: "none", background: "transparent", color: "var(--red)", cursor: "pointer", fontSize: "0.7rem", fontWeight: 700 }}
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setCustomExtras((p) => [...p, { description: "", amount: 0 }])}
                style={{ marginTop: 4, padding: "3px 10px", borderRadius: 4, border: "1px dashed var(--gold)", background: "transparent", color: "var(--gold)", cursor: "pointer", fontSize: "0.6rem", fontWeight: 600 }}
              >
                + Add Custom Item
              </button>
              <div style={{ marginTop: 8, paddingTop: 6, borderTop: "2px solid var(--gold)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--gold)" }}>Total Extras:</span>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--green)" }}>{AUD.format(extrasFromEditor)}</span>
              </div>
            </div>
          )}

          <div className="booking-form-row">
            <div className="booking-form-group">
              <label>Company Type</label>
              <select value={form.company} onChange={(e) => set("company", e.target.value)}>
                {Object.values(COMPANY_OPTS).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="booking-form-group">
              <label>Manual RRP Override ($)</label>
              <input
                type="number"
                value={rrpOverride}
                onChange={(e) => setRrpOverride(e.target.value)}
                placeholder="Leave blank for record RRP"
              />
            </div>
          </div>

          {/* Commission preview */}
          <div style={{ background: "var(--surface2)", borderRadius: 8, padding: 10, marginTop: 4 }}>
            <div style={{ fontSize: "0.62rem", fontWeight: 600, marginBottom: 8, color: "var(--text-dim)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Commission Preview
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 12px", fontSize: "0.7rem" }}>
              <span style={{ color: "var(--text-dim)" }}>RRP (incl. extras):</span>
              <span style={{ textAlign: "right" }}>{AUD.format(effectiveRRP)}</span>
              <span style={{ color: "var(--text-dim)" }}>Sold Price:</span>
              <span style={{ textAlign: "right" }}>{AUD.format(soldNum)}</span>
              <span style={{ color: "var(--text-dim)" }}>Base Commission:</span>
              <span style={{ textAlign: "right" }}>{AUD.format(baseCommission)}</span>
              <span style={{ color: "var(--text-dim)" }}>
                {adj.type === "oversell" ? "Oversell (+25%):" : adj.type === "undersell" ? "Undersell (−60%):" : "Oversell/Undersell:"}
              </span>
              <span style={{ textAlign: "right", color: adj.amount > 0 ? "var(--green)" : adj.amount < 0 ? "var(--red)" : "var(--text)" }}>
                {adj.amount === 0 ? "—" : AUD.format(adj.amount)}
              </span>
              <span style={{ color: "var(--text-dim)", fontWeight: 700 }}>Total Commission:</span>
              <span style={{ textAlign: "right", fontWeight: 700, color: "var(--green)" }}>{AUD.format(totalCommission)}</span>
            </div>
            <div style={{ fontSize: "0.52rem", color: "var(--text-faint)", marginTop: 6 }}>
              Base commission is the recorded value; oversell/undersell applies the legacy 25%/60% adjustment against RRP + extras.
            </div>
          </div>
        </div>
        <div className="booking-modal-footer">
          <button className="booking-btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="booking-btn primary" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Inline expandable sale-detail panel (ports pipeBuildDetailRow) ──
// Every field is editable. Enumerated fields render as <select>; the rest are
// click-to-edit text / number / date / textarea inputs.

type FieldType = "text" | "number" | "date" | "textarea";

function EditableField({
  value,
  type = "text",
  options,
  display,
  onSave,
}: {
  value?: string | number;
  type?: FieldType;
  options?: string[] | Record<string, string>;
  display?: (v: string) => string;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const cur = value === undefined || value === null ? "" : String(value);

  // Selects are always-on editable controls.
  if (options) {
    const entries = Array.isArray(options)
      ? options.map((o) => [o, o] as [string, string])
      : Object.entries(options);
    return (
      <select className="pipe-select" value={cur} onChange={(e) => onSave(e.target.value)}>
        <option value="">—</option>
        {entries.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    );
  }

  if (editing) {
    if (type === "textarea") {
      return (
        <textarea
          autoFocus
          defaultValue={cur}
          rows={2}
          style={{
            width: "100%",
            resize: "vertical",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "4px 6px",
            color: "var(--text)",
            fontSize: "0.66rem",
            fontFamily: "DM Sans, sans-serif",
          }}
          onBlur={(e) => {
            onSave(e.target.value);
            setEditing(false);
          }}
        />
      );
    }
    return (
      <input
        autoFocus
        type={type}
        defaultValue={cur}
        className="pipe-date-input"
        style={{ minWidth: 120 }}
        onBlur={(e) => {
          onSave(e.target.value);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <span className="pipe-inline-edit" onClick={() => setEditing(true)} title="Click to edit">
      {cur !== "" ? (
        display ? display(cur) : cur
      ) : (
        <span style={{ color: "var(--text-faint)" }}>— set —</span>
      )}
    </span>
  );
}

function SaleDetailPanel({
  sale,
  onEdit,
}: {
  sale: PipelineSale;
  onEdit: (key: string, leadId: string | undefined, field: keyof PipelineSale, value: string) => void;
}) {
  const fullAddr = [sale.address, sale.suburb, sale.postcode, sale.state].filter(Boolean).join(", ");
  const mapsUrl = fullAddr ? `https://www.google.com/maps/search/${encodeURIComponent(fullAddr)}` : "";
  const money = (v: string) => (v === "" ? "—" : AUD.format(Number(v)));
  const cancelled = isCancelled(sale.status);
  const E = (field: keyof PipelineSale, extra?: Partial<React.ComponentProps<typeof EditableField>>) => (
    <EditableField value={sale[field] as string | number | undefined} onSave={(v) => onEdit(sale.key, sale.leadId, field, v)} {...extra} />
  );

  const Item = ({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) => (
    <div className={`pipe-detail-item${full ? " pipe-detail-notes" : ""}`}>
      <span className="pipe-detail-label">{label}</span>
      <span className="pipe-detail-val">{children}</span>
    </div>
  );

  return (
    <div className="pipe-detail-panel">
      {/* Contact */}
      <Item label="Phone">{E("phone")}</Item>
      <Item label="Email">{E("email")}</Item>

      {/* Address */}
      <Item label="Street" full>
        {E("address")}
        {fullAddr && (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8 }}>
            📍 Maps
          </a>
        )}
      </Item>
      <Item label="Suburb">{E("suburb")}</Item>
      <Item label="Postcode">{E("postcode")}</Item>
      <Item label="State">{E("state", { options: STATE_OPTS })}</Item>

      {/* Lead / company */}
      <Item label="Lead Generator">{E("leadGen")}</Item>
      <Item label="Company Presented">{E("company", { options: Object.values(COMPANY_OPTS) })}</Item>
      <Item label="Sale Status">{E("saleStatus", { options: SALE_STATUS_OPTS })}</Item>
      <Item label="Sale Type">{E("saleType", { options: SALE_TYPE_OPTS })}</Item>

      {/* Product */}
      <Item label="Solar">{E("solar")}</Item>
      <Item label="Battery">{E("battery")}</Item>

      {/* Financial */}
      <Item label="Total RRP">{E("totalRRP", { type: "number", display: money })}</Item>
      <Item label="Sold Price">{E("soldPrice", { type: "number", display: money })}</Item>
      <Item label="Total Commission">{E("totalCommission", { type: "number", display: money })}</Item>
      <Item label="Extras (RRP)">{E("extrasTotal", { type: "number", display: money })}</Item>

      {/* Sale date + payment */}
      <Item label="Sale Date">{E("saleDate", { type: "date" })}</Item>
      <Item label="Payment">{E("paymentMethod", { options: PAYMENT_OPTS })}</Item>
      <Item label="Payment Date">{E("paymentDate", { type: "date" })}</Item>
      <Item label="Payment Notes" full>
        {E("paymentNotes", { type: "textarea" })}
      </Item>

      {/* System & install details */}
      <div className="pipe-detail-section">System &amp; Install Details</div>
      <Item label="System Type">{E("systemTypeCode", { options: SYSTEM_TYPE_OPTS })}</Item>
      <Item label="System Size (kW)">{E("systemSize", { type: "number" })}</Item>
      <Item label="Panel Model">{E("panelModel")}</Item>
      <Item label="No. Panels">{E("numPanels", { type: "number" })}</Item>
      <Item label="Inverter">{E("inverterModel")}</Item>
      <Item label="Battery Model">{E("batteryModel")}</Item>
      <Item label="Roof Type">{E("roofType", { options: ROOF_TYPE_OPTS })}</Item>
      <Item label="Storeys">{E("storeys", { options: STOREYS_OPTS })}</Item>
      <Item label="Phase">{E("phase", { options: PHASE_OPTS })}</Item>
      <Item label="Switchboard">{E("switchboard", { options: SWITCHBOARD_OPTS })}</Item>
      <Item label="Tilts">{E("tilts", { type: "number" })}</Item>
      <Item label="Backup">{E("backup", { options: BACKUP_OPTS })}</Item>
      <Item label="Hot Water">{E("hotWater", { options: HOTWATER_OPTS })}</Item>
      <Item label="Aircon">{E("aircon", { options: AIRCON_OPTS })}</Item>
      <Item label="Energy Provider">{E("energyProvider")}</Item>
      <Item label="NMI">{E("nmi")}</Item>
      <Item label="Referral">{E("referral")}</Item>
      <Item label="Install Notes" full>
        {E("installNotes", { type: "textarea" })}
      </Item>

      {/* Cancellation */}
      {cancelled && (
        <>
          <div className="pipe-detail-section danger">Cancellation</div>
          <Item label="Status">
            <span style={{ color: "var(--red)" }}>Cancelled</span>
          </Item>
        </>
      )}
    </div>
  );
}

// ── small components ──
function PipeSelect({
  map,
  value,
  onChange,
}: {
  map: Record<string, string>;
  value?: string;
  onChange: (v: string) => void;
}) {
  return (
    <select className="pipe-select" value={value || ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {Object.entries(map).map(([val, label]) => (
        <option key={val} value={val}>
          {label}
        </option>
      ))}
    </select>
  );
}

function PaySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const cls = value === "cash" ? "cash" : value === "hesp" ? "hesp" : "finance";
  return (
    <select
      className={`pipe-select pipe-badge ${cls}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ minWidth: 90 }}
    >
      <option value="cash">CASH</option>
      <option value="finance">FINANCE</option>
      <option value="hesp">HESP</option>
    </select>
  );
}

function ProgCell({
  show,
  rowShow,
  children,
}: {
  show: boolean;
  rowShow: boolean;
  children: React.ReactNode;
}) {
  return <td className={show ? "pipe-col-visible" : "pipe-col-hidden"}>{rowShow ? children : null}</td>;
}

// ── Add Sale modal (ported from openManualSaleModal / saveManualSale) ──
function AddSaleModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (sale: PipelineSale) => void;
}) {
  const [form, setForm] = React.useState({ ...EMPTY_FORM });
  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function save() {
    if (!form.consultantName.trim()) return window.alert("Consultant is required");
    if (!form.firstName.trim() || !form.surname.trim()) return window.alert("Customer name is required");
    if (!form.phone.trim()) return window.alert("Phone is required");
    const price = parseFloat(form.soldPrice);
    if (!price || price <= 0) return window.alert("A valid price is required");
    const key = `manual_${Date.now()}_${form.firstName}_${form.surname}_${form.phone}`
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "");
    onSave({
      key,
      consultantId: "manual",
      consultantName: form.consultantName.trim(),
      company: form.company,
      companyType: form.companyType,
      firstName: form.firstName.trim(),
      surname: form.surname.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      address: form.address.trim(),
      suburb: form.suburb.trim(),
      postcode: form.postcode.trim(),
      state: form.state,
      leadGen: form.leadGen.trim(),
      solar: form.solar.trim(),
      battery: form.battery.trim(),
      extrasTotal: 0,
      soldPrice: price,
      paymentMethod: form.paymentMethod,
      status: {},
    });
  }
  return (
    <div className="booking-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="booking-modal">
        <div className="booking-modal-header">
          <h3>Add Manual Sale</h3>
          <button className="booking-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="booking-modal-body">
          <div className="booking-section-header" style={{ marginTop: 0 }}>
            Consultant & Customer
          </div>
          <div className="booking-form-row">
            <div className="booking-form-group">
              <label>Consultant *</label>
              <input value={form.consultantName} onChange={(e) => set("consultantName", e.target.value)} placeholder="Consultant name" />
            </div>
            <div className="booking-form-group">
              <label>Lead Gen</label>
              <input value={form.leadGen} onChange={(e) => set("leadGen", e.target.value)} placeholder="Lead gen rep" />
            </div>
          </div>
          <div className="booking-form-row">
            <div className="booking-form-group">
              <label>First Name *</label>
              <input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
            </div>
            <div className="booking-form-group">
              <label>Surname *</label>
              <input value={form.surname} onChange={(e) => set("surname", e.target.value)} />
            </div>
          </div>
          <div className="booking-form-row">
            <div className="booking-form-group">
              <label>Phone *</label>
              <input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div className="booking-form-group">
              <label>Email</label>
              <input value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
          </div>
          <div className="booking-form-row">
            <div className="booking-form-group">
              <label>Suburb</label>
              <input value={form.suburb} onChange={(e) => set("suburb", e.target.value)} />
            </div>
            <div className="booking-form-group">
              <label>State</label>
              <select value={form.state} onChange={(e) => set("state", e.target.value)}>
                <option value="TAS">TAS</option>
                <option value="ACT">ACT</option>
                <option value="NSW">NSW</option>
              </select>
            </div>
          </div>

          <div className="booking-section-header">System & Sale</div>
          <div className="booking-form-row">
            <div className="booking-form-group">
              <label>Solar</label>
              <input value={form.solar} onChange={(e) => set("solar", e.target.value)} placeholder="e.g. 6.6kW" />
            </div>
            <div className="booking-form-group">
              <label>Battery</label>
              <input value={form.battery} onChange={(e) => set("battery", e.target.value)} placeholder="Brand / model" />
            </div>
          </div>
          <div className="booking-form-row">
            <div className="booking-form-group">
              <label>Sold Price *</label>
              <input value={form.soldPrice} onChange={(e) => set("soldPrice", e.target.value)} placeholder="e.g. 18900" />
            </div>
            <div className="booking-form-group">
              <label>Payment Method</label>
              <select value={form.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)}>
                <option value="cash">Cash</option>
                <option value="finance">Finance</option>
                <option value="hesp">HESP</option>
              </select>
            </div>
          </div>
          <div className="booking-form-row">
            <div className="booking-form-group">
              <label>Company</label>
              <select
                value={form.companyType}
                onChange={(e) => {
                  set("companyType", e.target.value);
                  set("company", e.target.value === "dcnt" ? "DC ELEC" : "Astra");
                }}
              >
                <option value="astra">Astra</option>
                <option value="dcnt">DC ELEC</option>
              </select>
            </div>
            <div className="booking-form-group" />
          </div>
        </div>
        <div className="booking-modal-footer">
          <button className="booking-btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="booking-btn primary" onClick={save}>
            Add Sale
          </button>
        </div>
      </div>
    </div>
  );
}
