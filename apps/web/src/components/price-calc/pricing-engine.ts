// @ts-nocheck
/* eslint-disable */
/**
 * Pricing engine — ported verbatim from the legacy astrasolar-app (index.html).
 * Contains the solar/battery product tables, extras catalogues and the pure
 * lookup + commission functions that drive the System Price Calculator.
 *
 * This is intentionally untyped (ts-nocheck) so the data tables and ES5-style
 * logic match the source of truth 1:1. Do not hand-edit pricing here — update
 * it from the canonical sheet the same way the legacy app did.
 */

// Solar pricing (RRP / commission / sizes) is sourced live from the
// product catalogue via GET /products/solar — see use-price-calc.ts.
// The legacy static SOLAR_PRODUCTS table was removed to keep one source
// of truth. Battery pricing + commission logic remain below.

// ══════════════════════════════════════════════════════════════
// BATTERY PRODUCTS — from Battery Price and Profit Sheet
// Two categories: 'solar_battery' (bundled with solar) and 'battery_only'
// Each entry: { phase, inverter, battery, profit, rrp }
// profit = Company Profit (Astra & DCNT). Visible to CEO/Finance only.
// Updated with commission, STC rebate data, and dual RRP (before/after 21 March 2026 federal rebate change)
// grossPrice = Sold Price before STC deduction. rrpBefore/rrpAfter = what customer pays after STC.
// commission = consultant commission when sold at RRP.
// ══════════════════════════════════════════════════════════════
/** STC rebate cutoff date — federal rebate changed on 21/03/2026 */
var BATT_STC_CUTOFF = '2026-03-21';
var BATT_STC_CUTOFF_2 = '2026-03-30';

// ── Discontinued Products (Build AW → AX: dynamic from Firebase) ──
// Base hardcoded discontinued list (always blocked). Firebase productCatalogue can add more.
var DISCONTINUED_INVERTERS = [
  'GW5K-EHB-AU-G11',
  'GW8.6K-EHB-AU-G11',
  'GW9.99K-EHB-AU-G11'
];
var DISCONTINUED_BATTERIES = [
  'LX F19.2-H-20'
];
// Dynamic catalogue loaded from Firebase (populated by pmInit)
var PM_CATALOGUE = { inverters: {}, batteries: {}, solar: {} };
// Check discontinued — checks hardcoded list AND Firebase catalogue
function _isDiscontinuedInverter(inv, saleDate) {
  if (DISCONTINUED_INVERTERS.indexOf(inv) !== -1) return true;
  return _pmIsDiscontinued('inverters', inv, saleDate);
}
function _isDiscontinuedBattery(batt, saleDate) {
  if (DISCONTINUED_BATTERIES.indexOf(batt) !== -1) return true;
  return _pmIsDiscontinued('batteries', batt, saleDate);
}
function _pmIsDiscontinued(type, model, saleDate) {
  var cat = PM_CATALOGUE[type] || {};
  for (var k in cat) {
    if (cat[k].model === model && cat[k].status === 'discontinued') {
      if (!saleDate) return true; // no date context = treat as today
      var d = cat[k].discontinuedDate || cat[k].effectiveDate;
      if (d && saleDate >= d) return true;
    }
  }
  return false;
}
// Check if a product was added via catalogue (custom product)
function _pmIsCustomProduct(type, model) {
  var cat = PM_CATALOGUE[type] || {};
  for (var k in cat) {
    if (cat[k].model === model && cat[k].action === 'add') return true;
  }
  return false;
}
// Get custom products that are active for a given date
function _pmGetActiveCustomProducts(type, saleDate) {
  var result = [];
  var cat = PM_CATALOGUE[type] || {};
  var today = saleDate || new Date().toISOString().slice(0, 10);
  for (var k in cat) {
    var p = cat[k];
    if (p.action !== 'add') continue;
    if (p.effectiveDate && today < p.effectiveDate) continue; // not yet active
    if (p.discontinuedDate && today >= p.discontinuedDate) continue; // already discontinued
    result.push(p);
  }
  return result;
}

