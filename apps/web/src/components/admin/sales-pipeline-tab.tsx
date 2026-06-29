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
import { type ApiSale, mapApiSaleToPipeline } from "./legacy-map";
import { useApi } from "@/lib/api/use-api";
import { useSaleDetail } from "@/components/sales/use-sale-detail";

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

  // Sale detail modal (reuses the v2 SaleDetailModal that loads /sales/:id).
  const saleDetail = useSaleDetail(() => feed.reload());
  // Rows added via the Add Sale modal use synthetic keys; only real DB ids open.
  const openDetail = (key: string) => {
    if (!key.startsWith("manual_")) saleDetail.open(key);
  };

  const [topFilter, setTopFilter] = React.useState<TopFilter>("all");
  const [search, setSearch] = React.useState("");
  const [colFilters, setColFilters] = React.useState<Record<string, string>>({});
  const [editing, setEditing] = React.useState<{ key: string; field: string } | null>(null);
  const [showAddSale, setShowAddSale] = React.useState(false);
  const [copied, setCopied] = React.useState<string | null>(null);

  // ── update a single status field with stage-gating + side effects ──
  function updateField(key: string, field: keyof PipelineStatus, value: string | number | undefined) {
    setSales((prev) =>
      prev.map((s) => {
        if (s.key !== key) return s;
        const status = { ...s.status };
        // Stage gate
        const gate = STAGE_REQUIREMENTS[field as string];
        if (value && gate) {
          const err = gate(status);
          if (err) {
            if (typeof window !== "undefined") window.alert(err);
            return s;
          }
        }
        if (value === "" || value === undefined) {
          delete (status as Record<string, unknown>)[field as string];
        } else {
          (status as Record<string, unknown>)[field as string] = value;
        }
        // Side effect: booking installation auto-sets install status due.
        if (field === "installation" && value === "installation_booked" && !status.installStatus) {
          status.installStatus = "installation_due";
        }
        return { ...s, status };
      }),
    );
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
                      <tr key={s.key} className={rowCls}>
                        {/* 0 # */}
                        <td>
                          {!s.status.openSolarId && <span className="pipe-missing" title="Missing Open Solar ID" />}
                          {idx + 1}
                        </td>
                        {/* 1 Consultant */}
                        <td>
                          <span
                            className="pipe-consultant"
                            style={{ cursor: s.key.startsWith("manual_") ? "default" : "pointer" }}
                            onClick={() => openDetail(s.key)}
                            title="View sale details"
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
                            style={{ cursor: s.key.startsWith("manual_") ? "default" : "pointer", color: "var(--gold)" }}
                            title="View sale details"
                            onClick={() => openDetail(s.key)}
                          >
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
                          <span className="pipe-product" title={`${s.solar || ""} ${s.battery || ""}`}>
                            {s.solar}
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
                            onChange={(e) => updateSale(s.key, { paymentDate: e.target.value })}
                          />
                        </td>
                      </tr>
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

      {/* Sale detail modal (loads /sales/:id) */}
      {saleDetail.dialog}
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
