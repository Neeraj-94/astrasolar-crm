"use client";

import { useState } from "react";
import { Calculator, X, RotateCcw, ChevronDown } from "lucide-react";
import { usePriceCalc } from "./use-price-calc";

/**
 * System Price Calculator modal. Opened from the floating dock cluster.
 * Ported from the legacy astrasolar-app price calculator: solar + battery RRP
 * build-up, extras, and a commission estimator.
 *
 * Styling uses the app's semantic theme tokens (card/popover/muted/border/
 * success/warning/info/destructive) so it follows light & dark mode.
 */
export function PriceCalcModal({ onClose }: { onClose: () => void }) {
  const c = usePriceCalc();
  const [extrasOpen, setExtrasOpen] = useState(false);
  const { result, money } = c;

  const fieldCls =
    "w-full rounded-md border border-input bg-background px-2.5 py-2 text-sm text-foreground outline-none focus:border-ring";
  const labelCls = "mb-1 block text-[0.7rem] font-medium text-muted-foreground";
  const cardCls = "mt-3 rounded-xl border border-border bg-muted/40 p-4";

  return (
    <div
      className="fixed inset-0 z-[9000] flex items-start justify-center overflow-y-auto bg-foreground/40 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="my-4 w-full max-w-[560px] rounded-2xl border border-border bg-popover text-popover-foreground shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2 font-semibold">
            <Calculator size={18} className="text-success" />
            System Price Calculator
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={c.reset}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw size={13} /> Reset
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X size={13} /> Close
            </button>
          </div>
        </div>

        <div className="max-h-[80vh] overflow-y-auto px-5 py-4">
          {/* Sale Type */}
          <div>
            <label className="mb-1 block text-sm font-semibold text-foreground">
              Sale Type
            </label>
            <select
              className={fieldCls}
              value={c.saleType}
              onChange={(e) => c.setSaleType(e.target.value as typeof c.saleType)}
            >
              <option value="no">Solar Only</option>
              <option value="battery_only">Battery Only</option>
              <option value="solar_battery">Solar + Battery Bundle</option>
            </select>
          </div>

          {/* Solar Section — hidden entirely for Battery Only */}
          {c.saleType !== "battery_only" && (
          <div className={cardCls}>
            <div className="mb-3 text-sm font-bold text-warning">
              ☀️ Solar System
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className={labelCls}>Pricing</label>
                <select
                  className={fieldCls}
                  value={c.brand}
                  onChange={(e) => c.setBrand(e.target.value)}
                  disabled={c.brandOptions.length === 0}
                >
                  {c.brandOptions.length === 0 && (
                    <option value="">
                      {c.solarLoading ? "Loading…" : "No products"}
                    </option>
                  )}
                  {c.brandOptions.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>State</label>
                <select
                  className={fieldCls}
                  value={c.state}
                  onChange={(e) => c.setState(e.target.value)}
                >
                  {c.stateChoices.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>System Size</label>
                <select
                  className={fieldCls}
                  value={c.size}
                  onChange={(e) => c.setSize(e.target.value)}
                >
                  {c.sizeOptions.length === 0 && (
                    <option value="">—</option>
                  )}
                  {c.sizeOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Company</label>
                <select
                  className={fieldCls}
                  value={c.company}
                  onChange={(e) =>
                    c.setCompany(e.target.value as typeof c.company)
                  }
                >
                  <option value="">Astra</option>
                  <option value="dcnt">DC (+2%)</option>
                </select>
              </div>
            </div>
          </div>
          )}

          {/* Battery Section — hidden entirely for Solar Only */}
          {c.saleType !== "no" && (
            <div className={cardCls}>
              <div className="mb-3 text-sm font-bold text-info">🔋 Battery</div>
              {/* Battery pricing is region-dependent, so when the solar section
                  is hidden (Battery Only) we surface State here. */}
              {c.saleType === "battery_only" && (
                <div className="mb-2.5">
                  <label className={labelCls}>State</label>
                  <select
                    className={fieldCls}
                    value={c.state}
                    onChange={(e) => c.setState(e.target.value)}
                  >
                    {c.stateChoices.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className={labelCls}>Phase</label>
                  <select
                    className={fieldCls}
                    value={c.battPhase}
                    onChange={(e) =>
                      c.setBattPhase(Number(e.target.value) as 1 | 3)
                    }
                  >
                    <option value={1}>1-Phase</option>
                    <option value={3}>3-Phase</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Inverter Model</label>
                  <select
                    className={fieldCls}
                    value={c.battInverter}
                    onChange={(e) => c.setBattInverter(e.target.value)}
                  >
                    {c.inverterOptions.length === 0 && (
                      <option value="">No inverters for this phase</option>
                    )}
                    {c.inverterOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-2.5">
                <label className={labelCls}>Battery Model &amp; Size</label>
                <select
                  className={fieldCls}
                  value={c.battModel}
                  onChange={(e) => c.setBattModel(e.target.value)}
                >
                  {c.modelOptions.length === 0 && (
                    <option value="">No batteries available</option>
                  )}
                  {c.modelOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-2 flex items-center justify-between rounded-lg border border-success/20 bg-success/10 px-3 py-2">
                <span className="text-xs text-muted-foreground">
                  Battery RRP:
                </span>
                <span className="text-sm font-bold text-success">
                  {result.battRRP ? `$${money(result.battRRP)}` : "—"}
                </span>
              </div>
            </div>
          )}

          {/* Extras */}
          <div className={cardCls}>
            <button
              className="flex w-full items-center justify-between"
              onClick={() => setExtrasOpen((v) => !v)}
            >
              <span className="text-sm font-bold text-info">
                📋 Extras
                {result.extras > 0 && (
                  <span className="ml-2 text-xs font-bold text-success">
                    ${money(result.extras)}
                  </span>
                )}
              </span>
              <ChevronDown
                size={16}
                className={`text-muted-foreground transition-transform ${extrasOpen ? "rotate-180" : ""}`}
              />
            </button>

            <div className="mt-2 flex items-center justify-end gap-2">
              <span className="text-[0.65rem] text-muted-foreground">
                manual $:
              </span>
              <input
                type="number"
                min={0}
                value={c.manualExtras ?? ""}
                placeholder="0"
                onChange={(e) => c.setManual(parseFloat(e.target.value) || 0)}
                className="w-24 rounded-md border border-input bg-background px-2 py-1 text-right text-xs text-foreground"
              />
            </div>

            {extrasOpen && (
              <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-border bg-background p-2">
                {c.extrasGroups.length === 0 && (
                  <div className="px-1 py-2 text-[0.65rem] text-muted-foreground">
                    No extras in the catalogue.
                  </div>
                )}
                {c.extrasGroups.map((group) => (
                  <div key={group.title}>
                    <div className="mb-1.5 mt-2 text-[0.65rem] font-bold text-info">
                      {group.title}
                    </div>
                    {group.items.map((item) => {
                      const qty = c.extrasQty[item.id] || 0;
                      const checked = qty > 0;
                      return (
                        <div
                          key={item.id}
                          className="flex items-center gap-2 border-b border-border py-1"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              c.toggleExtra(item.id, e.target.checked)
                            }
                            className="accent-success"
                          />
                          <span className="flex-1 text-[0.65rem] text-foreground">
                            {item.name}
                            {item.note && (
                              <span className="text-muted-foreground">
                                {" "}
                                ({item.note})
                              </span>
                            )}
                          </span>
                          <span className="whitespace-nowrap text-[0.6rem] text-muted-foreground">
                            ${money(item.price)} {item.perUnit}
                          </span>
                          <input
                            type="number"
                            min={0}
                            max={999}
                            value={qty || 0}
                            disabled={!checked}
                            onChange={(e) =>
                              c.setExtraQty(
                                item.id,
                                parseInt(e.target.value) || 0,
                              )
                            }
                            className="w-12 rounded border border-input bg-muted px-1 py-0.5 text-center text-[0.62rem] text-foreground disabled:opacity-40"
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}
                <div className="mt-2 flex items-center justify-between border-t-2 border-info/40 pt-2">
                  <span className="text-xs font-bold text-info">
                    Total Extras:
                  </span>
                  <span className="text-sm font-bold text-success">
                    ${money(c.pickerTotal)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* RRP Summary */}
          <div className="mt-4 rounded-xl border-2 border-success bg-success/5 p-4">
            <div className="mb-3 text-sm font-bold text-success">
              RRP Summary
            </div>
            {!result.solarValid ? (
              <div className="text-xs text-warning">
                No solar product for this combination — adjust pricing, state or
                size.
              </div>
            ) : (
              <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-xs">
                <span className="text-muted-foreground">Solar Base RRP:</span>
                <span className="text-right font-semibold">
                  {result.isBatteryOnly ? "N/A" : `$${money(result.baseRRP)}`}
                </span>
                <span className="text-muted-foreground">DCNT Markup:</span>
                <span className="text-right font-semibold">
                  {result.isBatteryOnly
                    ? "N/A"
                    : result.dcntAmt > 0
                      ? `+$${money(result.dcntAmt)}`
                      : "—"}
                </span>
                {result.battRRP > 0 && (
                  <>
                    <span className="text-muted-foreground">
                      Battery Package:
                    </span>
                    <span className="text-right font-semibold text-success">
                      +${money(result.battRRP)}
                    </span>
                  </>
                )}
                <span className="text-muted-foreground">Extras:</span>
                <span className="text-right font-semibold">
                  {result.extras > 0 ? `+$${money(result.extras)}` : "—"}
                </span>
                <span className="mt-1 border-t-2 border-success pt-2 font-bold text-success">
                  TOTAL RRP:
                </span>
                <span className="mt-1 border-t-2 border-success pt-2 text-right font-bold text-success">
                  ${money(result.finalRRP)}
                </span>
              </div>
            )}
          </div>

          {/* Commission Estimator */}
          <div className={cardCls}>
            <div className="mb-2 text-sm font-bold text-warning">
              💰 Commission Estimator
            </div>
            <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
              <span className="text-xs text-muted-foreground">
                Base Commission:
              </span>
              <span className="text-right text-xs font-semibold text-warning">
                {result.isBatteryOnly ? "—" : `$${money(result.baseComm, 0)}`}
              </span>
              <span className="text-xs text-muted-foreground">
                Your Sold Price:
              </span>
              <input
                type="number"
                min={0}
                value={c.soldPrice}
                placeholder="0"
                onChange={(e) => c.setSoldPrice(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-right text-sm text-foreground"
              />
            </div>

            <div className="mt-3 rounded-lg border border-border bg-background p-3">
              <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
                <span className="text-muted-foreground">Difference vs RRP:</span>
                <span
                  className={`text-right font-semibold ${
                    result.commission.type === null
                      ? ""
                      : result.commission.diff >= 0
                        ? "text-success"
                        : "text-destructive"
                  }`}
                >
                  {result.commission.type === null
                    ? "—"
                    : `${result.commission.diff >= 0 ? "+" : ""}$${money(result.commission.diff)}`}
                </span>

                <span className="text-muted-foreground">Type:</span>
                <span className="text-right font-semibold">
                  {result.commission.type === null
                    ? "—"
                    : result.commission.type === "undersell"
                      ? "UNDERSELL"
                      : result.commission.type === "oversell"
                        ? "OVERSELL"
                        : "AT RRP"}
                </span>

                <span className="text-muted-foreground">Adjustment:</span>
                <span
                  className={`text-right font-semibold ${
                    result.commission.type === "undersell"
                      ? "text-destructive"
                      : result.commission.type === "oversell"
                        ? "text-success"
                        : ""
                  }`}
                >
                  {result.commission.type === null
                    ? "—"
                    : `${result.commission.adjustment >= 0 ? "+" : "-"}$${money(Math.abs(result.commission.adjustment))}`}
                </span>

                <span className="text-muted-foreground">
                  Battery Commission:
                </span>
                <span className="text-right font-semibold text-info">
                  {result.commission.battComm > 0
                    ? `+$${money(result.commission.battComm, 0)}`
                    : "—"}
                </span>

                <span className="mt-1 border-t border-border pt-1.5 font-bold text-warning">
                  TOTAL COMMISSION:
                </span>
                <span className="mt-1 border-t border-border pt-1.5 text-right font-bold text-success">
                  {result.commission.total === null
                    ? "—"
                    : `$${money(result.commission.total)}`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
