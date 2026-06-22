"use client";

import { useMemo, useState } from "react";
import { useApi } from "@/lib/api/use-api";
import { calcCommissionAdjustment, calcOverUnderSell } from "./pricing-engine";

export type SaleType = "no" | "solar_battery" | "battery_only";

type BatteryContext = "BATTERY_ONLY" | "SOLAR_BATTERY";

/** Live solar catalogue row (GET /products/solar, active products only).
 *  Decimal columns arrive as strings over JSON, so coerce with Number(). */
export interface SolarProduct {
  id: string;
  productName: string;
  brand: string | null;
  systemSize: number | string | null;
  solarRrp: number | string | null;
  solarCommission: number | string | null;
  profit: number | string | null;
  states: string[];
  status: string;
}

/** Priced-battery matrix row (GET /products/battery-priced). */
export interface PricedBattery {
  id: string;
  productName: string;
  brand: string | null;
  batteryModel: string | null;
  batterySize: number | null;
  modules: number | null;
  batteryStc: number | null;
  phase: number | null;
  states: string[];
  batteryCommission: number | null;
  grossPrice: number | null;
  contextPrices: { context: BatteryContext; batteryRrp: number | null }[];
  combos: {
    compatId: string;
    inverterId: string;
    inverterModel: string | null;
    inverterName: string;
    phase: number | null;
    prices: { context: BatteryContext; batteryRrp: number | null }[];
  }[];
}

export interface ExtraItem {
  id: string;
  name: string;
  price: number;
  perUnit: string;
  note?: string;
}

/** Live extras catalogue row (GET /products/extras). */
export interface ExtraProduct {
  id: string;
  itemName: string;
  category: string | null;
  unit: string | null;
  unitPrice: number | string | null;
  notes: string | null;
}

export interface ExtraGroup {
  title: string;
  items: ExtraItem[];
}

const FALLBACK_STATES = ["ACT", "TAS"];

