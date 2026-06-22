-- Seed Fox ESS EQ4800 battery stacks + Fox ESS inverter combos + combo context pricing.
-- Battery-intrinsic figures on BatteryProduct; gross+RRP (vary by inverter & context) on combo.
-- updatedAt has no DB default, so it is set explicitly. All inserts idempotent.

INSERT INTO "BatteryProduct"
  ("id","productName","brand","batteryModel","batterySize","modules","batteryStc","phase","states","batteryCommission","profit","effectiveDate","sortOrder","createdAt","updatedAt")
VALUES
  ('bat-eq4800-l3', 'EQ4800-L3 (13.98 kWh)', 'Fox ESS', 'EQ4800-L3', 13.98, 3, 3467.50, NULL, ARRAY['ACT','NSW']::text[], 500, 1950.00, DATE '2026-03-21', 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('bat-eq4800-l4', 'EQ4800-L4 (18.64 kWh)', 'Fox ESS', 'EQ4800-L4', 18.64, 4, 4161.00, NULL, ARRAY['ACT','NSW']::text[], 600, 2150.00, DATE '2026-03-21', 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('bat-eq4800-l5', 'EQ4800-L5 (23.30 kWh)', 'Fox ESS', 'EQ4800-L5', 23.30, 5, 4854.50, NULL, ARRAY['ACT','NSW']::text[], 700, 2450.00, DATE '2026-03-21', 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('bat-eq4800-l6', 'EQ4800-L6 (27.96 kWh)', 'Fox ESS', 'EQ4800-L6', 27.96, 6, 5548.00, NULL, ARRAY['ACT','NSW']::text[], 800, 2750.00, DATE '2026-03-21', 9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('bat-eq4800-l7', 'EQ4800-L7 (32.61 kWh)', 'Fox ESS', 'EQ4800-L7', 32.61, 7, 5730.50, NULL, ARRAY['ACT','NSW']::text[], 900, 3050.00, DATE '2026-03-21', 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "BatteryInverterCompat" ("id","inverterId","batteryId","updatedAt")
VALUES
  ('combo-h1-5-0-e-g2-eq4800-l3', 'h1-5-0-e-g2', 'bat-eq4800-l3', CURRENT_TIMESTAMP),
  ('combo-h1-5-0-e-g2-eq4800-l4', 'h1-5-0-e-g2', 'bat-eq4800-l4', CURRENT_TIMESTAMP),
  ('combo-h1-5-0-e-g2-eq4800-l5', 'h1-5-0-e-g2', 'bat-eq4800-l5', CURRENT_TIMESTAMP),
  ('combo-kh8-eq4800-l3', 'kh8', 'bat-eq4800-l3', CURRENT_TIMESTAMP),
  ('combo-kh8-eq4800-l4', 'kh8', 'bat-eq4800-l4', CURRENT_TIMESTAMP),
  ('combo-kh8-eq4800-l5', 'kh8', 'bat-eq4800-l5', CURRENT_TIMESTAMP),
  ('combo-kh10-eq4800-l3', 'kh10', 'bat-eq4800-l3', CURRENT_TIMESTAMP),
  ('combo-kh10-eq4800-l4', 'kh10', 'bat-eq4800-l4', CURRENT_TIMESTAMP),
  ('combo-kh10-eq4800-l5', 'kh10', 'bat-eq4800-l5', CURRENT_TIMESTAMP),
  ('combo-kh10-eq4800-l6', 'kh10', 'bat-eq4800-l6', CURRENT_TIMESTAMP),
  ('combo-h3-5-0-smart-eq4800-l3', 'h3-5-0-smart', 'bat-eq4800-l3', CURRENT_TIMESTAMP),
  ('combo-h3-5-0-smart-eq4800-l4', 'h3-5-0-smart', 'bat-eq4800-l4', CURRENT_TIMESTAMP),
  ('combo-h3-5-0-smart-eq4800-l5', 'h3-5-0-smart', 'bat-eq4800-l5', CURRENT_TIMESTAMP),
  ('combo-h3-10-0-smart-eq4800-l3', 'h3-10-0-smart', 'bat-eq4800-l3', CURRENT_TIMESTAMP),
  ('combo-h3-10-0-smart-eq4800-l4', 'h3-10-0-smart', 'bat-eq4800-l4', CURRENT_TIMESTAMP),
  ('combo-h3-10-0-smart-eq4800-l5', 'h3-10-0-smart', 'bat-eq4800-l5', CURRENT_TIMESTAMP),
  ('combo-h3-10-0-smart-eq4800-l6', 'h3-10-0-smart', 'bat-eq4800-l6', CURRENT_TIMESTAMP),
  ('combo-h3-10-0-smart-eq4800-l7', 'h3-10-0-smart', 'bat-eq4800-l7', CURRENT_TIMESTAMP),
  ('combo-h3-15-0-smart-eq4800-l3', 'h3-15-0-smart', 'bat-eq4800-l3', CURRENT_TIMESTAMP),
  ('combo-h3-15-0-smart-eq4800-l4', 'h3-15-0-smart', 'bat-eq4800-l4', CURRENT_TIMESTAMP),
  ('combo-h3-15-0-smart-eq4800-l5', 'h3-15-0-smart', 'bat-eq4800-l5', CURRENT_TIMESTAMP),
  ('combo-h3-15-0-smart-eq4800-l6', 'h3-15-0-smart', 'bat-eq4800-l6', CURRENT_TIMESTAMP),
  ('combo-h3-15-0-smart-eq4800-l7', 'h3-15-0-smart', 'bat-eq4800-l7', CURRENT_TIMESTAMP)
ON CONFLICT ("inverterId","batteryId") DO NOTHING;

INSERT INTO "BatteryComboContextPrice" ("id","compatId","context","grossPrice","batteryRrp","effectiveDate","updatedAt")
VALUES
  ('bcp-h1-5-0-e-g2-eq4800-l3-sol',   'combo-h1-5-0-e-g2-eq4800-l3', 'SOLAR_BATTERY', 9086.90,   5619.40,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-h1-5-0-e-g2-eq4800-l3-alone', 'combo-h1-5-0-e-g2-eq4800-l3', 'BATTERY_ONLY', 13012.90, 9545.40, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-h1-5-0-e-g2-eq4800-l4-sol',   'combo-h1-5-0-e-g2-eq4800-l4', 'SOLAR_BATTERY', 10679.40,   6518.40,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-h1-5-0-e-g2-eq4800-l4-alone', 'combo-h1-5-0-e-g2-eq4800-l4', 'BATTERY_ONLY', 14765.40, 10604.40, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-h1-5-0-e-g2-eq4800-l5-sol',   'combo-h1-5-0-e-g2-eq4800-l5', 'SOLAR_BATTERY', 12371.90,   7517.40,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-h1-5-0-e-g2-eq4800-l5-alone', 'combo-h1-5-0-e-g2-eq4800-l5', 'BATTERY_ONLY', 16517.90, 11663.40, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-kh8-eq4800-l3-sol',   'combo-kh8-eq4800-l3', 'SOLAR_BATTERY', 9592.90,   6125.40,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-kh8-eq4800-l3-alone', 'combo-kh8-eq4800-l3', 'BATTERY_ONLY', 13518.90, 10051.40, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-kh8-eq4800-l4-sol',   'combo-kh8-eq4800-l4', 'SOLAR_BATTERY', 11185.40,   7024.40,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-kh8-eq4800-l4-alone', 'combo-kh8-eq4800-l4', 'BATTERY_ONLY', 15271.40, 11110.40, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-kh8-eq4800-l5-sol',   'combo-kh8-eq4800-l5', 'SOLAR_BATTERY', 12877.90,   8023.40,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-kh8-eq4800-l5-alone', 'combo-kh8-eq4800-l5', 'BATTERY_ONLY', 17023.90, 12169.40, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-kh10-eq4800-l3-sol',   'combo-kh10-eq4800-l3', 'SOLAR_BATTERY', 9812.90,   6345.40,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-kh10-eq4800-l3-alone', 'combo-kh10-eq4800-l3', 'BATTERY_ONLY', 13738.90, 10271.40, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-kh10-eq4800-l4-sol',   'combo-kh10-eq4800-l4', 'SOLAR_BATTERY', 11405.40,   7244.40,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-kh10-eq4800-l4-alone', 'combo-kh10-eq4800-l4', 'BATTERY_ONLY', 15491.40, 11330.40, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-kh10-eq4800-l5-sol',   'combo-kh10-eq4800-l5', 'SOLAR_BATTERY', 13097.90,   8243.40,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-kh10-eq4800-l5-alone', 'combo-kh10-eq4800-l5', 'BATTERY_ONLY', 17243.90, 12389.40, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-kh10-eq4800-l6-sol',   'combo-kh10-eq4800-l6', 'SOLAR_BATTERY', 15037.90,   9489.90,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-kh10-eq4800-l6-alone', 'combo-kh10-eq4800-l6', 'BATTERY_ONLY', 19503.90, 13955.90, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-h3-5-0-smart-eq4800-l3-sol',   'combo-h3-5-0-smart-eq4800-l3', 'SOLAR_BATTERY', 10092.90,   6625.40,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-h3-5-0-smart-eq4800-l3-alone', 'combo-h3-5-0-smart-eq4800-l3', 'BATTERY_ONLY', 14378.90, 10911.40, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-h3-5-0-smart-eq4800-l4-sol',   'combo-h3-5-0-smart-eq4800-l4', 'SOLAR_BATTERY', 11685.40,   7524.40,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-h3-5-0-smart-eq4800-l4-alone', 'combo-h3-5-0-smart-eq4800-l4', 'BATTERY_ONLY', 16131.40, 11970.40, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-h3-5-0-smart-eq4800-l5-sol',   'combo-h3-5-0-smart-eq4800-l5', 'SOLAR_BATTERY', 13377.90,   8523.40,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-h3-5-0-smart-eq4800-l5-alone', 'combo-h3-5-0-smart-eq4800-l5', 'BATTERY_ONLY', 17883.90, 13029.40, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-h3-10-0-smart-eq4800-l3-sol',   'combo-h3-10-0-smart-eq4800-l3', 'SOLAR_BATTERY', 10642.90,   7175.40,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-h3-10-0-smart-eq4800-l3-alone', 'combo-h3-10-0-smart-eq4800-l3', 'BATTERY_ONLY', 14928.90, 11461.40, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-h3-10-0-smart-eq4800-l4-sol',   'combo-h3-10-0-smart-eq4800-l4', 'SOLAR_BATTERY', 12235.40,   8074.40,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-h3-10-0-smart-eq4800-l4-alone', 'combo-h3-10-0-smart-eq4800-l4', 'BATTERY_ONLY', 16681.40, 12520.40, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-h3-10-0-smart-eq4800-l5-sol',   'combo-h3-10-0-smart-eq4800-l5', 'SOLAR_BATTERY', 13927.90,   9073.40,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-h3-10-0-smart-eq4800-l5-alone', 'combo-h3-10-0-smart-eq4800-l5', 'BATTERY_ONLY', 18433.90, 13579.40, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-h3-10-0-smart-eq4800-l6-sol',   'combo-h3-10-0-smart-eq4800-l6', 'SOLAR_BATTERY', 15867.90,   10319.90,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-h3-10-0-smart-eq4800-l6-alone', 'combo-h3-10-0-smart-eq4800-l6', 'BATTERY_ONLY', 20333.90, 14785.90, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-h3-10-0-smart-eq4800-l7-sol',   'combo-h3-10-0-smart-eq4800-l7', 'SOLAR_BATTERY', 17642.90,   11912.40,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-h3-10-0-smart-eq4800-l7-alone', 'combo-h3-10-0-smart-eq4800-l7', 'BATTERY_ONLY', 22068.90, 16338.40, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-h3-15-0-smart-eq4800-l3-sol',   'combo-h3-15-0-smart-eq4800-l3', 'SOLAR_BATTERY', 11082.90,   7615.40,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-h3-15-0-smart-eq4800-l3-alone', 'combo-h3-15-0-smart-eq4800-l3', 'BATTERY_ONLY', 15368.90, 11901.40, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-h3-15-0-smart-eq4800-l4-sol',   'combo-h3-15-0-smart-eq4800-l4', 'SOLAR_BATTERY', 12675.40,   8514.40,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-h3-15-0-smart-eq4800-l4-alone', 'combo-h3-15-0-smart-eq4800-l4', 'BATTERY_ONLY', 17121.40, 12960.40, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-h3-15-0-smart-eq4800-l5-sol',   'combo-h3-15-0-smart-eq4800-l5', 'SOLAR_BATTERY', 14367.90,   9513.40,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-h3-15-0-smart-eq4800-l5-alone', 'combo-h3-15-0-smart-eq4800-l5', 'BATTERY_ONLY', 18873.90, 14019.40, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-h3-15-0-smart-eq4800-l6-sol',   'combo-h3-15-0-smart-eq4800-l6', 'SOLAR_BATTERY', 16307.90,   10759.90,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-h3-15-0-smart-eq4800-l6-alone', 'combo-h3-15-0-smart-eq4800-l6', 'BATTERY_ONLY', 20773.90, 15225.90, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-h3-15-0-smart-eq4800-l7-sol',   'combo-h3-15-0-smart-eq4800-l7', 'SOLAR_BATTERY', 18082.90,   12352.40,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-h3-15-0-smart-eq4800-l7-alone', 'combo-h3-15-0-smart-eq4800-l7', 'BATTERY_ONLY', 22508.90, 16778.40, DATE '2026-03-21', CURRENT_TIMESTAMP)
ON CONFLICT ("compatId","context") DO NOTHING;