var BATTERY_PRODUCTS = {
  solar_battery: [
    // ── 1-Phase: Goodwe EHA (Hybrid) ──
    {phase:1, inverter:'GW5K-EHA-G20',      battery:'GW8.3-BAT-D-G20 x2 (16.6kWh)', profit:1950, commission:500, grossPrice:11176.02, stcBefore:4891.00, stcAfter:3759.50, rrpBefore:6285.02,  rrpAfter:7416.52,  rrpAfter30Mar:7416.52, module_S: 1, module_M: 1},
    {phase:1, inverter:'GW5K-EHA-G20',      battery:'GW8.3-BAT-D-G20 x3 (24.9kWh)', profit:2150, commission:600, grossPrice:13836.02, stcBefore:7336.50, stcAfter:4927.50, rrpBefore:6499.52,  rrpAfter:8908.52, rrpAfter30Mar:8908.52, module_S: 2, module_M: 1},
    {phase:1, inverter:'GW5K-EHA-G20',      battery:'GW8.3-BAT-D-G20 x4 (33.2kWh)', profit:2450, commission:700, grossPrice:16846.02, stcBefore:9782.00, stcAfter:5694.00, rrpBefore:7064.02,  rrpAfter:11152.02, rrpAfter30Mar:11152.02, module_S: 3, module_M: 1},
    {phase:1, inverter:'GW6K-EHA-G20',      battery:'GW8.3-BAT-D-G20 x2 (16.6kWh)', profit:1950, commission:500, grossPrice:11137.81, stcBefore:4891.00, stcAfter:3759.50, rrpBefore:6246.81,  rrpAfter:7378.31,  rrpAfter30Mar:7378.31, module_S: 1, module_M: 1},
    {phase:1, inverter:'GW6K-EHA-G20',      battery:'GW8.3-BAT-D-G20 x3 (24.9kWh)', profit:2150, commission:600, grossPrice:13797.81, stcBefore:7336.50, stcAfter:4927.50, rrpBefore:6461.31,  rrpAfter:8870.31, rrpAfter30Mar:8870.31, module_S: 2, module_M: 1},
    {phase:1, inverter:'GW6K-EHA-G20',      battery:'GW8.3-BAT-D-G20 x4 (33.2kWh)', profit:2350, commission:700, grossPrice:16557.81, stcBefore:9782.00, stcAfter:5694.00, rrpBefore:6775.81,  rrpAfter:10863.81, rrpAfter30Mar:10863.81, module_S: 3, module_M: 1},
    {phase:1, inverter:'GW8K-EHA-G20',      battery:'GW8.3-BAT-D-G20 x2 (16.6kWh)', profit:1950, commission:500, grossPrice:11645.24, stcBefore:4891.00, stcAfter:3759.50, rrpBefore:6754.24,  rrpAfter:7885.74,  rrpAfter30Mar:7885.74, module_S: 1, module_M: 1},
    {phase:1, inverter:'GW8K-EHA-G20',      battery:'GW8.3-BAT-D-G20 x3 (24.9kWh)', profit:2150, commission:600, grossPrice:14305.24, stcBefore:7336.50, stcAfter:4927.50, rrpBefore:6968.74,  rrpAfter:9377.74, rrpAfter30Mar:9377.74, module_S: 2, module_M: 1},
    {phase:1, inverter:'GW8K-EHA-G20',      battery:'GW8.3-BAT-D-G20 x4 (33.2kWh)', profit:2450, commission:700, grossPrice:17315.24, stcBefore:9782.00, stcAfter:5694.00, rrpBefore:7533.24,  rrpAfter:11621.24, rrpAfter30Mar:11621.24, module_S: 3, module_M: 1},
    {phase:1, inverter:'GW8K-EHA-G20',      battery:'GW8.3-BAT-D-G20 x5 (41.5kWh)', profit:1500, commission:800, grossPrice:20575.24, stcBefore:12227.50,stcAfter:5986.00, rrpBefore:8347.74,  rrpAfter:14589.24, rrpAfter30Mar:14589.24, module_S: 4, module_M: 1},
    {phase:1, inverter:'GW8K-EHA-G20',      battery:'GW8.3-BAT-D-G20 x6 (49.8kWh)', profit:3050, commission:900, grossPrice:23835.24, stcBefore:14673.00,stcAfter:6278.00, rrpBefore:9162.24, rrpAfter:17557.24, rrpAfter30Mar:17557.24, module_S: 5, module_M: 1},
    {phase:1, inverter:'GW9.999KEHA-G20',   battery:'GW8.3-BAT-D-G20 x2 (16.6kWh)', profit:1950, commission:500, grossPrice:11823.46, stcBefore:4891.00, stcAfter:3759.50, rrpBefore:6932.46,  rrpAfter:8063.96,  rrpAfter30Mar:8063.96, module_S: 1, module_M: 1},
    {phase:1, inverter:'GW9.999KEHA-G20',   battery:'GW8.3-BAT-D-G20 x3 (24.9kWh)', profit:2150, commission:600, grossPrice:14483.46, stcBefore:7336.50, stcAfter:4927.50, rrpBefore:7146.96,  rrpAfter:9555.96, rrpAfter30Mar:9555.96, module_S: 2, module_M: 1},
    {phase:1, inverter:'GW9.999KEHA-G20',   battery:'GW8.3-BAT-D-G20 x4 (33.2kWh)', profit:2450, commission:700, grossPrice:17493.46, stcBefore:9782.00, stcAfter:5694.00, rrpBefore:7711.46,  rrpAfter:11799.46, rrpAfter30Mar:11799.46, module_S: 3, module_M: 1},
    {phase:1, inverter:'GW9.999KEHA-G20',   battery:'GW8.3-BAT-D-G20 x5 (41.5kWh)', profit:1500, commission:800, grossPrice:20753.46, stcBefore:12227.50,stcAfter:5986.00, rrpBefore:8525.96,  rrpAfter:14767.46, rrpAfter30Mar:14767.46, module_S: 4, module_M: 1},
    {phase:1, inverter:'GW9.999KEHA-G20',   battery:'GW8.3-BAT-D-G20 x6 (49.8kWh)', profit:3050, commission:900, grossPrice:24013.46, stcBefore:14673.00,stcAfter:6278.00, rrpBefore:9340.46, rrpAfter:17735.46, rrpAfter30Mar:17735.46, module_S: 5, module_M: 1},
    // ── 3-Phase: Goodwe ETA ──
    {phase:3, inverter:'GW5K-ETA-G20',      battery:'GW8.3-BAT-D-G20 x2 (16.6kWh)', module_S: 1, module_M: 1, profit:1950, commission:500, grossPrice:12115.00, stcBefore:4891.00, stcAfter:3759.50, rrpBefore:7224.00,  rrpAfter:8355.50,  rrpAfter30Mar:8355.50},
    {phase:3, inverter:'GW5K-ETA-G20',      battery:'GW8.3-BAT-D-G20 x3 (24.9kWh)', module_S: 2, module_M: 1, profit:2150, commission:600, grossPrice:14275.00, stcBefore:7336.50, stcAfter:4927.50, rrpBefore:6938.50,  rrpAfter:9347.50, rrpAfter30Mar:9347.50},
    {phase:3, inverter:'GW5K-ETA-G20',      battery:'GW8.3-BAT-D-G20 x4 (33.2kWh)', module_S: 3, module_M: 1, profit:2450, commission:700, grossPrice:18535.00, stcBefore:9782.00, stcAfter:5694.00, rrpBefore:8753.00,  rrpAfter:12841.00, rrpAfter30Mar:12841.00},
    {phase:3, inverter:'GW10K-ETA-G20',     battery:'GW8.3-BAT-D-G20 x2 (16.6kWh)', module_S: 1, module_M: 1, profit:1950, commission:500, grossPrice:12038.63, stcBefore:4891.00, stcAfter:3759.50, rrpBefore:7147.63,  rrpAfter:8279.13,  rrpAfter30Mar:8279.13},
    {phase:3, inverter:'GW10K-ETA-G20',     battery:'GW8.3-BAT-D-G20 x3 (24.9kWh)', module_S: 2, module_M: 1, profit:2150, commission:600, grossPrice:15198.63, stcBefore:7336.50, stcAfter:4927.50, rrpBefore:7862.13,  rrpAfter:10271.13, rrpAfter30Mar:10271.13},
    {phase:3, inverter:'GW10K-ETA-G20',     battery:'GW8.3-BAT-D-G20 x4 (33.2kWh)', module_S: 3, module_M: 1, profit:2450, commission:700, grossPrice:17458.63, stcBefore:9782.00, stcAfter:5694.00, rrpBefore:7676.63,  rrpAfter:11764.63, rrpAfter30Mar:11764.63},
    {phase:3, inverter:'GW10K-ETA-G20',     battery:'GW8.3-BAT-D-G20 x5 (41.5kWh)', module_S: 4, module_M: 1, profit:2750, commission:800, grossPrice:21718.63, stcBefore:12227.50,stcAfter:5986.00, rrpBefore:9491.13, rrpAfter:15732.63, rrpAfter30Mar:15732.63},
    {phase:3, inverter:'GW10K-ETA-G20',     battery:'GW8.3-BAT-D-G20 x6 (49.8kWh)', module_S: 5, module_M: 1, profit:3050, commission:900, grossPrice:24978.63, stcBefore:14673.00,stcAfter:6278.00, rrpBefore:10305.63, rrpAfter:18700.63, rrpAfter30Mar:18700.63},
    {phase:3, inverter:'GW15K-ETA-G20',     battery:'GW8.3-BAT-D-G20 x2 (16.6kWh)', module_S: 1, module_M: 1, profit:1950, commission:500, grossPrice:12156.60, stcBefore:4891.00, stcAfter:3759.50, rrpBefore:7265.60,  rrpAfter:8397.10,  rrpAfter30Mar:8397.10},
    {phase:3, inverter:'GW15K-ETA-G20',     battery:'GW8.3-BAT-D-G20 x3 (24.9kWh)', module_S: 2, module_M: 1, profit:2150, commission:600, grossPrice:15316.60, stcBefore:7336.50, stcAfter:4927.50, rrpBefore:7980.10,  rrpAfter:10389.10, rrpAfter30Mar:10389.10},
    {phase:3, inverter:'GW15K-ETA-G20',     battery:'GW8.3-BAT-D-G20 x4 (33.2kWh)', module_S: 3, module_M: 1, profit:2450, commission:700, grossPrice:17576.60, stcBefore:9782.00, stcAfter:5694.00, rrpBefore:7794.60,  rrpAfter:11882.60, rrpAfter30Mar:11882.60},
    {phase:3, inverter:'GW15K-ETA-G20',     battery:'GW8.3-BAT-D-G20 x5 (41.5kWh)', module_S: 4, module_M: 1, profit:2750, commission:800, grossPrice:21836.60, stcBefore:12227.50,stcAfter:5986.00, rrpBefore:9609.10, rrpAfter:15850.60, rrpAfter30Mar:15850.60},
    {phase:3, inverter:'GW15K-ETA-G20',     battery:'GW8.3-BAT-D-G20 x6 (49.8kWh)', module_S: 5, module_M: 1, profit:3050, commission:900, grossPrice:25096.60, stcBefore:14673.00,stcAfter:6278.00, rrpBefore:10423.60, rrpAfter:18818.60, rrpAfter30Mar:18818.60},
    // ── 1-Phase: Luxpower (EHB inverter + Luxpower battery) ──
    {phase:1, inverter:'GW5K-EHB-AU-G11',   battery:'LX F19.2-H-20', module_S: 5, module_M: 1,               profit:1629, commission:600, grossPrice:13228.75, stcBefore:5876.50, stcAfter:4234.00, rrpBefore:7352.25,  rrpAfter:8994.75,  rrpAfter30Mar:8303.75},
    {phase:1, inverter:'GW8.6K-EHB-AU-G11', battery:'LX F19.2-H-20', module_S: 5, module_M: 1,               profit:1629, commission:600, grossPrice:13558.75, stcBefore:5876.50, stcAfter:4234.00, rrpBefore:7682.25,  rrpAfter:9324.75,  rrpAfter30Mar:8324.75},
    {phase:1, inverter:'GW9.99K-EHB-AU-G11',battery:'LX F19.2-H-20', module_S: 5, module_M: 1,               profit:1629, commission:600, grossPrice:13668.75, stcBefore:5876.50, stcAfter:4234.00, rrpBefore:7792.25,  rrpAfter:9434.75,  rrpAfter30Mar:8434.75},
    // ── Luxpower LX F25.6-H-20 (25.6kWh) — kWh-based commission ──
    {phase:1, inverter:'GW5K-EHB-AU-G11',   battery:'LX F25.6-H-20', module_S: 7, module_M: 1,                profit:1150, commission:600, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0, rrpAfter30Mar:0},
    {phase:1, inverter:'GW8.6K-EHB-AU-G11', battery:'LX F25.6-H-20', module_S: 7, module_M: 1,               profit:1150, commission:600, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0, rrpAfter30Mar:0},
    {phase:1, inverter:'GW9.99K-EHB-AU-G11',battery:'LX F25.6-H-20', module_S: 7, module_M: 1,               profit:1150, commission:600, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0, rrpAfter30Mar:0},
    {phase:1, inverter:'GW9.999KEHA-G20',   battery:'LX F25.6-H-20', module_S: 7, module_M: 1,               profit:1150, commission:600, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0, rrpAfter30Mar:0},
    {phase:1, inverter:'GW8K-EHA-G20',      battery:'LX F25.6-H-20', module_S: 7, module_M: 1,               profit:1150, commission:600, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0, rrpAfter30Mar:0},
    {phase:3, inverter:'GW10K-ETA-G20',     battery:'LX F25.6-H-20', module_S: 7, module_M: 1,               profit:1150, commission:600, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0, rrpAfter30Mar:0},
    {phase:3, inverter:'GW15K-ETA-G20',     battery:'LX F25.6-H-20', module_S: 7, module_M: 1,               profit:1150, commission:600, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0, rrpAfter30Mar:0},
    // ── Luxpower LX F28.8-H-20 (28.8kWh) — older model, kWh-based commission ──
    {phase:1, inverter:'GW5K-EHB-AU-G11',   battery:'LX F28.8-H-20', module_S: 8, module_M: 1,               profit:1200, commission:600, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0, rrpAfter30Mar:0},
    {phase:1, inverter:'GW8.6K-EHB-AU-G11', battery:'LX F28.8-H-20', module_S: 8, module_M: 1,               profit:1200, commission:600, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0, rrpAfter30Mar:0},
    {phase:1, inverter:'GW9.99K-EHB-AU-G11',battery:'LX F28.8-H-20', module_S: 8, module_M: 1,               profit:1200, commission:600, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0, rrpAfter30Mar:0},
    {phase:1, inverter:'GW9.999KEHA-G20',   battery:'LX F28.8-H-20', module_S: 8, module_M: 1,               profit:1200, commission:600, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0, rrpAfter30Mar:0},
    {phase:1, inverter:'GW8K-EHA-G20',      battery:'LX F28.8-H-20', module_S: 8, module_M: 1,               profit:1200, commission:600, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0, rrpAfter30Mar:0},
    {phase:3, inverter:'GW10K-ETA-G20',     battery:'LX F28.8-H-20', module_S: 8, module_M: 1,               profit:1200, commission:600, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0, rrpAfter30Mar:0},
    {phase:3, inverter:'GW15K-ETA-G20',     battery:'LX F28.8-H-20', module_S: 8, module_M: 1,               profit:1200, commission:600, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0, rrpAfter30Mar:0},
    // ── KH10 inverter + CQ6-L7 battery (41.93kWh) — pricing from Finance 01/04/2026 ──
    {phase:1, inverter:'KH10',               battery:'CQ6-L7 (41.93kWh)', module_S: 6, module_M: 1,           profit:1950, commission:800, grossPrice:20888,    stcBefore:12848,   stcAfter:12848,   rrpBefore:8040,     rrpAfter:8040,     rrpAfter30Mar:8040},
    {phase:3, inverter:'KH10',               battery:'CQ6-L7 (41.93kWh)', module_S: 6, module_M: 1,           profit:1950, commission:800, grossPrice:20888,    stcBefore:12848,   stcAfter:12848,   rrpBefore:8040,     rrpAfter:8040,     rrpAfter30Mar:8040},
    // ── KH10 + CQ6-L6 (35.94kWh) — older model, kWh-based commission ──
    {phase:1, inverter:'KH10',               battery:'CQ6-L6 (35.94kWh)', module_S: 5, module_M: 1,           profit:1200, commission:700, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0, rrpAfter30Mar:0},
    {phase:3, inverter:'KH10',               battery:'CQ6-L6 (35.94kWh)', module_S: 5, module_M: 1,           profit:1200, commission:700, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0, rrpAfter30Mar:0},
    // ── KH10 + CQ6-L5 (29.95kWh) — older model, kWh-based commission ──
    {phase:1, inverter:'KH10',               battery:'CQ6-L5 (29.95kWh)', module_S: 4, module_M: 1,           profit:1150, commission:600, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0, rrpAfter30Mar:0},
    {phase:3, inverter:'KH10',               battery:'CQ6-L5 (29.95kWh)', module_S: 4, module_M: 1,           profit:1150, commission:600, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0, rrpAfter30Mar:0},
    // ── Build FP: Fox ESS — ACT pricing from Finance 13/05/2026 ──
    // Source: "FOX ESS 13 05 2026 ACT Only" sheet.
    // Single dated RRP/STC point — stcBefore/stcAfter are set to the same
    // value (same approach as the KH10+CQ6-L7 entry above) so the date
    // tiers in getBatteryRRP collapse to a single number. rrpAfter30Mar is
    // also set equal so future date-tier additions can fold in cleanly.
    //   • 1-phase: H1-5.0-E-G2, KH8, KH10 paired with EQ4800-L3..L6
    //   • 3-phase: H3-5.0-Smart, H3-10.0-Smart, H3-15.0-Smart paired with EQ4800-L3..L7
    // ── 1-Phase Fox ESS ──
    {phase:1, inverter:'H1-5.0-E-G2',         battery:'EQ4800-L3 (13.98 kWh)', module_S: 2, module_M: 1, profit:1950, commission:500, grossPrice:9086.90,  stcBefore:3467.50, stcAfter:3467.50, rrpBefore:5619.40,  rrpAfter:5619.40,  rrpAfter30Mar:5619.40},
    {phase:1, inverter:'H1-5.0-E-G2',         battery:'EQ4800-L4 (18.64 kWh)', module_S: 3, module_M: 1, profit:2150, commission:600, grossPrice:10679.40, stcBefore:4161.00, stcAfter:4161.00, rrpBefore:6518.40,  rrpAfter:6518.40,  rrpAfter30Mar:6518.40},
    {phase:1, inverter:'H1-5.0-E-G2',         battery:'EQ4800-L5 (23.30 kWh)', module_S: 4, module_M: 1, profit:2450, commission:700, grossPrice:12371.90, stcBefore:4854.50, stcAfter:4854.50, rrpBefore:7517.40,  rrpAfter:7517.40,  rrpAfter30Mar:7517.40},
    {phase:1, inverter:'KH8',                 battery:'EQ4800-L3 (13.98 kWh)', module_S: 2, module_M: 1, profit:1950, commission:500, grossPrice:9592.90,  stcBefore:3467.50, stcAfter:3467.50, rrpBefore:6125.40,  rrpAfter:6125.40,  rrpAfter30Mar:6125.40},
    {phase:1, inverter:'KH8',                 battery:'EQ4800-L4 (18.64 kWh)', module_S: 3, module_M: 1, profit:2150, commission:600, grossPrice:11185.40, stcBefore:4161.00, stcAfter:4161.00, rrpBefore:7024.40,  rrpAfter:7024.40,  rrpAfter30Mar:7024.40},
    {phase:1, inverter:'KH8',                 battery:'EQ4800-L5 (23.30 kWh)', module_S: 4, module_M: 1, profit:2450, commission:700, grossPrice:12877.90, stcBefore:4854.50, stcAfter:4854.50, rrpBefore:8023.40,  rrpAfter:8023.40,  rrpAfter30Mar:8023.40},
    {phase:1, inverter:'KH10',                battery:'EQ4800-L3 (13.98 kWh)', module_S: 2, module_M: 1, profit:1950, commission:500, grossPrice:9812.90,  stcBefore:3467.50, stcAfter:3467.50, rrpBefore:6345.40,  rrpAfter:6345.40,  rrpAfter30Mar:6345.40},
    {phase:1, inverter:'KH10',                battery:'EQ4800-L4 (18.64 kWh)', module_S: 3, module_M: 1, profit:2150, commission:600, grossPrice:11405.40, stcBefore:4161.00, stcAfter:4161.00, rrpBefore:7244.40,  rrpAfter:7244.40,  rrpAfter30Mar:7244.40},
    {phase:1, inverter:'KH10',                battery:'EQ4800-L5 (23.30 kWh)', module_S: 4, module_M: 1, profit:2450, commission:700, grossPrice:13097.90, stcBefore:4854.50, stcAfter:4854.50, rrpBefore:8243.40,  rrpAfter:8243.40,  rrpAfter30Mar:8243.40},
    {phase:1, inverter:'KH10',                battery:'EQ4800-L6 (27.96 kWh)', module_S: 5, module_M: 1, profit:2750, commission:800, grossPrice:15037.90, stcBefore:5548.00, stcAfter:5548.00, rrpBefore:9489.90,  rrpAfter:9489.90,  rrpAfter30Mar:9489.90},
    // ── 3-Phase Fox ESS ──
    {phase:3, inverter:'H3-5.0-Smart',         battery:'EQ4800-L3 (13.98 kWh)', module_S: 2, module_M: 1, profit:1950, commission:500, grossPrice:10092.90, stcBefore:3467.50, stcAfter:3467.50, rrpBefore:6625.40,  rrpAfter:6625.40,  rrpAfter30Mar:6625.40},
    {phase:3, inverter:'H3-5.0-Smart',         battery:'EQ4800-L4 (18.64 kWh)', module_S: 3, module_M: 1, profit:2150, commission:600, grossPrice:11685.40, stcBefore:4161.00, stcAfter:4161.00, rrpBefore:7524.40,  rrpAfter:7524.40,  rrpAfter30Mar:7524.40},
    {phase:3, inverter:'H3-5.0-Smart',         battery:'EQ4800-L5 (23.30 kWh)', module_S: 4, module_M: 1, profit:2450, commission:700, grossPrice:13377.90, stcBefore:4854.50, stcAfter:4854.50, rrpBefore:8523.40,  rrpAfter:8523.40,  rrpAfter30Mar:8523.40},
    {phase:3, inverter:'H3-10.0-Smart',        battery:'EQ4800-L3 (13.98 kWh)', module_S: 2, module_M: 1, profit:1950, commission:500, grossPrice:10642.90, stcBefore:3467.50, stcAfter:3467.50, rrpBefore:7175.40,  rrpAfter:7175.40,  rrpAfter30Mar:7175.40},
    {phase:3, inverter:'H3-10.0-Smart',        battery:'EQ4800-L4 (18.64 kWh)', module_S: 3, module_M: 1, profit:2150, commission:600, grossPrice:12235.40, stcBefore:4161.00, stcAfter:4161.00, rrpBefore:8074.40,  rrpAfter:8074.40,  rrpAfter30Mar:8074.40},
    {phase:3, inverter:'H3-10.0-Smart',        battery:'EQ4800-L5 (23.30 kWh)', module_S: 4, module_M: 1, profit:2450, commission:700, grossPrice:13927.90, stcBefore:4854.50, stcAfter:4854.50, rrpBefore:9073.40,  rrpAfter:9073.40,  rrpAfter30Mar:9073.40},
    {phase:3, inverter:'H3-10.0-Smart',        battery:'EQ4800-L6 (27.96 kWh)', module_S: 5, module_M: 1, profit:2750, commission:800, grossPrice:15867.90, stcBefore:5548.00, stcAfter:5548.00, rrpBefore:10319.90, rrpAfter:10319.90, rrpAfter30Mar:10319.90},
    {phase:3, inverter:'H3-10.0-Smart',        battery:'EQ4800-L7 (32.61 kWh)', module_S: 6, module_M: 1, profit:3050, commission:900, grossPrice:17642.90, stcBefore:5730.50, stcAfter:5730.50, rrpBefore:11912.40, rrpAfter:11912.40, rrpAfter30Mar:11912.40},
    {phase:3, inverter:'H3-15.0-Smart',        battery:'EQ4800-L3 (13.98 kWh)', module_S: 2, module_M: 1, profit:1950, commission:500, grossPrice:11082.90, stcBefore:3467.50, stcAfter:3467.50, rrpBefore:7615.40,  rrpAfter:7615.40,  rrpAfter30Mar:7615.40},
    {phase:3, inverter:'H3-15.0-Smart',        battery:'EQ4800-L4 (18.64 kWh)', module_S: 3, module_M: 1, profit:2150, commission:600, grossPrice:12675.40, stcBefore:4161.00, stcAfter:4161.00, rrpBefore:8514.40,  rrpAfter:8514.40,  rrpAfter30Mar:8514.40},
    {phase:3, inverter:'H3-15.0-Smart',        battery:'EQ4800-L5 (23.30 kWh)', module_S: 4, module_M: 1, profit:2450, commission:700, grossPrice:14367.90, stcBefore:4854.50, stcAfter:4854.50, rrpBefore:9513.40,  rrpAfter:9513.40,  rrpAfter30Mar:9513.40},
    {phase:3, inverter:'H3-15.0-Smart',        battery:'EQ4800-L6 (27.96 kWh)', module_S: 5, module_M: 1, profit:2750, commission:800, grossPrice:16307.90, stcBefore:5548.00, stcAfter:5548.00, rrpBefore:10759.90, rrpAfter:10759.90, rrpAfter30Mar:10759.90},
    {phase:3, inverter:'H3-15.0-Smart',        battery:'EQ4800-L7 (32.61 kWh)', module_S: 6, module_M: 1, profit:3050, commission:900, grossPrice:18082.90, stcBefore:5730.50, stcAfter:5730.50, rrpBefore:12352.40, rrpAfter:12352.40, rrpAfter30Mar:12352.40}
  ],
  battery_only: [
    // ── 1-Phase: Goodwe EHA (Hybrid) ──
    {phase:1, inverter:'GW5K-EHA-G20',      battery:'GW8.3-BAT-D-G20 x2 (16.6kWh)', module_S: 1, module_M: 1, profit:2750, commission:500, grossPrice:15292.02, stcBefore:4891.00, stcAfter:3759.50, rrpBefore:10401.02, rrpAfter:11532.52},
    {phase:1, inverter:'GW5K-EHA-G20',      battery:'GW8.3-BAT-D-G20 x3 (24.9kWh)', module_S: 2, module_M: 1, profit:3110, commission:600, grossPrice:18612.02, stcBefore:7336.50, stcAfter:4927.50, rrpBefore:11275.52, rrpAfter:13684.52},
    {phase:1, inverter:'GW5K-EHA-G20',      battery:'GW8.3-BAT-D-G20 x4 (33.2kWh)', module_S: 3, module_M: 1, profit:3470, commission:700, grossPrice:22182.02, stcBefore:9782.00, stcAfter:5694.00, rrpBefore:12400.02, rrpAfter:16488.02},
    {phase:1, inverter:'GW6K-EHA-G20',      battery:'GW8.3-BAT-D-G20 x2 (16.6kWh)', module_S: 1, module_M: 1, profit:2750, commission:500, grossPrice:15412.81, stcBefore:4891.00, stcAfter:3759.50, rrpBefore:10521.81, rrpAfter:11653.31},
    {phase:1, inverter:'GW6K-EHA-G20',      battery:'GW8.3-BAT-D-G20 x3 (24.9kWh)', module_S: 2, module_M: 1, profit:3110, commission:600, grossPrice:18732.81, stcBefore:7336.50, stcAfter:4927.50, rrpBefore:11396.31, rrpAfter:13805.31},
    {phase:1, inverter:'GW6K-EHA-G20',      battery:'GW8.3-BAT-D-G20 x4 (33.2kWh)', module_S: 3, module_M: 1, profit:3470, commission:700, grossPrice:22302.81, stcBefore:9782.00, stcAfter:5694.00, rrpBefore:12520.81, rrpAfter:16608.81},
    {phase:1, inverter:'GW8K-EHA-G20',      battery:'GW8.3-BAT-D-G20 x2 (16.6kWh)', module_S: 1, module_M: 1, profit:2750, commission:500, grossPrice:16070.24, stcBefore:4891.00, stcAfter:3759.50, rrpBefore:11179.24, rrpAfter:12310.74},
    {phase:1, inverter:'GW8K-EHA-G20',      battery:'GW8.3-BAT-D-G20 x3 (24.9kWh)', module_S: 2, module_M: 1, profit:3110, commission:600, grossPrice:19390.24, stcBefore:7336.50, stcAfter:4927.50, rrpBefore:12053.74, rrpAfter:14462.74},
    {phase:1, inverter:'GW8K-EHA-G20',      battery:'GW8.3-BAT-D-G20 x4 (33.2kWh)', module_S: 3, module_M: 1, profit:3470, commission:700, grossPrice:22960.24, stcBefore:9782.00, stcAfter:5694.00, rrpBefore:13178.24, rrpAfter:17266.24},
    {phase:1, inverter:'GW8K-EHA-G20',      battery:'GW8.3-BAT-D-G20 x5 (41.5kWh)', module_S: 4, module_M: 1, profit:3830, commission:800, grossPrice:26280.24, stcBefore:12227.50,stcAfter:5986.00, rrpBefore:14052.74, rrpAfter:20294.24},
    {phase:1, inverter:'GW8K-EHA-G20',      battery:'GW8.3-BAT-D-G20 x6 (49.8kWh)', module_S: 5, module_M: 1, profit:4910, commission:900, grossPrice:30320.24, stcBefore:14673.00,stcAfter:6278.00, rrpBefore:15647.24, rrpAfter:24042.24},
    {phase:1, inverter:'GW9.999KEHA-G20',   battery:'GW8.3-BAT-D-G20 x2 (16.6kWh)', module_S: 1, module_M: 1, profit:2750, commission:500, grossPrice:16248.46, stcBefore:4891.00, stcAfter:3759.50, rrpBefore:11357.46, rrpAfter:12488.96},
    {phase:1, inverter:'GW9.999KEHA-G20',   battery:'GW8.3-BAT-D-G20 x3 (24.9kWh)', module_S: 2, module_M: 1, profit:3110, commission:600, grossPrice:19568.46, stcBefore:7336.50, stcAfter:4927.50, rrpBefore:12231.96, rrpAfter:14640.96},
    {phase:1, inverter:'GW9.999KEHA-G20',   battery:'GW8.3-BAT-D-G20 x4 (33.2kWh)', module_S: 3, module_M: 1, profit:3470, commission:700, grossPrice:23138.46, stcBefore:9782.00, stcAfter:5694.00, rrpBefore:13356.46, rrpAfter:17444.46},
    {phase:1, inverter:'GW9.999KEHA-G20',   battery:'GW8.3-BAT-D-G20 x5 (41.5kWh)', module_S: 4, module_M: 1, profit:3830, commission:800, grossPrice:26458.46, stcBefore:12227.50,stcAfter:5986.00, rrpBefore:14230.96, rrpAfter:20472.46},
    {phase:1, inverter:'GW9.999KEHA-G20',   battery:'GW8.3-BAT-D-G20 x6 (49.8kWh)', module_S: 5, module_M: 1, profit:4910, commission:900, grossPrice:30498.46, stcBefore:14673.00,stcAfter:6278.00, rrpBefore:15825.46, rrpAfter:24220.46},
    // ── 3-Phase: Goodwe ETA ──
    {phase:3, inverter:'GW5K-ETA-G20',      battery:'GW8.3-BAT-D-G20 x2 (16.6kWh)', module_S: 1, module_M: 1, profit:2750, commission:500, grossPrice:16040.00, stcBefore:4891.00, stcAfter:3759.50, rrpBefore:11149.00, rrpAfter:12280.50},
    {phase:3, inverter:'GW5K-ETA-G20',      battery:'GW8.3-BAT-D-G20 x3 (24.9kWh)', module_S: 2, module_M: 1, profit:3110, commission:600, grossPrice:19360.00, stcBefore:7336.50, stcAfter:4927.50, rrpBefore:12023.50, rrpAfter:14432.50},
    {phase:3, inverter:'GW5K-ETA-G20',      battery:'GW8.3-BAT-D-G20 x4 (33.2kWh)', module_S: 3, module_M: 1, profit:3470, commission:700, grossPrice:22930.00, stcBefore:9782.00, stcAfter:5694.00, rrpBefore:13148.00, rrpAfter:17236.00},
    {phase:3, inverter:'GW10K-ETA-G20',     battery:'GW8.3-BAT-D-G20 x2 (16.6kWh)', module_S: 1, module_M: 1, profit:2750, commission:500, grossPrice:15963.63, stcBefore:4891.00, stcAfter:3759.50, rrpBefore:11072.63, rrpAfter:12204.13},
    {phase:3, inverter:'GW10K-ETA-G20',     battery:'GW8.3-BAT-D-G20 x3 (24.9kWh)', module_S: 2, module_M: 1, profit:3110, commission:600, grossPrice:19283.63, stcBefore:7336.50, stcAfter:4927.50, rrpBefore:11947.13, rrpAfter:14356.13},
    {phase:3, inverter:'GW10K-ETA-G20',     battery:'GW8.3-BAT-D-G20 x4 (33.2kWh)', module_S: 3, module_M: 1, profit:3470, commission:700, grossPrice:22853.63, stcBefore:9782.00, stcAfter:5694.00, rrpBefore:13071.63, rrpAfter:17159.63},
    {phase:3, inverter:'GW10K-ETA-G20',     battery:'GW8.3-BAT-D-G20 x5 (41.5kWh)', module_S: 4, module_M: 1, profit:3830, commission:800, grossPrice:24923.63, stcBefore:12227.50,stcAfter:5986.00, rrpBefore:12696.13, rrpAfter:18937.63},
    {phase:3, inverter:'GW10K-ETA-G20',     battery:'GW8.3-BAT-D-G20 x6 (49.8kWh)', module_S: 5, module_M: 1, profit:4910, commission:900, grossPrice:28963.63, stcBefore:14673.00,stcAfter:6278.00, rrpBefore:14290.63, rrpAfter:22685.63},
    {phase:3, inverter:'GW15K-ETA-G20',     battery:'GW8.3-BAT-D-G20 x2 (16.6kWh)', module_S: 1, module_M: 1, profit:2750, commission:500, grossPrice:16081.60, stcBefore:4891.00, stcAfter:3759.50, rrpBefore:11190.60, rrpAfter:12322.10},
    {phase:3, inverter:'GW15K-ETA-G20',     battery:'GW8.3-BAT-D-G20 x3 (24.9kWh)', module_S: 2, module_M: 1, profit:3110, commission:600, grossPrice:19401.60, stcBefore:7336.50, stcAfter:4927.50, rrpBefore:12065.10, rrpAfter:14474.10},
    {phase:3, inverter:'GW15K-ETA-G20',     battery:'GW8.3-BAT-D-G20 x4 (33.2kWh)', module_S: 3, module_M: 1, profit:3470, commission:700, grossPrice:22971.60, stcBefore:9782.00, stcAfter:5694.00, rrpBefore:13189.60, rrpAfter:17277.60},
    {phase:3, inverter:'GW15K-ETA-G20',     battery:'GW8.3-BAT-D-G20 x5 (41.5kWh)', module_S: 4, module_M: 1, profit:3830, commission:800, grossPrice:25041.60, stcBefore:12227.50,stcAfter:5986.00, rrpBefore:12814.10, rrpAfter:19055.60},
    {phase:3, inverter:'GW15K-ETA-G20',     battery:'GW8.3-BAT-D-G20 x6 (49.8kWh)', module_S: 5, module_M: 1, profit:4910, commission:900, grossPrice:29081.60, stcBefore:14673.00,stcAfter:6278.00, rrpBefore:14408.60, rrpAfter:22803.60},
    // ── 1-Phase: Luxpower (EHB inverter + Luxpower battery) ──
    {phase:1, inverter:'GW5K-EHB-AU-G11',   battery:'LX F19.2-H-20', module_S: 5, module_M: 1,                 profit:3110, commission:600, grossPrice:15013.75, stcBefore:5876.50, stcAfter:4234.00, rrpBefore:9137.25,  rrpAfter:10779.75},
    {phase:1, inverter:'GW8.6K-EHB-AU-G11', battery:'LX F19.2-H-20', module_S: 5, module_M: 1,                 profit:3110, commission:600, grossPrice:15343.75, stcBefore:5876.50, stcAfter:4234.00, rrpBefore:9467.25,  rrpAfter:11109.75},
    {phase:1, inverter:'GW9.99K-EHB-AU-G11',battery:'LX F19.2-H-20', module_S: 5, module_M: 1,                 profit:3110, commission:600, grossPrice:15453.75, stcBefore:5876.50, stcAfter:4234.00, rrpBefore:9577.25,  rrpAfter:11219.75},
    // ── Luxpower LX F25.6-H-20 (25.6kWh) battery_only — kWh-based commission ──
    {phase:1, inverter:'GW5K-EHB-AU-G11',   battery:'LX F25.6-H-20', module_S: 7, module_M: 1,                profit:3110, commission:600, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0},
    {phase:1, inverter:'GW8.6K-EHB-AU-G11', battery:'LX F25.6-H-20', module_S: 7, module_M: 1,                profit:3110, commission:600, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0},
    {phase:1, inverter:'GW9.99K-EHB-AU-G11',battery:'LX F25.6-H-20', module_S: 7, module_M: 1,                profit:3110, commission:600, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0},
    {phase:1, inverter:'GW9.999KEHA-G20',   battery:'LX F25.6-H-20', module_S: 7, module_M: 1,                profit:3110, commission:600, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0},
    {phase:1, inverter:'GW8K-EHA-G20',      battery:'LX F25.6-H-20', module_S: 7, module_M: 1,                profit:3110, commission:600, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0},
    {phase:3, inverter:'GW10K-ETA-G20',     battery:'LX F25.6-H-20', module_S: 7, module_M: 1,                profit:3110, commission:600, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0},
    {phase:3, inverter:'GW15K-ETA-G20',     battery:'LX F25.6-H-20', module_S: 7, module_M: 1,                profit:3110, commission:600, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0},
    // ── Luxpower LX F28.8-H-20 (28.8kWh) battery_only — older model, kWh-based commission ──
    {phase:1, inverter:'GW5K-EHB-AU-G11',   battery:'LX F28.8-H-20', module_S: 8, module_M: 1,                profit:3110, commission:600, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0},
    {phase:1, inverter:'GW8.6K-EHB-AU-G11', battery:'LX F28.8-H-20', module_S: 8, module_M: 1,                profit:3110, commission:600, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0},
    {phase:1, inverter:'GW9.99K-EHB-AU-G11',battery:'LX F28.8-H-20', module_S: 8, module_M: 1,                profit:3110, commission:600, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0},
    {phase:1, inverter:'GW9.999KEHA-G20',   battery:'LX F28.8-H-20', module_S: 8, module_M: 1,                profit:3110, commission:600, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0},
    {phase:1, inverter:'GW8K-EHA-G20',      battery:'LX F28.8-H-20', module_S: 8, module_M: 1,                profit:3110, commission:600, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0},
    {phase:3, inverter:'GW10K-ETA-G20',     battery:'LX F28.8-H-20', module_S: 8, module_M: 1,                profit:3110, commission:600, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0},
    {phase:3, inverter:'GW15K-ETA-G20',     battery:'LX F28.8-H-20', module_S: 8, module_M: 1,                profit:3110, commission:600, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0},
    // ── KH10 inverter + CQ6-L7 battery (41.93kWh) battery_only — pricing from Finance 01/04/2026 ──
    {phase:1, inverter:'KH10',               battery:'CQ6-L7 (41.93kWh)', module_S: 6, module_M: 1,            profit:3440, commission:800, grossPrice:25752.90, stcBefore:12848,   stcAfter:12848,   rrpBefore:12904.90, rrpAfter:12904.90},
    {phase:3, inverter:'KH10',               battery:'CQ6-L7 (41.93kWh)', module_S: 6, module_M: 1,            profit:3440, commission:800, grossPrice:25752.90, stcBefore:12848,   stcAfter:12848,   rrpBefore:12904.90, rrpAfter:12904.90},
    // ── KH10 + CQ6-L6 (35.94kWh) battery_only — older model, kWh-based commission ──
    {phase:1, inverter:'KH10',               battery:'CQ6-L6 (35.94kWh)', module_S: 5, module_M: 1,            profit:3470, commission:700, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0},
    {phase:3, inverter:'KH10',               battery:'CQ6-L6 (35.94kWh)', module_S: 5, module_M: 1,            profit:3470, commission:700, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0},
    // ── KH10 + CQ6-L5 (29.95kWh) battery_only — older model, kWh-based commission ──
    {phase:1, inverter:'KH10',               battery:'CQ6-L5 (29.95kWh)', module_S: 4, module_M: 1,            profit:3110, commission:600, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0},
    {phase:3, inverter:'KH10',               battery:'CQ6-L5 (29.95kWh)', module_S: 4, module_M: 1,            profit:3110, commission:600, grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0},
    // ── Fronius Symo GEN24 8.0 — pricing from Finance 01/04/2026 ──
    {phase:1, inverter:'Fronius Symo GEN24 8.0', battery:'Fronius Battery', module_S: 1, module_M: 1,           profit:2000, commission:500, grossPrice:12948,    stcBefore:3723,    stcAfter:3723,    rrpBefore:9225,     rrpAfter:9225},
    {phase:3, inverter:'Fronius Symo GEN24 8.0', battery:'Fronius Battery', module_S: 1, module_M: 1,           profit:2000, commission:500, grossPrice:12948,    stcBefore:3723,    stcAfter:3723,    rrpBefore:9225,     rrpAfter:9225},
    // ── Luxpower LX F22.4-H-20 (22.4kWh) — pricing from Finance 01/04/2026 ──
    {phase:3, inverter:'GW10K-ETA-G20',      battery:'LX F22.4-H-20', module_S: 6, module_M: 1,                profit:3440, commission:700, grossPrice:18375.33, stcBefore:6862,    stcAfter:6862,    rrpBefore:11513.33, rrpAfter:11513.33},
    {phase:3, inverter:'GW15K-ETA-G20',      battery:'LX F22.4-H-20', module_S: 6, module_M: 1,                profit:3440, commission:700, grossPrice:18375.33, stcBefore:6862,    stcAfter:6862,    rrpBefore:11513.33, rrpAfter:11513.33},
    {phase:1, inverter:'GW9.99K-EHB-AU-G11', battery:'LX F22.4-H-20', module_S: 6, module_M: 1,                profit:3440, commission:700, grossPrice:18375.33, stcBefore:6862,    stcAfter:6862,    rrpBefore:11513.33, rrpAfter:11513.33},
    // ── Build FP: Fox ESS — ACT pricing from Finance 13/05/2026 ──
    // Source: "FOX ESS 13 05 2026 ACT Only" sheet. Schema mirrors the
    // existing battery_only entries (no rrpAfter30Mar field — that one is
    // solar_battery-only). Single-dated STC/RRP collapsed: stcBefore=stcAfter,
    // rrpBefore=rrpAfter.
    // ── 1-Phase Fox ESS ──
    {phase:1, inverter:'H1-5.0-E-G2',         battery:'EQ4800-L3 (13.98 kWh)', module_S: 2, module_M: 1, profit:3110, commission:500, grossPrice:13012.90, stcBefore:3467.50, stcAfter:3467.50, rrpBefore:9545.40,  rrpAfter:9545.40},
    {phase:1, inverter:'H1-5.0-E-G2',         battery:'EQ4800-L4 (18.64 kWh)', module_S: 3, module_M: 1, profit:3470, commission:600, grossPrice:14765.40, stcBefore:4161.00, stcAfter:4161.00, rrpBefore:10604.40, rrpAfter:10604.40},
    {phase:1, inverter:'H1-5.0-E-G2',         battery:'EQ4800-L5 (23.30 kWh)', module_S: 4, module_M: 1, profit:3830, commission:700, grossPrice:16517.90, stcBefore:4854.50, stcAfter:4854.50, rrpBefore:11663.40, rrpAfter:11663.40},
    {phase:1, inverter:'KH8',                 battery:'EQ4800-L3 (13.98 kWh)', module_S: 2, module_M: 1, profit:3110, commission:500, grossPrice:13518.90, stcBefore:3467.50, stcAfter:3467.50, rrpBefore:10051.40, rrpAfter:10051.40},
    {phase:1, inverter:'KH8',                 battery:'EQ4800-L4 (18.64 kWh)', module_S: 3, module_M: 1, profit:3470, commission:600, grossPrice:15271.40, stcBefore:4161.00, stcAfter:4161.00, rrpBefore:11110.40, rrpAfter:11110.40},
    {phase:1, inverter:'KH8',                 battery:'EQ4800-L5 (23.30 kWh)', module_S: 4, module_M: 1, profit:3830, commission:700, grossPrice:17023.90, stcBefore:4854.50, stcAfter:4854.50, rrpBefore:12169.40, rrpAfter:12169.40},
    {phase:1, inverter:'KH10',                battery:'EQ4800-L3 (13.98 kWh)', module_S: 2, module_M: 1, profit:3110, commission:500, grossPrice:13738.90, stcBefore:3467.50, stcAfter:3467.50, rrpBefore:10271.40, rrpAfter:10271.40},
    {phase:1, inverter:'KH10',                battery:'EQ4800-L4 (18.64 kWh)', module_S: 3, module_M: 1, profit:3470, commission:600, grossPrice:15491.40, stcBefore:4161.00, stcAfter:4161.00, rrpBefore:11330.40, rrpAfter:11330.40},
    {phase:1, inverter:'KH10',                battery:'EQ4800-L5 (23.30 kWh)', module_S: 4, module_M: 1, profit:3830, commission:700, grossPrice:17243.90, stcBefore:4854.50, stcAfter:4854.50, rrpBefore:12389.40, rrpAfter:12389.40},
    {phase:1, inverter:'KH10',                battery:'EQ4800-L6 (27.96 kWh)', module_S: 5, module_M: 1, profit:4550, commission:800, grossPrice:19503.90, stcBefore:5548.00, stcAfter:5548.00, rrpBefore:13955.90, rrpAfter:13955.90},
    // ── 3-Phase Fox ESS ──
    {phase:3, inverter:'H3-5.0-Smart',         battery:'EQ4800-L3 (13.98 kWh)', module_S: 2, module_M: 1, profit:3470, commission:500, grossPrice:14378.90, stcBefore:3467.50, stcAfter:3467.50, rrpBefore:10911.40, rrpAfter:10911.40},
    {phase:3, inverter:'H3-5.0-Smart',         battery:'EQ4800-L4 (18.64 kWh)', module_S: 3, module_M: 1, profit:3830, commission:600, grossPrice:16131.40, stcBefore:4161.00, stcAfter:4161.00, rrpBefore:11970.40, rrpAfter:11970.40},
    {phase:3, inverter:'H3-5.0-Smart',         battery:'EQ4800-L5 (23.30 kWh)', module_S: 4, module_M: 1, profit:4190, commission:700, grossPrice:17883.90, stcBefore:4854.50, stcAfter:4854.50, rrpBefore:13029.40, rrpAfter:13029.40},
    {phase:3, inverter:'H3-10.0-Smart',        battery:'EQ4800-L3 (13.98 kWh)', module_S: 2, module_M: 1, profit:3470, commission:500, grossPrice:14928.90, stcBefore:3467.50, stcAfter:3467.50, rrpBefore:11461.40, rrpAfter:11461.40},
    {phase:3, inverter:'H3-10.0-Smart',        battery:'EQ4800-L4 (18.64 kWh)', module_S: 3, module_M: 1, profit:3830, commission:600, grossPrice:16681.40, stcBefore:4161.00, stcAfter:4161.00, rrpBefore:12520.40, rrpAfter:12520.40},
    {phase:3, inverter:'H3-10.0-Smart',        battery:'EQ4800-L5 (23.30 kWh)', module_S: 4, module_M: 1, profit:4190, commission:700, grossPrice:18433.90, stcBefore:4854.50, stcAfter:4854.50, rrpBefore:13579.40, rrpAfter:13579.40},
    {phase:3, inverter:'H3-10.0-Smart',        battery:'EQ4800-L6 (27.96 kWh)', module_S: 5, module_M: 1, profit:4550, commission:800, grossPrice:20333.90, stcBefore:5548.00, stcAfter:5548.00, rrpBefore:14785.90, rrpAfter:14785.90},
    {phase:3, inverter:'H3-10.0-Smart',        battery:'EQ4800-L7 (32.61 kWh)', module_S: 6, module_M: 1, profit:4910, commission:900, grossPrice:22068.90, stcBefore:5730.50, stcAfter:5730.50, rrpBefore:16338.40, rrpAfter:16338.40},
    {phase:3, inverter:'H3-15.0-Smart',        battery:'EQ4800-L3 (13.98 kWh)', module_S: 2, module_M: 1, profit:3470, commission:500, grossPrice:15368.90, stcBefore:3467.50, stcAfter:3467.50, rrpBefore:11901.40, rrpAfter:11901.40},
    {phase:3, inverter:'H3-15.0-Smart',        battery:'EQ4800-L4 (18.64 kWh)', module_S: 3, module_M: 1, profit:3830, commission:600, grossPrice:17121.40, stcBefore:4161.00, stcAfter:4161.00, rrpBefore:12960.40, rrpAfter:12960.40},
    {phase:3, inverter:'H3-15.0-Smart',        battery:'EQ4800-L5 (23.30 kWh)', module_S: 4, module_M: 1, profit:4190, commission:700, grossPrice:18873.90, stcBefore:4854.50, stcAfter:4854.50, rrpBefore:14019.40, rrpAfter:14019.40},
    {phase:3, inverter:'H3-15.0-Smart',        battery:'EQ4800-L6 (27.96 kWh)', module_S: 5, module_M: 1, profit:4550, commission:800, grossPrice:20773.90, stcBefore:5548.00, stcAfter:5548.00, rrpBefore:15225.90, rrpAfter:15225.90},
    {phase:3, inverter:'H3-15.0-Smart',        battery:'EQ4800-L7 (32.61 kWh)', module_S: 6, module_M: 1, profit:4910, commission:900, grossPrice:22508.90, stcBefore:5730.50, stcAfter:5730.50, rrpBefore:16778.40, rrpAfter:16778.40}
  ]
};