function money(n: number, dp = 2): string {
  return n.toLocaleString("en-AU", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

function num(v: number | string | null | undefined): number {
  return typeof v === "number" ? v : parseFloat(String(v ?? "")) || 0;
}

function batteryLabel(b: PricedBattery): string {
  const base = b.batteryModel ?? b.productName ?? "Battery";
  return b.batterySize ? `${base} (${b.batterySize}kWh)` : base;
}

/**
 * Headless calculator state + derived pricing.
 *
 * Solar pricing  → GET /products/solar          (brand / state / size / RRP / commission)
 * Battery pricing→ GET /products/battery-priced  (phase → inverter → battery → context RRP)
 * Commission / oversell-undersell math stays on the ported pricing engine.
 */
export function usePriceCalc() {
  const solarApi = useApi<SolarProduct[]>("/products/solar");
  const batteryApi = useApi<PricedBattery[]>("/products/battery-priced");
  const extrasApi = useApi<ExtraProduct[]>("/products/extras");

  const [saleType, setSaleType] = useState<SaleType>("no");
  const [brand, setBrand] = useState<string>("");
  const [stateSel, setStateSel] = useState<string>("");
  const [size, setSize] = useState<string>("");
  const [company, setCompany] = useState<"" | "dcnt">("");

  const [battPhase, setBattPhase] = useState<1 | 3>(1);
  const [battInverter, setBattInverter] = useState<string>("");
  const [battModel, setBattModel] = useState<string>("");

  // Extras: per-id quantity from the picker (0 = unselected). A non-null
  // manual override replaces the picker total entirely.
  const [extrasQty, setExtrasQty] = useState<Record<string, number>>({});
  const [manualExtras, setManualExtras] = useState<number | null>(null);

  const [soldPrice, setSoldPrice] = useState<string>("");

  const hasBattery = saleType !== "no";
  const isBatteryOnly = saleType === "battery_only";
  const ctx: BatteryContext = isBatteryOnly ? "BATTERY_ONLY" : "SOLAR_BATTERY";

  // ── Live solar catalogue (active, priced rows only) ──
  const catalogue = useMemo<SolarProduct[]>(
    () =>
      (solarApi.data ?? []).filter(
        (p) => p.systemSize != null && p.solarRrp != null,
      ),
    [solarApi.data],
  );

  const matrix = useMemo<PricedBattery[]>(
    () => batteryApi.data ?? [],
    [batteryApi.data],
  );

  // Pricing (brand) options — distinct brands, Standard-ish first.
  const brandOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of catalogue) if (p.brand) set.add(p.brand);
    return [...set].sort((a, b) => {
      const rank = (x: string) => (/standard/i.test(x) ? 0 : 1);
      return rank(a) - rank(b) || a.localeCompare(b);
    });
  }, [catalogue]);

  const effectiveBrand = useMemo(() => {
    if (brand && brandOptions.includes(brand)) return brand;
    return brandOptions[0] ?? "";
  }, [brand, brandOptions]);

  // State options for the chosen brand; Battery Only uses battery states.
  const solarStatesForBrand = useMemo(() => {
    const set = new Set<string>();
    for (const p of catalogue) {
      if (p.brand !== effectiveBrand) continue;
      for (const s of p.states ?? []) set.add(s);
    }
    return [...set].sort();
  }, [catalogue, effectiveBrand]);

  const batteryStates = useMemo(() => {
    const set = new Set<string>();
    for (const b of matrix) for (const s of b.states ?? []) set.add(s);
    return [...set].sort();
  }, [matrix]);

  const stateChoices = useMemo(() => {
    if (isBatteryOnly)
      return batteryStates.length ? batteryStates : FALLBACK_STATES;
    if (solarStatesForBrand.length) return solarStatesForBrand;
    return FALLBACK_STATES;
  }, [isBatteryOnly, batteryStates, solarStatesForBrand]);

  const effectiveState = useMemo(() => {
    if (stateSel && stateChoices.includes(stateSel)) return stateSel;
    return stateChoices[0] ?? "";
  }, [stateSel, stateChoices]);

  const region = effectiveState;

  // Matching solar rows for brand + state, sorted by size.
  const solarRows = useMemo(
    () =>
      catalogue
        .filter(
          (p) =>
            p.brand === effectiveBrand &&
            (p.states ?? []).includes(effectiveState),
        )
        .sort((a, b) => num(a.systemSize) - num(b.systemSize)),
    [catalogue, effectiveBrand, effectiveState],
  );

  const sizeOptions = useMemo(
    () =>
      solarRows.map((p) => ({
        value: num(p.systemSize),
        label: `${num(p.systemSize)} kW`,
      })),
    [solarRows],
  );

  const effectiveSize = useMemo(() => {
    if (size && sizeOptions.some((o) => String(o.value) === size)) return size;
    return sizeOptions.length ? String(sizeOptions[0].value) : "";
  }, [size, sizeOptions]);

  // ── Battery cascade (DB-backed) ──
  const stateMatch = (b: PricedBattery) =>
    !b.states || b.states.length === 0 || b.states.includes(region);
  const phaseMatch = (p: number | null) => p == null || p === battPhase;
  const ctxRrp = (b: PricedBattery, combo: PricedBattery["combos"][number]) => {
    const cp = combo.prices.find((x) => x.context === ctx);
    if (cp && cp.batteryRrp != null) return cp.batteryRrp;
    const bp = b.contextPrices.find((x) => x.context === ctx);
    return bp?.batteryRrp ?? null;
  };

  const inverterOptions = useMemo(() => {
    if (!hasBattery) return [] as { value: string; label: string }[];
    const seen = new Map<string, { value: string; label: string }>();
    for (const b of matrix) {
      if (!stateMatch(b)) continue;
      for (const combo of b.combos) {
        if (!phaseMatch(combo.phase)) continue;
        if (ctxRrp(b, combo) == null) continue;
        if (!seen.has(combo.inverterId)) {
          seen.set(combo.inverterId, {
            value: combo.inverterId,
            label: combo.inverterModel ?? combo.inverterName,
          });
        }
      }
    }
    return [...seen.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrix, hasBattery, battPhase, region, ctx]);

  const effectiveInverter = useMemo(() => {
    if (battInverter && inverterOptions.some((o) => o.value === battInverter))
      return battInverter;
    return inverterOptions.length ? inverterOptions[0].value : "";
  }, [battInverter, inverterOptions]);

  const modelOptions = useMemo(() => {
    if (!hasBattery || !effectiveInverter)
      return [] as { value: string; label: string }[];
    const opts: { value: string; label: string }[] = [];
    for (const b of matrix) {
      if (!stateMatch(b)) continue;
      for (const combo of b.combos) {
        if (combo.inverterId !== effectiveInverter) continue;
        if (!phaseMatch(combo.phase)) continue;
        const rrp = ctxRrp(b, combo);
        if (rrp == null) continue;
        opts.push({
          value: b.id,
          label: `${batteryLabel(b)} — $${money(rrp)}`,
        });
      }
    }
    return opts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrix, hasBattery, effectiveInverter, battPhase, region, ctx]);

  const effectiveModel = useMemo(() => {
    if (battModel && modelOptions.some((o) => o.value === battModel))
      return battModel;
    return modelOptions.length ? modelOptions[0].value : "";
  }, [battModel, modelOptions]);

  // ── Live extras catalogue (GET /products/extras), grouped by category ──
  const extrasGroups = useMemo<ExtraGroup[]>(() => {
    const groups = new Map<string, ExtraItem[]>();
    for (const e of extrasApi.data ?? []) {
      const item: ExtraItem = {
        id: e.id,
        name: e.itemName,
        price: num(e.unitPrice),
        perUnit: e.unit ?? "",
        note: e.notes ?? undefined,
      };
      const key = e.category?.trim() || "Other";
      const arr = groups.get(key) ?? [];
      arr.push(item);
      groups.set(key, arr);
    }
    return [...groups.entries()].map(([title, items]) => ({ title, items }));
  }, [extrasApi.data]);

  const allExtras = useMemo<ExtraItem[]>(
    () => extrasGroups.flatMap((g) => g.items),
    [extrasGroups],
  );

  // ── Extras total ──
  const pickerTotal = useMemo(() => {
    let total = 0;
    for (const item of allExtras) {
      const qty = extrasQty[item.id] || 0;
      if (qty > 0) total += item.price * qty;
    }
    return Math.round(total * 100) / 100;
  }, [extrasQty, allExtras]);

  const extras = manualExtras !== null ? manualExtras : pickerTotal;

  // ── Pricing ──
  const result = useMemo(() => {
    const sizeNum = parseFloat(effectiveSize) || 0;
    let baseRRP = 0;
    let baseComm = 0;
    let dcntAmt = 0;
    let solarValid = true;

    if (!isBatteryOnly) {
      const product = solarRows.find(
        (p) => num(p.systemSize) === sizeNum && sizeNum > 0,
      );
      if (!product) {
        solarValid = false;
      } else {
        baseRRP = num(product.solarRrp);
        baseComm = num(product.solarCommission);
        if (company === "dcnt") dcntAmt = Math.round(baseRRP * 0.02 * 100) / 100;
      }
    }

    // Battery — RRP + commission straight from the DB matrix.
    let battRRP = 0;
    let battComm = 0;
    if (hasBattery && effectiveModel && effectiveInverter) {
      const b = matrix.find((x) => x.id === effectiveModel);
      const combo = b?.combos.find((c) => c.inverterId === effectiveInverter);
      if (b && combo) {
        battRRP = ctxRrp(b, combo) ?? 0;
        battComm = b.batteryCommission ?? 0;
      }
    }

    const finalRRP = Math.round((baseRRP + dcntAmt + extras + battRRP) * 100) / 100;

    // Commission
    const sold = parseFloat(soldPrice) || 0;
    let commission: {
      diff: number;
      type: "oversell" | "undersell" | "even" | null;
      adjustment: number;
      battComm: number;
      total: number | null;
    } = { diff: 0, type: null, adjustment: 0, battComm, total: null };

    if (finalRRP && sold) {
      const adj = calcCommissionAdjustment(finalRRP, sold, hasBattery);
      const ou = calcOverUnderSell({ soldPrice: sold, rrp: finalRRP, extras: 0 });
      const solarComm = Math.max(0, baseComm + adj.amount);
      commission = {
        diff: ou.diff,
        type: adj.type as "oversell" | "undersell" | "even",
        adjustment: adj.amount,
        battComm,
        total: Math.round((solarComm + battComm) * 100) / 100,
      };
    }

    return {
      solarValid,
      isBatteryOnly,
      baseRRP,
      baseComm,
      dcntAmt,
      battRRP,
      extras,
      finalRRP,
      commission,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    effectiveSize,
    isBatteryOnly,
    solarRows,
    company,
    hasBattery,
    effectiveModel,
    effectiveInverter,
    matrix,
    ctx,
    extras,
    soldPrice,
  ]);

  function toggleExtra(id: string, checked: boolean) {
    setManualExtras(null);
    setExtrasQty((prev) => {
      const next = { ...prev };
      next[id] = checked ? Math.max(1, prev[id] || 0) : 0;
      return next;
    });
  }

  function setExtraQty(id: string, qty: number) {
    setManualExtras(null);
    setExtrasQty((prev) => ({ ...prev, [id]: Math.max(0, qty) }));
  }

  function setManual(value: number) {
    setManualExtras(value);
    setExtrasQty({});
  }

  /**
   * Switch sale type and reset the now-hidden section so its values neither
   * show nor contribute to the totals.
   */
  function changeSaleType(next: SaleType) {
    setSaleType(next);
    if (next === "no") {
      setBattInverter("");
      setBattModel("");
      setBattPhase(1);
    } else if (next === "battery_only") {
      setSize("");
      setBrand("");
      setCompany("");
    }
  }

  function reset() {
    setSaleType("no");
    setBrand("");
    setStateSel("");
    setSize("");
    setCompany("");
    setBattPhase(1);
    setBattInverter("");
    setBattModel("");
    setExtrasQty({});
    setManualExtras(null);
    setSoldPrice("");
  }

  return {
    // state
    saleType,
    setSaleType: changeSaleType,
    brand: effectiveBrand,
    setBrand,
    state: effectiveState,
    setState: setStateSel,
    size: effectiveSize,
    setSize,
    company,
    setCompany,
    battPhase,
    setBattPhase,
    battInverter: effectiveInverter,
    setBattInverter,
    battModel: effectiveModel,
    setBattModel,
    extrasQty,
    manualExtras,
    soldPrice,
    setSoldPrice,
    // derived
    brandOptions,
    stateChoices,
    sizeOptions,
    inverterOptions,
    modelOptions,
    extrasGroups,
    pickerTotal,
    result,
    money,
    // status
    solarLoading: solarApi.loading,
    batteryLoading: batteryApi.loading,
    catalogueEmpty: !solarApi.loading && brandOptions.length === 0,
    // actions
    toggleExtra,
    setExtraQty,
    setManual,
    reset,
  };
}