// ══════════════════════════════════════════════════════════════
//  TAS Battery Products — Pricing from Finance 06/05/2026
//  SolaX inverters + SolaX T-BAT batteries only
//  TAS ONLY; non-TAS states use BATTERY_PRODUCTS (unchanged)
//  Historical pre-06/05/2026 sold records keep their stored soldPrice
// ══════════════════════════════════════════════════════════════
var TAS_BATTERY_PRODUCTS = {
  solar_battery: [
    // ── 1-Phase: SOLAX-X1-HYBRID-5.0D ──
    {phase:1, inverter:'SOLAX-X1-HYBRID-5.0D', battery:'SOLAX-T-BAT-HS10.8', module_S: 2, module_M: 1, profit:1350, commission:500, grossPrice:8648.34, stc:2445.5, rrp:6202.84},
    {phase:1, inverter:'SOLAX-X1-HYBRID-5.0D', battery:'SOLAX-T-BAT-HS14.4', module_S: 3, module_M: 1, profit:1650, commission:500, grossPrice:9813.92, stc:3248.5, rrp:6565.42},
    {phase:1, inverter:'SOLAX-X1-HYBRID-5.0D', battery:'SOLAX-T-BAT-HS18.0', module_S: 4, module_M: 1, profit:1950, commission:600, grossPrice:11079.5, stc:3832.5, rrp:7247},
    {phase:1, inverter:'SOLAX-X1-HYBRID-5.0D', battery:'SOLAX-T-BAT-HS21.6', module_S: 5, module_M: 1, profit:2150, commission:700, grossPrice:11945.08, stc:4343.5, rrp:7601.58},
    {phase:1, inverter:'SOLAX-X1-HYBRID-5.0D', battery:'SOLAX-T-BAT-HS25.2', module_S: 6, module_M: 1, profit:2350, commission:800, grossPrice:12860.66, stc:4818, rrp:8042.66},
    // ── 1-Phase: SOLAX-X1-Hybrid-7.5D ──
    {phase:1, inverter:'SOLAX-X1-Hybrid-7.5D', battery:'SOLAX-T-BAT-HS10.8', module_S: 2, module_M: 1, profit:1350, commission:500, grossPrice:8581.74, stc:2445.5, rrp:6136.24},
    {phase:1, inverter:'SOLAX-X1-Hybrid-7.5D', battery:'SOLAX-T-BAT-HS14.4', module_S: 3, module_M: 1, profit:1650, commission:500, grossPrice:9597.32, stc:3248.5, rrp:6348.82},
    {phase:1, inverter:'SOLAX-X1-Hybrid-7.5D', battery:'SOLAX-T-BAT-HS18.0', module_S: 4, module_M: 1, profit:1950, commission:600, grossPrice:10862.9, stc:3832.5, rrp:7030.4},
    {phase:1, inverter:'SOLAX-X1-Hybrid-7.5D', battery:'SOLAX-T-BAT-HS21.6', module_S: 5, module_M: 1, profit:2150, commission:700, grossPrice:11728.48, stc:4343.5, rrp:7384.98},
    {phase:1, inverter:'SOLAX-X1-Hybrid-7.5D', battery:'SOLAX-T-BAT-HS25.2', module_S: 6, module_M: 1, profit:2350, commission:800, grossPrice:12644.06, stc:4818, rrp:7826.06},
    // ── 1-Phase: Solax X1-VAST-8K ──
    {phase:1, inverter:'Solax X1-VAST-8K', battery:'SOLAX-T-BAT-HS10.8', module_S: 2, module_M: 1, profit:1350, commission:500, grossPrice:9461.74, stc:2445.5, rrp:7016.24},
    {phase:1, inverter:'Solax X1-VAST-8K', battery:'SOLAX-T-BAT-HS14.4', module_S: 3, module_M: 1, profit:1650, commission:500, grossPrice:10477.32, stc:3248.5, rrp:7228.82},
    {phase:1, inverter:'Solax X1-VAST-8K', battery:'SOLAX-T-BAT-HS18.0', module_S: 4, module_M: 1, profit:1950, commission:600, grossPrice:11742.9, stc:3832.5, rrp:7910.4},
    {phase:1, inverter:'Solax X1-VAST-8K', battery:'SOLAX-T-BAT-HS21.6', module_S: 5, module_M: 1, profit:2150, commission:700, grossPrice:12608.48, stc:4343.5, rrp:8264.98},
    {phase:1, inverter:'Solax X1-VAST-8K', battery:'SOLAX-T-BAT-HS25.2', module_S: 6, module_M: 1, profit:2350, commission:800, grossPrice:13524.06, stc:4818, rrp:8706.06},
    // ── 1-Phase: Solax X1-VAST-10K ──
    {phase:1, inverter:'Solax X1-VAST-10K', battery:'SOLAX-T-BAT-HS10.8', module_S: 2, module_M: 1, profit:1350, commission:500, grossPrice:9736.74, stc:2445.5, rrp:7291.24},
    {phase:1, inverter:'Solax X1-VAST-10K', battery:'SOLAX-T-BAT-HS14.4', module_S: 3, module_M: 1, profit:1650, commission:500, grossPrice:10752.32, stc:3248.5, rrp:7503.82},
    {phase:1, inverter:'Solax X1-VAST-10K', battery:'SOLAX-T-BAT-HS18.0', module_S: 4, module_M: 1, profit:1950, commission:600, grossPrice:12017.9, stc:3832.5, rrp:8185.4},
    {phase:1, inverter:'Solax X1-VAST-10K', battery:'SOLAX-T-BAT-HS21.6', module_S: 5, module_M: 1, profit:2150, commission:700, grossPrice:12883.48, stc:4343.5, rrp:8539.98},
    {phase:1, inverter:'Solax X1-VAST-10K', battery:'SOLAX-T-BAT-HS25.2', module_S: 6, module_M: 1, profit:2350, commission:800, grossPrice:13799.06, stc:4818, rrp:8981.06},
    // ── 3-Phase: SOLAX-X3-HYBRID-5.0D ──
    {phase:3, inverter:'SOLAX-X3-HYBRID-5.0D', battery:'SOLAX-T-BAT-HS10.8', module_S: 2, module_M: 1, profit:1350, commission:500, grossPrice:9731.74, stc:2445.5, rrp:7286.24},
    {phase:3, inverter:'SOLAX-X3-HYBRID-5.0D', battery:'SOLAX-T-BAT-HS14.4', module_S: 3, module_M: 1, profit:1650, commission:500, grossPrice:10747.32, stc:3248.5, rrp:7498.82},
    {phase:3, inverter:'SOLAX-X3-HYBRID-5.0D', battery:'SOLAX-T-BAT-HS18.0', module_S: 4, module_M: 1, profit:1950, commission:600, grossPrice:12012.9, stc:3832.5, rrp:8180.4},
    {phase:3, inverter:'SOLAX-X3-HYBRID-5.0D', battery:'SOLAX-T-BAT-HS21.6', module_S: 5, module_M: 1, profit:2150, commission:700, grossPrice:12878.48, stc:4343.5, rrp:8534.98},
    {phase:3, inverter:'SOLAX-X3-HYBRID-5.0D', battery:'SOLAX-T-BAT-HS25.2', module_S: 6, module_M: 1, profit:2350, commission:800, grossPrice:13794.06, stc:4818, rrp:8976.06},
    // ── 3-Phase: SOLAX-X3-HYBRID-8.0D 3 ──
    {phase:3, inverter:'SOLAX-X3-HYBRID-8.0D 3', battery:'SOLAX-T-BAT-HS10.8', module_S: 2, module_M: 1, profit:1350, commission:500, grossPrice:9741.74, stc:2445.5, rrp:7296.24},
    {phase:3, inverter:'SOLAX-X3-HYBRID-8.0D 3', battery:'SOLAX-T-BAT-HS14.4', module_S: 3, module_M: 1, profit:1650, commission:500, grossPrice:10757.32, stc:3248.5, rrp:7508.82},
    {phase:3, inverter:'SOLAX-X3-HYBRID-8.0D 3', battery:'SOLAX-T-BAT-HS18.0', module_S: 4, module_M: 1, profit:1950, commission:600, grossPrice:12022.9, stc:3832.5, rrp:8190.4},
    {phase:3, inverter:'SOLAX-X3-HYBRID-8.0D 3', battery:'SOLAX-T-BAT-HS21.6', module_S: 5, module_M: 1, profit:2150, commission:700, grossPrice:12888.48, stc:4343.5, rrp:8544.98},
    {phase:3, inverter:'SOLAX-X3-HYBRID-8.0D 3', battery:'SOLAX-T-BAT-HS25.2', module_S: 6, module_M: 1, profit:2350, commission:800, grossPrice:13804.06, stc:4818, rrp:8986.06},
    // ── 3-Phase: SOLAX-X3-HYBRID-10.0D ──
    {phase:3, inverter:'SOLAX-X3-HYBRID-10.0D', battery:'SOLAX-T-BAT-HS10.8', module_S: 2, module_M: 1, profit:1350, commission:500, grossPrice:10126.74, stc:2445.5, rrp:7681.24},
    {phase:3, inverter:'SOLAX-X3-HYBRID-10.0D', battery:'SOLAX-T-BAT-HS14.4', module_S: 3, module_M: 1, profit:1650, commission:500, grossPrice:11142.32, stc:3248.5, rrp:7893.82},
    {phase:3, inverter:'SOLAX-X3-HYBRID-10.0D', battery:'SOLAX-T-BAT-HS18.0', module_S: 4, module_M: 1, profit:1950, commission:600, grossPrice:12407.9, stc:3832.5, rrp:8575.4},
    {phase:3, inverter:'SOLAX-X3-HYBRID-10.0D', battery:'SOLAX-T-BAT-HS21.6', module_S: 5, module_M: 1, profit:2150, commission:700, grossPrice:13273.48, stc:4343.5, rrp:8929.98},
    {phase:3, inverter:'SOLAX-X3-HYBRID-10.0D', battery:'SOLAX-T-BAT-HS25.2', module_S: 6, module_M: 1, profit:2350, commission:800, grossPrice:14189.06, stc:4818, rrp:9371.06},
    {phase:3, inverter:'SOLAX-X3-HYBRID-10.0D', battery:'SOLAX-T-BAT-HS28.8', module_S: 7, module_M: 1, profit:2550, commission:900, grossPrice:15454.64, stc:5329, rrp:10125.64},
    // ── 3-Phase: SOLAX-X3-HYBRID-15.0D ──
    {phase:3, inverter:'SOLAX-X3-HYBRID-15.0D', battery:'SOLAX-T-BAT-HS18.0', module_S: 4, module_M: 1, profit:2150, commission:500, grossPrice:13796.54, stc:2445.5, rrp:11351.04},
    {phase:3, inverter:'SOLAX-X3-HYBRID-15.0D', battery:'SOLAX-T-BAT-HS21.6', module_S: 5, module_M: 1, profit:1950, commission:500, grossPrice:14412.12, stc:3248.5, rrp:11163.62},
    {phase:3, inverter:'SOLAX-X3-HYBRID-15.0D', battery:'SOLAX-T-BAT-HS25.2', module_S: 6, module_M: 1, profit:2350, commission:600, grossPrice:15777.7, stc:3832.5, rrp:11945.2},
    {phase:3, inverter:'SOLAX-X3-HYBRID-15.0D', battery:'SOLAX-T-BAT-HS28.8', module_S: 7, module_M: 1, profit:2550, commission:700, grossPrice:16643.28, stc:4343.5, rrp:12299.78},
    // ── 3-Phase: SOLAX-X3-ULT-20KP ──
    {phase:3, inverter:'SOLAX-X3-ULT-20KP', battery:'SOLAX-T-BAT-HS10.8', module_S: 2, module_M: 1, profit:1350, commission:500, grossPrice:11732.74, stc:2445.5, rrp:9287.24},
    {phase:3, inverter:'SOLAX-X3-ULT-20KP', battery:'SOLAX-T-BAT-HS14.4', module_S: 3, module_M: 1, profit:1650, commission:500, grossPrice:12848.32, stc:3248.5, rrp:9599.82},
    {phase:3, inverter:'SOLAX-X3-ULT-20KP', battery:'SOLAX-T-BAT-HS18.0', module_S: 4, module_M: 1, profit:1950, commission:600, grossPrice:14113.9, stc:3832.5, rrp:10281.4},
    {phase:3, inverter:'SOLAX-X3-ULT-20KP', battery:'SOLAX-T-BAT-HS21.6', module_S: 5, module_M: 1, profit:2150, commission:700, grossPrice:14629.48, stc:4343.5, rrp:10285.98},
    {phase:3, inverter:'SOLAX-X3-ULT-20KP', battery:'SOLAX-T-BAT-HS25.2', module_S: 6, module_M: 1, profit:2350, commission:800, grossPrice:15895.06, stc:4818, rrp:11077.06},
    {phase:3, inverter:'SOLAX-X3-ULT-20KP', battery:'SOLAX-T-BAT-HS28.8', module_S: 7, module_M: 1, profit:2550, commission:900, grossPrice:17060.64, stc:5329, rrp:11731.64}
  ],
  battery_only: [
    // ── 1-Phase: SOLAX-X1-HYBRID-5.0D ──
    {phase:1, inverter:'SOLAX-X1-HYBRID-5.0D', battery:'SOLAX-T-BAT-HS10.8', module_S: 2, module_M: 1, profit:3110, commission:500, grossPrice:11674.34, stc:2445.5, rrp:9228.84},
    {phase:1, inverter:'SOLAX-X1-HYBRID-5.0D', battery:'SOLAX-T-BAT-HS14.4', module_S: 3, module_M: 1, profit:3470, commission:500, grossPrice:12899.92, stc:3248.5, rrp:9651.42},
    {phase:1, inverter:'SOLAX-X1-HYBRID-5.0D', battery:'SOLAX-T-BAT-HS18.0', module_S: 4, module_M: 1, profit:3830, commission:600, grossPrice:14225.5, stc:3832.5, rrp:10393},
    {phase:1, inverter:'SOLAX-X1-HYBRID-5.0D', battery:'SOLAX-T-BAT-HS21.6', module_S: 5, module_M: 1, profit:4190, commission:700, grossPrice:15251.08, stc:4343.5, rrp:10907.58},
    {phase:1, inverter:'SOLAX-X1-HYBRID-5.0D', battery:'SOLAX-T-BAT-HS25.2', module_S: 6, module_M: 1, profit:4550, commission:800, grossPrice:16326.66, stc:4818, rrp:11508.66},
    // ── 1-Phase: SOLAX-X1-Hybrid-7.5D ──
    {phase:1, inverter:'SOLAX-X1-Hybrid-7.5D', battery:'SOLAX-T-BAT-HS10.8', module_S: 2, module_M: 1, profit:3110, commission:500, grossPrice:11916.74, stc:2445.5, rrp:9471.24},
    {phase:1, inverter:'SOLAX-X1-Hybrid-7.5D', battery:'SOLAX-T-BAT-HS14.4', module_S: 3, module_M: 1, profit:3470, commission:500, grossPrice:12992.32, stc:3248.5, rrp:9743.82},
    {phase:1, inverter:'SOLAX-X1-Hybrid-7.5D', battery:'SOLAX-T-BAT-HS18.0', module_S: 4, module_M: 1, profit:3830, commission:600, grossPrice:14317.9, stc:3832.5, rrp:10485.4},
    {phase:1, inverter:'SOLAX-X1-Hybrid-7.5D', battery:'SOLAX-T-BAT-HS21.6', module_S: 5, module_M: 1, profit:4190, commission:700, grossPrice:15343.48, stc:4343.5, rrp:10999.98},
    {phase:1, inverter:'SOLAX-X1-Hybrid-7.5D', battery:'SOLAX-T-BAT-HS25.2', module_S: 6, module_M: 1, profit:4550, commission:800, grossPrice:16419.06, stc:4818, rrp:11601.06},
    // ── 1-Phase: Solax X1-VAST-8K ──
    {phase:1, inverter:'Solax X1-VAST-8K', battery:'SOLAX-T-BAT-HS10.8', module_S: 2, module_M: 1, profit:3110, commission:500, grossPrice:12796.74, stc:2445.5, rrp:10351.24},
    {phase:1, inverter:'Solax X1-VAST-8K', battery:'SOLAX-T-BAT-HS14.4', module_S: 3, module_M: 1, profit:3470, commission:500, grossPrice:13872.32, stc:3248.5, rrp:10623.82},
    {phase:1, inverter:'Solax X1-VAST-8K', battery:'SOLAX-T-BAT-HS18.0', module_S: 4, module_M: 1, profit:3830, commission:600, grossPrice:15197.9, stc:3832.5, rrp:11365.4},
    {phase:1, inverter:'Solax X1-VAST-8K', battery:'SOLAX-T-BAT-HS21.6', module_S: 5, module_M: 1, profit:4190, commission:700, grossPrice:16223.48, stc:4343.5, rrp:11879.98},
    {phase:1, inverter:'Solax X1-VAST-8K', battery:'SOLAX-T-BAT-HS25.2', module_S: 6, module_M: 1, profit:4550, commission:800, grossPrice:17299.06, stc:4818, rrp:12481.06},
    // ── 1-Phase: Solax X1-VAST-10K ──
    {phase:1, inverter:'Solax X1-VAST-10K', battery:'SOLAX-T-BAT-HS10.8', module_S: 2, module_M: 1, profit:3110, commission:500, grossPrice:13071.74, stc:2445.5, rrp:10626.24},
    {phase:1, inverter:'Solax X1-VAST-10K', battery:'SOLAX-T-BAT-HS14.4', module_S: 3, module_M: 1, profit:3470, commission:500, grossPrice:14147.32, stc:3248.5, rrp:10898.82},
    {phase:1, inverter:'Solax X1-VAST-10K', battery:'SOLAX-T-BAT-HS18.0', module_S: 4, module_M: 1, profit:3830, commission:600, grossPrice:15472.9, stc:3832.5, rrp:11640.4},
    {phase:1, inverter:'Solax X1-VAST-10K', battery:'SOLAX-T-BAT-HS21.6', module_S: 5, module_M: 1, profit:4190, commission:700, grossPrice:16498.48, stc:4343.5, rrp:12154.98},
    {phase:1, inverter:'Solax X1-VAST-10K', battery:'SOLAX-T-BAT-HS25.2', module_S: 6, module_M: 1, profit:4550, commission:800, grossPrice:17574.06, stc:4818, rrp:12756.06},
    // ── 3-Phase: SOLAX-X3-HYBRID-5.0D ──
    {phase:3, inverter:'SOLAX-X3-HYBRID-5.0D', battery:'SOLAX-T-BAT-HS10.8', module_S: 2, module_M: 1, profit:2750, commission:500, grossPrice:12397.74, stc:2445.5, rrp:9952.24},
    {phase:3, inverter:'SOLAX-X3-HYBRID-5.0D', battery:'SOLAX-T-BAT-HS14.4', module_S: 3, module_M: 1, profit:3110, commission:500, grossPrice:13473.32, stc:3248.5, rrp:10224.82},
    {phase:3, inverter:'SOLAX-X3-HYBRID-5.0D', battery:'SOLAX-T-BAT-HS18.0', module_S: 4, module_M: 1, profit:3470, commission:600, grossPrice:14798.9, stc:3832.5, rrp:10966.4},
    {phase:3, inverter:'SOLAX-X3-HYBRID-5.0D', battery:'SOLAX-T-BAT-HS21.6', module_S: 5, module_M: 1, profit:3830, commission:700, grossPrice:15824.48, stc:4343.5, rrp:11480.98},
    {phase:3, inverter:'SOLAX-X3-HYBRID-5.0D', battery:'SOLAX-T-BAT-HS25.2', module_S: 6, module_M: 1, profit:4190, commission:800, grossPrice:16900.06, stc:4818, rrp:12082.06},
    // ── 3-Phase: SOLAX-X3-HYBRID-8.0D 3 ──
    {phase:3, inverter:'SOLAX-X3-HYBRID-8.0D 3', battery:'SOLAX-T-BAT-HS10.8', module_S: 2, module_M: 1, profit:2750, commission:500, grossPrice:12716.74, stc:2445.5, rrp:10271.24},
    {phase:3, inverter:'SOLAX-X3-HYBRID-8.0D 3', battery:'SOLAX-T-BAT-HS14.4', module_S: 3, module_M: 1, profit:3110, commission:500, grossPrice:13792.32, stc:3248.5, rrp:10543.82},
    {phase:3, inverter:'SOLAX-X3-HYBRID-8.0D 3', battery:'SOLAX-T-BAT-HS18.0', module_S: 4, module_M: 1, profit:3470, commission:600, grossPrice:15117.9, stc:3832.5, rrp:11285.4},
    {phase:3, inverter:'SOLAX-X3-HYBRID-8.0D 3', battery:'SOLAX-T-BAT-HS21.6', module_S: 5, module_M: 1, profit:3830, commission:700, grossPrice:16143.48, stc:4343.5, rrp:11799.98},
    {phase:3, inverter:'SOLAX-X3-HYBRID-8.0D 3', battery:'SOLAX-T-BAT-HS25.2', module_S: 6, module_M: 1, profit:4190, commission:800, grossPrice:17219.06, stc:4818, rrp:12401.06},
    // ── 3-Phase: SOLAX-X3-HYBRID-10.0D ──
    {phase:3, inverter:'SOLAX-X3-HYBRID-10.0D', battery:'SOLAX-T-BAT-HS10.8', module_S: 2, module_M: 1, profit:2750, commission:500, grossPrice:13101.74, stc:2445.5, rrp:10656.24},
    {phase:3, inverter:'SOLAX-X3-HYBRID-10.0D', battery:'SOLAX-T-BAT-HS14.4', module_S: 3, module_M: 1, profit:3110, commission:500, grossPrice:14177.32, stc:3248.5, rrp:10928.82},
    {phase:3, inverter:'SOLAX-X3-HYBRID-10.0D', battery:'SOLAX-T-BAT-HS18.0', module_S: 4, module_M: 1, profit:3470, commission:600, grossPrice:15502.9, stc:3832.5, rrp:11670.4},
    {phase:3, inverter:'SOLAX-X3-HYBRID-10.0D', battery:'SOLAX-T-BAT-HS21.6', module_S: 5, module_M: 1, profit:3830, commission:700, grossPrice:16528.48, stc:4343.5, rrp:12184.98},
    {phase:3, inverter:'SOLAX-X3-HYBRID-10.0D', battery:'SOLAX-T-BAT-HS25.2', module_S: 6, module_M: 1, profit:4190, commission:800, grossPrice:17604.06, stc:4818, rrp:12786.06},
    {phase:3, inverter:'SOLAX-X3-HYBRID-10.0D', battery:'SOLAX-T-BAT-HS28.8', module_S: 7, module_M: 1, profit:4550, commission:900, grossPrice:19029.64, stc:5329, rrp:13700.64},
    // ── 3-Phase: SOLAX-X3-HYBRID-15.0D ──
    {phase:3, inverter:'SOLAX-X3-HYBRID-15.0D', battery:'SOLAX-T-BAT-HS18.0', module_S: 4, module_M: 1, profit:3830, commission:500, grossPrice:17051.54, stc:2445.5, rrp:14606.04},
    {phase:3, inverter:'SOLAX-X3-HYBRID-15.0D', battery:'SOLAX-T-BAT-HS21.6', module_S: 5, module_M: 1, profit:4190, commission:500, grossPrice:18227.12, stc:3248.5, rrp:14978.62},
    {phase:3, inverter:'SOLAX-X3-HYBRID-15.0D', battery:'SOLAX-T-BAT-HS25.2', module_S: 6, module_M: 1, profit:4550, commission:600, grossPrice:19552.7, stc:3832.5, rrp:15720.2},
    {phase:3, inverter:'SOLAX-X3-HYBRID-15.0D', battery:'SOLAX-T-BAT-HS28.8', module_S: 7, module_M: 1, profit:4910, commission:700, grossPrice:20578.28, stc:4343.5, rrp:16234.78},
    // ── 3-Phase: SOLAX-X3-ULT-20KP ──
    {phase:3, inverter:'SOLAX-X3-ULT-20KP', battery:'SOLAX-T-BAT-HS10.8', module_S: 2, module_M: 1, profit:2750, commission:500, grossPrice:14707.74, stc:2445.5, rrp:12262.24},
    {phase:3, inverter:'SOLAX-X3-ULT-20KP', battery:'SOLAX-T-BAT-HS14.4', module_S: 3, module_M: 1, profit:3110, commission:500, grossPrice:15883.32, stc:3248.5, rrp:12634.82},
    {phase:3, inverter:'SOLAX-X3-ULT-20KP', battery:'SOLAX-T-BAT-HS18.0', module_S: 4, module_M: 1, profit:3470, commission:600, grossPrice:17208.9, stc:3832.5, rrp:13376.4},
    {phase:3, inverter:'SOLAX-X3-ULT-20KP', battery:'SOLAX-T-BAT-HS21.6', module_S: 5, module_M: 1, profit:3830, commission:700, grossPrice:17884.48, stc:4343.5, rrp:13540.98},
    {phase:3, inverter:'SOLAX-X3-ULT-20KP', battery:'SOLAX-T-BAT-HS25.2', module_S: 6, module_M: 1, profit:4190, commission:800, grossPrice:19310.06, stc:4818, rrp:14492.06},
    {phase:3, inverter:'SOLAX-X3-ULT-20KP', battery:'SOLAX-T-BAT-HS28.8', module_S: 7, module_M: 1, profit:4550, commission:900, grossPrice:21885.64, stc:5329, rrp:16556.64}
  ]
};

// ══════════════════════════════════════════════════════════════
//  Legacy Inverter Aliases — older models that consultants may
//  still need to select for earlier 2026 sales. Each old inverter
//  is cloned from its nearest current equivalent so every battery
//  combo, commission and profit carries across automatically.
// ══════════════════════════════════════════════════════════════
(function _addLegacyInverters() {
  var aliases = [
    // Goodwe ET-20 (older generation) → G20 equivalents
    {old: 'GW9900-ET-20',       phase: 1, maps: 'GW9.999KEHA-G20'},
    {old: 'GW8000-ET-20',       phase: 1, maps: 'GW8K-EHA-G20'},
    {old: 'GW6000-ET-20',       phase: 1, maps: 'GW6K-EHA-G20'},
    {old: 'GW15K-ET-20',        phase: 3, maps: 'GW15K-ETA-G20'},
    {old: 'GW10K-ET-20',        phase: 3, maps: 'GW10K-ETA-G20'},
    // Fox ESS
    {old: 'Fox ESS KH8',        phase: 1, maps: 'KH8'},
    {old: 'Fox ESS H1-5.0-E-G2',   phase: 1, maps: 'H1-5.0-E-G2'},
    {old: 'Fox ESS H3-15.0',    phase: 3, maps: 'GW15K-ETA-G20'},
    {old: 'Fox ESS H3-10.0',    phase: 3, maps: 'GW10K-ETA-G20'},
    {old: 'Fox ESS H3-12.0',    phase: 3, maps: 'GW15K-ETA-G20'},
    {old: 'Fox ESS H3-8.0',     phase: 3, maps: 'GW10K-ETA-G20'},
    {old: 'Fox ESS H3-5.0',     phase: 3, maps: 'GW5K-ETA-G20'},
    // {old: 'Fox ESS KH7',        phase: 1, maps: 'KH10'},
    {old: 'Fox ESS KH10',        phase: 1, maps: 'KH10'},
    {old: 'Fox ESS H1-3.7-E',   phase: 1, maps: 'GW5K-EHA-G20'},
    {old: 'Fox ESS H1-6.0-E',   phase: 1, maps: 'GW6K-EHA-G20'},
    // Sungrow
    {old: 'Sungrow SH10.0RT',   phase: 3, maps: 'GW10K-ETA-G20'},
    {old: 'Sungrow SH8.0RT',    phase: 3, maps: 'GW8K-EHA-G20'},
    {old: 'Sungrow SH6.0RT',    phase: 3, maps: 'GW5K-ETA-G20'},
    {old: 'Sungrow SH5.0RT',    phase: 3, maps: 'GW5K-ETA-G20'}
  ];

  [BATTERY_PRODUCTS].forEach(function(prodTable) {
    ['solar_battery', 'battery_only'].forEach(function(type) {
      var list = prodTable[type];
      if (!list) return;
      var existing = {};
      list.forEach(function(p) { existing[p.inverter + '||' + p.battery + '||' + p.phase] = true; });

      var toAdd = [];
      aliases.forEach(function(a) {
        for (var i = 0; i < list.length; i++) {
          var p = list[i];
          if (p.inverter !== a.maps) continue;
          // Only clone entries that match the legacy phase (or skip phase filter for KH10 which works on both)
          if (a.maps !== 'KH10' && p.phase !== a.phase) continue;
          var key = a.old + '||' + p.battery + '||' + p.phase;
          if (existing[key]) continue;
          var clone = {};
          for (var k in p) { if (p.hasOwnProperty(k)) clone[k] = p[k]; }
          clone.inverter = a.old;
          clone._legacy = true;
          toAdd.push(clone);
          existing[key] = true;
        }
      });
      for (var j = 0; j < toAdd.length; j++) list.push(toAdd[j]);
    });
  });
})();

/** Determine if a state string is TAS */
function isTasRegion(state) {
  if (!state) return false;
  var s = state.toLowerCase();
  return s === 'tas' || s.indexOf('tas ') === 0 || s.indexOf('tas-') === 0 || s === 'tasmania' || s === 'tas hobart' || s === 'tas laun';
}

/** Get the right battery product list for a region */
function getBatteryProductsForRegion(region) {
  return isTasRegion(region) ? TAS_BATTERY_PRODUCTS : BATTERY_PRODUCTS;
}

/** Get the correct RRP for a battery product based on sale date and region */
function getBatteryRRP(product, saleDate, region) {
  if (!product) return 0;
  // Products with rrpAfter30Mar use 3-tier or 2-tier date logic
  if (product.rrpAfter30Mar !== undefined) {
    if (!saleDate) return product.rrpAfter30Mar;
    // ACT products (have rrpBefore/rrpAfter): 3-tier
    if (product.rrpBefore !== undefined) {
      if (saleDate < BATT_STC_CUTOFF) return product.rrpBefore;
      if (saleDate < BATT_STC_CUTOFF_2) return product.rrpAfter;
      return product.rrpAfter30Mar;
    }
    // TAS products (have flat rrp): 2-tier
    if (saleDate < BATT_STC_CUTOFF_2) return product.rrp;
    return product.rrpAfter30Mar;
  }
  // TAS products without new pricing — flat rrp (battery_only)
  if (product.rrp !== undefined) return product.rrp;
  // ACT products without new pricing — date-based (battery_only)
  if (!saleDate) return product.rrpAfter;
  return saleDate < BATT_STC_CUTOFF ? product.rrpBefore : product.rrpAfter;
}

/** Get the correct STC for a battery product based on sale date and region */
function getBatterySTC(product, saleDate, region) {
  if (!product) return 0;
  // TAS products have flat stc
  if (product.stc !== undefined) return product.stc;
  // ACT/NSW products have date-based pricing
  if (!saleDate) return product.stcAfter;
  return saleDate < BATT_STC_CUTOFF ? product.stcBefore : product.stcAfter;
}

// ══════════════════════════════════════════════════════════════
//  Finance Options — surcharge multipliers and rules
//  surcharge = multiplier applied to the post-STC price (RRP) to get financed amount
//  estFee = one-time establishment fee, feePerWeek = ongoing weekly fee
// ══════════════════════════════════════════════════════════════
var FINANCE_OPTIONS = [
  {id:'shs',           label:'Sustainable Household Scheme',   rate:'3%',    term:10, surcharge:1,    cap:15000, states:['ACT'], companies:['DC SOLAR'], saleTypes:['Battery','Solar System + Battery','Solar + Battery + Hot water','Battery + Hot water'], notes:'Land value must be <$750k. Max 65% of total for combo sales.', feePerWeek:0, estFee:0},
  {id:'hesp',          label:'Home Energy Support Program',    rate:'0%',    term:10, surcharge:1,    cap:10000, states:['ACT'], companies:['DC SOLAR'], saleTypes:['Solar System','Solar System + Battery','Solar + Battery + Hot water','Solar + Hot water','Aircon'], notes:'$2,500 solar rebate. Land value <$750k.', feePerWeek:0, estFee:0},
  {id:'heuf',          label:'Brighte HEUF',                   rate:'6.99%', term:10, surcharge:1,    cap:0,     states:['ACT','TAS','NSW','VIC','SA'], companies:['ASTRA','DC SOLAR'], saleTypes:['Battery','Solar System + Battery','Solar + Battery + Hot water','Battery + Hot water','Hot water','Aircon'], notes:'Cannot be used for solar only.', feePerWeek:2.70, estFee:299},
  {id:'brighte_0_5yr', label:'Brighte 0% (5 Year)',            rate:'0%',    term:5,  surcharge:1.21, cap:0,     states:['ACT','TAS','NSW','VIC','SA'], companies:['ASTRA','DC SOLAR'], saleTypes:['all'], notes:'Cash price × 1.21', feePerWeek:2.30, estFee:75},
  {id:'brighte_0_3yr', label:'Brighte 0% (3 Year)',            rate:'0%',    term:3,  surcharge:1.12, cap:0,     states:['ACT','TAS','NSW','VIC','SA'], companies:['ASTRA','DC SOLAR'], saleTypes:['all'], notes:'Cash price × 1.12', feePerWeek:2.30, estFee:75},
  {id:'brighte_green', label:'Brighte Green Loan',             rate:'6.99%', term:10, surcharge:1.01, cap:0,     states:['ACT','TAS','NSW','VIC','SA'], companies:['ASTRA'], saleTypes:['all'], notes:'Astra only. Can be paid off anytime.', feePerWeek:0, estFee:0},
  {id:'rps',           label:'RPS Broker',                     rate:'6.29%', term:10, surcharge:1,    cap:0,     states:['ACT','TAS','NSW','VIC','SA'], companies:['ASTRA','DC SOLAR'], saleTypes:['all'], notes:'Variable rate via Community First Bank.', feePerWeek:0, estFee:0},
  {id:'cash',          label:'Cash',                           rate:'—',     term:0,  surcharge:1,    cap:0,     states:['ACT','TAS','NSW','VIC','SA'], companies:['ASTRA','DC SOLAR'], saleTypes:['all'], notes:'', feePerWeek:0, estFee:0}
];

/** Filter FINANCE_OPTIONS for a given state, company, and sale type */
function getAvailableFinanceOptions(state, company, saleType) {
  if (!state || !company || !saleType) return FINANCE_OPTIONS;  // show all if not specified
  return FINANCE_OPTIONS.filter(function(opt) {
    var stateOk = opt.states.indexOf(state) >= 0;
    var companyOk = opt.companies.indexOf(company) >= 0;
    var typeOk = opt.saleTypes[0] === 'all' || opt.saleTypes.indexOf(saleType) >= 0;
    return stateOk && companyOk && typeOk;
  });
}

/** Calculate finance summary for selected options */
function calcFinanceSummary(rrpAfterStc, selectedOptionIds) {
  var results = [];
  selectedOptionIds.forEach(function(id) {
    var opt = FINANCE_OPTIONS.find(function(o) { return o.id === id; });
    if (!opt) return;
    var financedAmount = rrpAfterStc * opt.surcharge;
    var total = financedAmount + opt.estFee;
    results.push({
      id: opt.id,
      label: opt.label,
      rate: opt.rate,
      term: opt.term,
      surcharge: opt.surcharge,
      cap: opt.cap,
      financedAmount: Math.round(financedAmount * 100) / 100,
      estFee: opt.estFee,
      feePerWeek: opt.feePerWeek,
      total: Math.round(total * 100) / 100,
      surchargeAmount: Math.round((financedAmount - rrpAfterStc) * 100) / 100,
      notes: opt.notes
    });
  });
  return results;
}

/** Normalize a battery type — maps legacy/variant types to catalogue keys */
function _normBattType(type) {
  if (!type) return 'solar_battery';
  var t = type.toLowerCase().trim();
  if (t === 'hybrid' || t === 'solar_battery' || t === 'solar+battery' || t === 'solarbattery') return 'solar_battery';
  if (t === 'battery_only' || t === 'batteryonly' || t === 'battery') return 'battery_only';
  return 'solar_battery'; // default
}

/** Normalize an inverter name for fuzzy matching */
function _normInverter(inv) {
  if (!inv) return '';
  return inv.replace(/\s*\(Hybrid\)/gi, '')  // strip "(Hybrid)" suffix
            .replace(/\s*fox$/gi, '')         // strip "fox" suffix (e.g. "kh10 fox")
            .replace(/\s+/g, '')              // collapse spaces
            .toUpperCase();
}

/** Normalize a battery model name for fuzzy matching */
function _normBattery(bat) {
  if (!bat) return '';
  return bat.replace(/\s*x\s*\d+.*$/i, '')                          // strip multiplier suffix (x2, x3 stacks, etc.)
            .replace(/\s*\d+\.?\d*\s*kwh?\s*(in\s*total)?$/i, '')   // strip trailing kWh notes
            .replace(/,/g, '.')                                       // comma → period (e.g. f19,2 → f19.2)
            .replace(/\s+/g, ' ')                                     // collapse multiple spaces
            .trim()
            .toUpperCase();
}

/** Look up a battery product by type, phase, inverter, and battery model — region-aware with fuzzy matching
 *  Matching order:
 *    Pass 1: Exact match (phase + inverter + battery)
 *    Pass 2: Fuzzy match (normalized phase + inverter + battery)
 *    Pass 3: Battery-only match (ignore inverter — battery price is inverter-independent)
 *  Each pass tries: primary region → fallback region, across both battery type keys.
 */
function getBatteryProduct(type, phase, inverter, battery, region) {
  var normType = _normBattType(type);
  var normInv = _normInverter(inverter);
  var normBatt = _normBattery(battery);

  var typesToTry = [normType, normType === 'solar_battery' ? 'battery_only' : 'solar_battery'];
  var products = getBatteryProductsForRegion(region);
  var fallback = (products === TAS_BATTERY_PRODUCTS) ? BATTERY_PRODUCTS : TAS_BATTERY_PRODUCTS;
  var allSets = [products, fallback];

  // Pass 1: Exact match (phase + inverter + battery)
  for (var s1 = 0; s1 < allSets.length; s1++) {
    for (var t1 = 0; t1 < typesToTry.length; t1++) {
      var list1 = allSets[s1][typesToTry[t1]];
      if (!list1) continue;
      for (var i = 0; i < list1.length; i++) {
        if (list1[i].phase === phase && list1[i].inverter === inverter && list1[i].battery === battery) return list1[i];
      }
    }
  }

  // Pass 2: Fuzzy match (normalized phase + inverter + battery)
  for (var s2 = 0; s2 < allSets.length; s2++) {
    for (var t2 = 0; t2 < typesToTry.length; t2++) {
      var list2 = allSets[s2][typesToTry[t2]];
      if (!list2) continue;
      for (var j = 0; j < list2.length; j++) {
        if (list2[j].phase === phase && _normInverter(list2[j].inverter) === normInv && _normBattery(list2[j].battery) === normBatt) return list2[j];
      }
    }
  }

  // Pass 3: Battery-only match (ignore inverter — battery price is inverter-independent)
  for (var s3 = 0; s3 < allSets.length; s3++) {
    for (var t3 = 0; t3 < typesToTry.length; t3++) {
      var list3 = allSets[s3][typesToTry[t3]];
      if (!list3) continue;
      for (var k = 0; k < list3.length; k++) {
        if (_normBattery(list3[k].battery) === normBatt) return list3[k];
      }
    }
  }

  // Pass 4: kWh-based fallback — extract capacity from battery string and apply commission rules
  // Commission tiers: <24.8→$500, 24.9-33.1→$600, 33.2-41.4→$700, 41.5-49.7→$800, ≥49.8→$900
  var kwhFallback = 0;
  var bUpper = (battery || '').toUpperCase();
  var kwhBattMatch = bUpper.match(/([\d.]+)\s*KW[H]?/i);
  if (kwhBattMatch) kwhFallback = parseFloat(kwhBattMatch[1]);
  if (!kwhFallback) {
    if (/F28\.?8/i.test(bUpper)) kwhFallback = 28.8;
    else if (/F25\.?6/i.test(bUpper)) kwhFallback = 25.6;
    else if (/F22\.?4/i.test(bUpper)) kwhFallback = 22.4;
    else if (/F19\.?2/i.test(bUpper)) kwhFallback = 19.2;
    else if (/F16\.?0/i.test(bUpper)) kwhFallback = 16.0;
    else if (/F12\.?8/i.test(bUpper)) kwhFallback = 12.8;
    else if (/F9\.?6/i.test(bUpper)) kwhFallback = 9.6;
    else if (/F6\.?4/i.test(bUpper)) kwhFallback = 6.4;
    else if (/[CQ]{1,2}\d*[\-\s]*L7/i.test(bUpper) || (/L7/i.test(bUpper) && /CQ/i.test(bUpper))) kwhFallback = 41.93;
    else if (/[CQ]{1,2}\d*[\-\s]*L6/i.test(bUpper) || (/L6/i.test(bUpper) && /CQ/i.test(bUpper))) kwhFallback = 35.94;
    else if (/[CQ]{1,2}\d*[\-\s]*L5/i.test(bUpper) || (/L5/i.test(bUpper) && /CQ/i.test(bUpper))) kwhFallback = 29.95;
    else if (/SBR\s*256/i.test(bUpper)) kwhFallback = 25.6;
    else if (/HS([\d.]+)/i.test(bUpper)) kwhFallback = parseFloat(bUpper.match(/HS([\d.]+)/i)[1]);
    else if (/8\.?3.*x\s*(\d)/i.test(bUpper)) kwhFallback = parseFloat(bUpper.match(/x\s*(\d)/i)[1]) * 8.3;
  }
  // Last resort: if battery string is a bare number in a plausible kWh range (5-100), treat as kWh
  if (!kwhFallback) {
    var _bareNum = parseFloat((battery || '').trim());
    if (_bareNum >= 5 && _bareNum <= 100) kwhFallback = _bareNum;
  }
  if (kwhFallback > 0) {
    var fbComm = 500;
    if (kwhFallback >= 49.8) fbComm = 900;
    else if (kwhFallback >= 41.5) fbComm = 800;
    else if (kwhFallback >= 33.2) fbComm = 700;
    else if (kwhFallback >= 24.9) fbComm = 600;
    // Estimate profit from nearest commission tier (solar_battery / battery_only)
    var fbProfit;
    if (normType === 'battery_only') {
      if (fbComm >= 900) fbProfit = 4910; else if (fbComm >= 800) fbProfit = 3830;
      else if (fbComm >= 700) fbProfit = 3470; else if (fbComm >= 600) fbProfit = 3110;
      else fbProfit = 2750;
    } else {
      if (fbComm >= 900) fbProfit = 1800; else if (fbComm >= 800) fbProfit = 1500;
      else if (fbComm >= 700) fbProfit = 1200; else if (fbComm >= 600) fbProfit = 1150;
      else fbProfit = 1450;
    }
    return {phase:phase, inverter:inverter, battery:battery, profit:fbProfit, commission:fbComm,
      grossPrice:0, stcBefore:0, stcAfter:0, rrpBefore:0, rrpAfter:0, _fallback:true};
  }

  return null;
}

/** Get unique inverter models for a given type, phase, and region */
function getBatteryInverters(type, phase, region) {
  var products = getBatteryProductsForRegion(region);
  // Build CR: Also include inverters from the other region so all products appear
  // in all locations (e.g. Solax products show for ACT, Goodwe products show for TAS)
  var fallback = (products === TAS_BATTERY_PRODUCTS) ? BATTERY_PRODUCTS : TAS_BATTERY_PRODUCTS;
  var allSets = [products, fallback];
  var seen = {};
  var result = [];
  for (var s = 0; s < allSets.length; s++) {
    var list = allSets[s][type];
    if (!list) continue;
    for (var i = 0; i < list.length; i++) {
      if (list[i].phase === phase && !seen[list[i].inverter] && !_isDiscontinuedInverter(list[i].inverter)) {
        seen[list[i].inverter] = true;
        result.push(list[i].inverter);
      }
    }
  }
  return result;
}

/** Get available battery options for a given type, phase, inverter, and region */
function getBatteryOptions(type, phase, inverter, region) {
  var products = getBatteryProductsForRegion(region);
  // Build CR: Also search fallback region for cross-region products
  var fallback = (products === TAS_BATTERY_PRODUCTS) ? BATTERY_PRODUCTS : TAS_BATTERY_PRODUCTS;
  var allSets = [products, fallback];
  var result = [];
  var seen = {};
  for (var s = 0; s < allSets.length; s++) {
    var list = allSets[s][type];
    if (!list) continue;
    for (var i = 0; i < list.length; i++) {
      if (list[i].phase === phase && list[i].inverter === inverter && !_isDiscontinuedBattery(list[i].battery)) {
        var bk = list[i].battery;
        if (!seen[bk]) { seen[bk] = true; result.push(list[i]); }
      }
    }
  }
  return result;
}

/** Friendly display name for an inverter model */
function batteryInverterLabel(inv) {
  // Goodwe models: e.g. GW5K-EHA-G20 → "Goodwe 5kW EHA 1ph"
  var m = inv.match(/GW(\d+\.?\d*K?)/i);
  if (m) {
    var kw = m[1].replace(/K$/i, '');
    var series = '';
    if (inv.indexOf('EHA') !== -1) series = 'EHA 1ph';
    else if (inv.indexOf('EHB') !== -1) series = 'EHB 1ph';
    else if (inv.indexOf('ETA') !== -1) series = 'ETA 3ph';
    return 'Goodwe ' + kw + 'kW ' + series;
  }
  // Solax X1 models
  if (inv.indexOf('X1-HYBRID') !== -1 || inv.indexOf('X1-Hybrid') !== -1) {
    var x1m = inv.match(/(\d+\.?\d*)D?$/);
    var kw1 = x1m ? x1m[1] : '';
    return 'Solax ' + kw1 + 'kW X1-Hybrid 1ph';
  }
  if (inv.indexOf('X1-VAST') !== -1) {
    var vastm = inv.match(/(\d+)K/);
    var kwv = vastm ? vastm[1] : '';
    return 'Solax ' + kwv + 'kW X1-VAST 1ph';
  }
  // Solax X3 models
  if (inv.indexOf('X3-HYBRID') !== -1) {
    var x3m = inv.match(/(\d+\.?\d*)D/);
    var kw3 = x3m ? x3m[1] : '';
    var suffix3 = inv.indexOf(' 3') !== -1 ? '' : '';
    return 'Solax ' + kw3 + 'kW X3-Hybrid 3ph';
  }
  if (inv.indexOf('X3-ULT') !== -1) {
    var ultm = inv.match(/(\d+)K/);
    var kwu = ultm ? ultm[1] : '';
    return 'Solax ' + kwu + 'kW X3-ULT 3ph';
  }
  // ── Build FQ: Fox ESS inverters — 13/05/2026 catalog rows ──
  // 1-phase: H1-5.0-E-G2 (5kW H1 1ph), KH8 (8kW 1ph), KH10 (10kW 1ph)
  // 3-phase: H3-5.0-Smart, H3-10.0-Smart, H3-15.0-Smart
  if (inv.indexOf('H1-') === 0 || inv === 'H1-5.0-E-G2') {
    var h1m = inv.match(/H1-(\d+\.?\d*)/);
    var h1kw = h1m ? h1m[1] : '5.0';
    return 'Fox ESS ' + h1kw + 'kW H1 1ph';
  }
  if (inv.indexOf('H3-') === 0 || inv.indexOf('-Smart') !== -1) {
    var h3m = inv.match(/H3-(\d+\.?\d*)/);
    var h3kw = h3m ? h3m[1] : '';
    return 'Fox ESS ' + h3kw + 'kW H3 3ph';
  }
  if (inv === 'KH8' || inv === 'KH10' || /^KH\d+$/.test(inv)) {
    var khm = inv.match(/KH(\d+)/);
    var khkw = khm ? khm[1] : '';
    return 'Fox ESS ' + khkw + 'kW KH 1ph';
  }
  // Legacy "Fox ESS …" aliases produced by the IIFE at line ~10554 — already human-readable.
  if (inv.indexOf('Fox ESS') === 0 || inv.indexOf('FoxESS') === 0) return inv;
  return inv;
}

/** Friendly display name for a battery model */
function batteryModelLabel(bat) {
  // ── Build FQ: Fox ESS EQ4800 — match FIRST so the EQ4800 names don't fall through ──
  // EQ4800 names are stored with a space before "kWh" e.g. 'EQ4800-L3 (13.98 kWh)' which is
  // why the Goodwe regex below (no space) used to miss them and return the raw code.
  if (bat.indexOf('EQ4800') === 0 || bat.indexOf('EQ4800') !== -1) {
    var fxm = bat.match(/\((\d+\.?\d*)\s*kWh\)/i);
    if (fxm) return fxm[1] + 'kWh Fox ESS';
    return 'Fox ESS ' + bat;
  }
  // ── Fox ESS CQ6 (legacy Fox line, kept for old sales) ──
  if (bat.indexOf('CQ6') === 0) {
    var cqm = bat.match(/\((\d+\.?\d*)\s*kWh\)/i);
    if (cqm) return cqm[1] + 'kWh Fox ESS';
    return 'Fox ESS ' + bat;
  }
  // Goodwe: extract kWh from parentheses (no space variant — e.g. "(16.6kWh)")
  var m = bat.match(/\((\d+\.?\d*kWh)\)/);
  if (m) return m[1] + ' Goodwe';
  // ── Luxpower LX F-series: extract actual capacity (19.2 / 25.6 / 28.8 kWh) ──
  // Previously hardcoded to 19.2kWh which mislabelled F25.6 and F28.8 batteries.
  if (bat.indexOf('LX') !== -1) {
    var lxm = bat.match(/F(\d+\.?\d*)/);
    if (lxm) return 'Luxpower ' + lxm[1] + 'kWh';
    return 'Luxpower';
  }
  // Solax T-BAT: extract kWh from HS model number e.g. SOLAX-T-BAT-HS10.8 → "10.8kWh Solax"
  var sm = bat.match(/HS(\d+\.?\d*)/);
  if (sm) return sm[1] + 'kWh Solax';
  return bat;
}

// Extras are sourced live from the product catalogue via GET /products/extras
// (grouped by category) — see use-price-calc.ts. The legacy static extras
// tables were removed to keep one source of truth.

// Helper: apply DCNT 2% markup to RRP (returns the marked-up total)
function applyDCNTMarkup(rrp) {
  return Math.round(rrp * 1.02 * 100) / 100;
}

// Build ER (DC battery parity — Neeraj 2026-05-19): returns just the 2% markup
// AMOUNT for a given RRP when isDCNT is true. Used to keep the DC company
// pricing rule in one place across calcFullCommission, _calcRrpBreakdown and
// the commission drill-down popup, applied identically to Solar AND Battery
// RRP. Previously the markup was inlined in three places for solar but never
// applied to battery, so DC sales with batteries showed inconsistent totals.
function calcDCNTMarkup(rrp, isDCNT) {
  if (!isDCNT) return 0;
  var n = parseFloat(rrp);
  if (!isFinite(n) || n <= 0) return 0;
  return Math.round(n * 0.02 * 100) / 100;
}

// Build DZ (Mattie #5): Australian postcode → state lookup. Used as a last-resort
// fallback when collectSoldLeads can't find a state on the lead or its saleDetails.
// Returns '' when the postcode isn't valid or falls outside known ranges.
function _stateFromPostcode(pc) {
  if (!pc) return '';
  var n = parseInt(String(pc).replace(/\D/g, ''), 10);
  if (!n || n < 200 || n > 9999) return '';
  // Ranges sourced from Australia Post
  if (n >= 200 && n <= 299) return 'ACT';
  if (n >= 2600 && n <= 2618) return 'ACT';
  if (n >= 2900 && n <= 2920) return 'ACT';
  if (n >= 1000 && n <= 2599) return 'NSW';
  if (n >= 2619 && n <= 2899) return 'NSW';
  if (n >= 2921 && n <= 2999) return 'NSW';
  if (n >= 3000 && n <= 3999) return 'VIC';
  if (n >= 8000 && n <= 8999) return 'VIC';
  if (n >= 4000 && n <= 4999) return 'QLD';
  if (n >= 9000 && n <= 9999) return 'QLD';
  if (n >= 5000 && n <= 5799) return 'SA';
  if (n >= 5800 && n <= 5999) return 'SA';
  if (n >= 6000 && n <= 6797) return 'WA';
  if (n >= 6800 && n <= 6999) return 'WA';
  if (n >= 7000 && n <= 7799) return 'TAS';
  if (n >= 7800 && n <= 7999) return 'TAS';
  if (n >= 800 && n <= 999) return 'NT';
  return '';
}

// ══════════════════════════════════════════════
// CANONICAL OVERSELL / UNDERSELL — single source of truth
// ══════════════════════════════════════════════
// Standardised formula used everywhere a sale's oversell or undersell is
// computed. Per spec:
//
//   When extras are present : oversell/undersell = soldPrice − (rrp + extras)
//   When extras are absent  : oversell/undersell = soldPrice − rrp
//
// In practice both reduce to soldPrice − (rrp + max(0, extras)), so the
// helper accepts extras and adds it to the RRP iff extras > 0. Returns the
// standardised shape used by the canonical commission function and every
// dashboard / report / audit / review site.
//
// Callers that already hold a "fully built" RRP that includes extras (e.g.
// calcFullCommission's finalRRP) should pass extras: 0 to avoid double
// counting; callers that hold the base RRP should pass extras separately.
//
// Output:
//   {
//     effectiveRRP,   // rrp + (extras > 0 ? extras : 0), rounded to 2dp
//     diff,           // soldPrice − effectiveRRP, rounded to 2dp (signed)
//     oversold,       // max(0,  diff), rounded to 2dp
//     undersold,      // max(0, −diff), rounded to 2dp
//     type            // 'oversell' | 'undersell' | 'even'
//   }
function calcOverUnderSell(input) {
  var round2 = function(n) { return Math.round((+n || 0) * 100) / 100; };
  var sold    = +((input && input.soldPrice) || 0) || 0;
  var rrp     = +((input && input.rrp) || 0) || 0;
  var extras  = +((input && input.extras) || 0) || 0;

  // Per spec — extras only contribute when present (positive). Negative or
  // zero extras must not pull the RRP baseline down.
  var effectiveRRP = rrp + (extras > 0 ? extras : 0);
  var diff = sold - effectiveRRP;

  return {
    effectiveRRP: round2(effectiveRRP),
    diff:         round2(diff),
    oversold:     round2(Math.max(0,  diff)),
    undersold:    round2(Math.max(0, -diff)),
    type:         (diff > 0 ? 'oversell' : (diff < 0 ? 'undersell' : 'even'))
  };
}

// ══════════════════════════════════════════════
// CANONICAL TOTAL COMMISSION — single source of truth
// ══════════════════════════════════════════════
// Implements the standardised commission spec used across every dashboard,
// report, lead view, sales pipeline and commission section. Any callsite that
// needs a "total commission" for a sale MUST go through calcStandardTotalCommission().
//
// Spec:
//   Solar Only
//     oversell : base + 0.25 × oversold
//     undersell: base − 0.60 × undersold
//   Battery Only
//     oversell ≥ $250 : battComm + 250 + 0.25 × (oversold − 250)
//     oversell < $250 : battComm + oversold              (full oversold amount)
//     undersell       : battComm − 0.60 × undersold
//   Solar + Battery
//     oversell ≥ $250 : base + battComm + 250 + 0.25 × (oversold − 250)
//     oversell < $250 : base + battComm + oversold       (full oversold amount)
//     undersell       : (base + battComm) − 0.60 × undersold
//
// Inputs:
//   saleType              'solar_only' | 'battery_only' | 'solar_battery'
//   solarBaseCommission   base commission from solar product table (0 if no solar)
//   batteryCommission     battery commission from product table (0 if no battery)
//   rrp                   authoritative system RRP (solar + battery + extras)
//   soldPrice             actual price the customer paid
//
// Output (all monetary values rounded to 2 decimals):
//   {
//     totalCommission, oversold, undersold,
//     breakdown: { solarBase, batteryCommission, baseSum, type }
//   }
// ══════════════════════════════════════════════
function calcStandardTotalCommission(input) {
  var round2 = function(n) { return Math.round((+n || 0) * 100) / 100; };
  var st = (input && input.saleType) || 'solar_only';
  var solarBase = +((input && input.solarBaseCommission) || 0) || 0;
  var battComm  = +((input && input.batteryCommission) || 0) || 0;
  var rrp       = +((input && input.rrp) || 0) || 0;
  var sold      = +((input && input.soldPrice) || 0) || 0;
  // Extras may be passed alongside an extras-free RRP. When the caller has
  // already folded extras into rrp (legacy behaviour — calcFullCommission
  // does this), they should pass extras: 0 so we don't double-count.
  var extras    = +((input && input.extras) || 0) || 0;

  var hasSolar   = (st === 'solar_only' || st === 'solar_battery');
  var hasBattery = (st === 'battery_only' || st === 'solar_battery');

  if (!hasSolar)   solarBase = 0;
  if (!hasBattery) battComm  = 0;

  // Use the canonical helper so this function and every other oversell /
  // undersell consumer share a single formula.
  var ou = calcOverUnderSell({ soldPrice: sold, rrp: rrp, extras: extras });
  var oversold  = ou.oversold;
  var undersold = ou.undersold;
  var baseSum   = solarBase + battComm;

  var total;
  var type;
  if (undersold > 0) {
    type = 'undersell';
    total = baseSum - (0.60 * undersold);
  } else if (oversold > 0) {
    type = 'oversell';
    if (hasBattery) {
      // Battery-only OR Solar+Battery share the $250-threshold tier.
      // Per spec (Neeraj 2026-05-22): at or below $250 the consultant
      // earns the FULL oversold amount on top of baseSum; above $250
      // they earn a flat $250 plus 25% of the remainder beyond $250.
      // (At exactly $250 both branches produce baseSum + 250, so the
      // boundary is mathematically identical either way.)
      if (oversold > 250) {
        total = baseSum + 250 + (0.25 * (oversold - 250));
      } else {
        total = baseSum + oversold;
      }
    } else {
      // Solar-only: flat 25% of oversold
      total = baseSum + (0.25 * oversold);
    }
  } else {
    type = 'even';
    total = baseSum;
  }

  // Floor at zero — payouts never go negative
  if (total < 0) total = 0;

  return {
    totalCommission: round2(total),
    oversold:  round2(oversold),
    undersold: round2(undersold),
    breakdown: {
      solarBase:         round2(solarBase),
      batteryCommission: round2(battComm),
      baseSum:           round2(baseSum),
      type:              type
    }
  };
}

// Back-compat helper: returns { type, amount, rawOversell } in the legacy
// shape some callers still expect. The numbers are derived from the canonical
// function, so the result is always consistent with calcStandardTotalCommission.
//
// `hasBattery` is preserved for signature compatibility but is no longer used
// to switch behaviour at this layer — the branching now lives in the canonical
// function, which is called via calcFullCommission / _calcLiveCommission.
function calcCommissionAdjustment(rrp, soldPrice, hasBattery) {
  // Build GH (Neeraj 2026-05-22): SINGLE SOURCE OF TRUTH.
  // ─────────────────────────────────────────────────────────────────
  // Routes through calcStandardTotalCommission so the spec formula lives
  // in exactly ONE place. Previously this function applied 0.25 × oversold
  // unconditionally for both solar and battery/bundle sales, silently
  // contradicting the spec for battery-only and Solar+Battery (which use
  // the $250-threshold tier). The bug was masked because _calcLiveCommission
  // overwrites the adjustment with the canonical result, but any other
  // caller reading `adjustment.amount` directly would get a wrong answer.
  //
  // Strategy: feed a sentinel base into calcStandardTotalCommission that's
  // large enough that the floor-at-zero never clips, then read
  // (total − base) as the signed adjustment. This guarantees adj matches
  // what every other consumer (Sales Pipeline, Commissions tab, popup)
  // sees, regardless of how the spec evolves.
  var round2 = function(n) { return Math.round((+n || 0) * 100) / 100; };
  var st = hasBattery ? 'solar_battery' : 'solar_only';
  var SENTINEL = 1e7;  // $10M base — never floors against a realistic undersell
  var res = calcStandardTotalCommission({
    saleType:            st,
    solarBaseCommission: hasBattery ? 0 : SENTINEL,
    batteryCommission:   hasBattery ? SENTINEL : 0,
    rrp:                 rrp,
    soldPrice:           soldPrice,
    extras:              0
  });
  var adj = round2(res.totalCommission - SENTINEL);
  if (res.breakdown.type === 'undersell') {
    return { type: 'undersell', amount: adj };
  } else if (res.breakdown.type === 'oversell') {
    return { type: 'oversell', amount: adj, rawOversell: res.oversold };
  }
  return { type: 'even', amount: 0 };
}


// ── Public surface used by the Price Calculator UI ──
export {
  BATTERY_PRODUCTS,
  TAS_BATTERY_PRODUCTS,
  FINANCE_OPTIONS,
  getBatteryInverters,
  getBatteryOptions,
  getBatteryProduct,
  getBatteryRRP,
  batteryInverterLabel,
  batteryModelLabel,
  calcOverUnderSell,
  calcCommissionAdjustment,
};
