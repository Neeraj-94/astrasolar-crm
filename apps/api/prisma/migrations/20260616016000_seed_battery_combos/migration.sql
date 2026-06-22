-- Seed GoodWe battery stacks, inverter+battery combos, and combo context pricing.
-- Battery-intrinsic figures (modules/size/STC/profit/commission) live on BatteryProduct;
-- gross + RRP (which vary by inverter AND context) live on BatteryComboContextPrice.
-- updatedAt has no DB default, so it is set explicitly. All inserts idempotent.

INSERT INTO "BatteryProduct"
  ("id","productName","brand","batteryModel","batterySize","modules","batteryStc","phase","states","batteryCommission","profit","effectiveDate","sortOrder","createdAt","updatedAt")
VALUES
  ('bat-gw83-x2', 'GW8.3-BAT-D-G20 x2 (16.6kWh)', 'Goodwe', 'GW8.3-BAT-D-G20', 16.6, 2, 3759.50, NULL, ARRAY['ACT','NSW']::text[], 500, 2750.00, DATE '2026-03-21', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('bat-gw83-x3', 'GW8.3-BAT-D-G20 x3 (24.9kWh)', 'Goodwe', 'GW8.3-BAT-D-G20', 24.9, 3, 4927.50, NULL, ARRAY['ACT','NSW']::text[], 600, 3110.00, DATE '2026-03-21', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('bat-gw83-x4', 'GW8.3-BAT-D-G20 x4 (33.2kWh)', 'Goodwe', 'GW8.3-BAT-D-G20', 33.2, 4, 5694.00, NULL, ARRAY['ACT','NSW']::text[], 700, 3470.00, DATE '2026-03-21', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('bat-gw83-x5', 'GW8.3-BAT-D-G20 x5 (41.5kWh)', 'Goodwe', 'GW8.3-BAT-D-G20', 41.5, 5, 5986.00, NULL, ARRAY['ACT','NSW']::text[], 800, 3830.00, DATE '2026-03-21', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('bat-gw83-x6', 'GW8.3-BAT-D-G20 x6 (49.8kWh)', 'Goodwe', 'GW8.3-BAT-D-G20', 49.8, 6, 6278.00, NULL, ARRAY['ACT','NSW']::text[], 900, 4910.00, DATE '2026-03-21', 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "BatteryInverterCompat" ("id","inverterId","batteryId","updatedAt")
VALUES
  ('combo-gw5k-eha-g20-x2', 'gw5k-eha-g20', 'bat-gw83-x2', CURRENT_TIMESTAMP),
  ('combo-gw5k-eha-g20-x3', 'gw5k-eha-g20', 'bat-gw83-x3', CURRENT_TIMESTAMP),
  ('combo-gw5k-eha-g20-x4', 'gw5k-eha-g20', 'bat-gw83-x4', CURRENT_TIMESTAMP),
  ('combo-gw6k-eha-g20-x2', 'gw6k-eha-g20', 'bat-gw83-x2', CURRENT_TIMESTAMP),
  ('combo-gw6k-eha-g20-x3', 'gw6k-eha-g20', 'bat-gw83-x3', CURRENT_TIMESTAMP),
  ('combo-gw6k-eha-g20-x4', 'gw6k-eha-g20', 'bat-gw83-x4', CURRENT_TIMESTAMP),
  ('combo-gw8k-eha-g20-x2', 'gw8k-eha-g20', 'bat-gw83-x2', CURRENT_TIMESTAMP),
  ('combo-gw8k-eha-g20-x3', 'gw8k-eha-g20', 'bat-gw83-x3', CURRENT_TIMESTAMP),
  ('combo-gw8k-eha-g20-x4', 'gw8k-eha-g20', 'bat-gw83-x4', CURRENT_TIMESTAMP),
  ('combo-gw9-999keha-g20-x2', 'gw9-999keha-g20', 'bat-gw83-x2', CURRENT_TIMESTAMP),
  ('combo-gw9-999keha-g20-x3', 'gw9-999keha-g20', 'bat-gw83-x3', CURRENT_TIMESTAMP),
  ('combo-gw9-999keha-g20-x4', 'gw9-999keha-g20', 'bat-gw83-x4', CURRENT_TIMESTAMP),
  ('combo-gw9-999keha-g20-x5', 'gw9-999keha-g20', 'bat-gw83-x5', CURRENT_TIMESTAMP),
  ('combo-gw9-999keha-g20-x6', 'gw9-999keha-g20', 'bat-gw83-x6', CURRENT_TIMESTAMP),
  ('combo-gw5k-eta-g20-x2', 'gw5k-eta-g20', 'bat-gw83-x2', CURRENT_TIMESTAMP),
  ('combo-gw5k-eta-g20-x3', 'gw5k-eta-g20', 'bat-gw83-x3', CURRENT_TIMESTAMP),
  ('combo-gw5k-eta-g20-x4', 'gw5k-eta-g20', 'bat-gw83-x4', CURRENT_TIMESTAMP),
  ('combo-gw9-999k-eta-g20-x2', 'gw9-999k-eta-g20', 'bat-gw83-x2', CURRENT_TIMESTAMP),
  ('combo-gw9-999k-eta-g20-x3', 'gw9-999k-eta-g20', 'bat-gw83-x3', CURRENT_TIMESTAMP),
  ('combo-gw9-999k-eta-g20-x4', 'gw9-999k-eta-g20', 'bat-gw83-x4', CURRENT_TIMESTAMP),
  ('combo-gw9-999k-eta-g20-x5', 'gw9-999k-eta-g20', 'bat-gw83-x5', CURRENT_TIMESTAMP),
  ('combo-gw9-999k-eta-g20-x6', 'gw9-999k-eta-g20', 'bat-gw83-x6', CURRENT_TIMESTAMP),
  ('combo-gw15k-eta-g20-x2', 'gw15k-eta-g20', 'bat-gw83-x2', CURRENT_TIMESTAMP),
  ('combo-gw15k-eta-g20-x3', 'gw15k-eta-g20', 'bat-gw83-x3', CURRENT_TIMESTAMP),
  ('combo-gw15k-eta-g20-x4', 'gw15k-eta-g20', 'bat-gw83-x4', CURRENT_TIMESTAMP),
  ('combo-gw15k-eta-g20-x5', 'gw15k-eta-g20', 'bat-gw83-x5', CURRENT_TIMESTAMP),
  ('combo-gw15k-eta-g20-x6', 'gw15k-eta-g20', 'bat-gw83-x6', CURRENT_TIMESTAMP)
ON CONFLICT ("inverterId","batteryId") DO NOTHING;

INSERT INTO "BatteryComboContextPrice" ("id","compatId","context","grossPrice","batteryRrp","effectiveDate","updatedAt")
VALUES
  ('bcp-gw5k-eha-g20-x2-sol',   'combo-gw5k-eha-g20-x2', 'SOLAR_BATTERY', 11176.02,   7416.52,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw5k-eha-g20-x2-alone', 'combo-gw5k-eha-g20-x2', 'BATTERY_ONLY', 15292.02, 11532.52, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw5k-eha-g20-x3-sol',   'combo-gw5k-eha-g20-x3', 'SOLAR_BATTERY', 13836.02,   8908.52,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw5k-eha-g20-x3-alone', 'combo-gw5k-eha-g20-x3', 'BATTERY_ONLY', 18612.02, 13684.52, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw5k-eha-g20-x4-sol',   'combo-gw5k-eha-g20-x4', 'SOLAR_BATTERY', 16846.02,   11152.02,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw5k-eha-g20-x4-alone', 'combo-gw5k-eha-g20-x4', 'BATTERY_ONLY', 22182.02, 16488.02, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw6k-eha-g20-x2-sol',   'combo-gw6k-eha-g20-x2', 'SOLAR_BATTERY', 11137.81,   7378.31,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw6k-eha-g20-x2-alone', 'combo-gw6k-eha-g20-x2', 'BATTERY_ONLY', 15412.81, 11653.31, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw6k-eha-g20-x3-sol',   'combo-gw6k-eha-g20-x3', 'SOLAR_BATTERY', 13797.81,   8870.31,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw6k-eha-g20-x3-alone', 'combo-gw6k-eha-g20-x3', 'BATTERY_ONLY', 18732.81, 13805.31, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw6k-eha-g20-x4-sol',   'combo-gw6k-eha-g20-x4', 'SOLAR_BATTERY', 16707.81,   11013.81,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw6k-eha-g20-x4-alone', 'combo-gw6k-eha-g20-x4', 'BATTERY_ONLY', 22302.81, 16608.81, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw8k-eha-g20-x2-sol',   'combo-gw8k-eha-g20-x2', 'SOLAR_BATTERY', 11645.24,   7885.74,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw8k-eha-g20-x2-alone', 'combo-gw8k-eha-g20-x2', 'BATTERY_ONLY', 16070.24, 12310.74, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw8k-eha-g20-x3-sol',   'combo-gw8k-eha-g20-x3', 'SOLAR_BATTERY', 14305.24,   9377.74,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw8k-eha-g20-x3-alone', 'combo-gw8k-eha-g20-x3', 'BATTERY_ONLY', 19390.24, 14462.74, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw8k-eha-g20-x4-sol',   'combo-gw8k-eha-g20-x4', 'SOLAR_BATTERY', 17315.24,   11621.24,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw8k-eha-g20-x4-alone', 'combo-gw8k-eha-g20-x4', 'BATTERY_ONLY', 22960.24, 17266.24, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw9-999keha-g20-x2-sol',   'combo-gw9-999keha-g20-x2', 'SOLAR_BATTERY', 11823.46,   8063.96,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw9-999keha-g20-x2-alone', 'combo-gw9-999keha-g20-x2', 'BATTERY_ONLY', 16248.46, 12488.96, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw9-999keha-g20-x3-sol',   'combo-gw9-999keha-g20-x3', 'SOLAR_BATTERY', 14483.46,   9555.96,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw9-999keha-g20-x3-alone', 'combo-gw9-999keha-g20-x3', 'BATTERY_ONLY', 19568.46, 14640.96, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw9-999keha-g20-x4-sol',   'combo-gw9-999keha-g20-x4', 'SOLAR_BATTERY', 17493.46,   11799.46,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw9-999keha-g20-x4-alone', 'combo-gw9-999keha-g20-x4', 'BATTERY_ONLY', 23138.46, 17444.46, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw9-999keha-g20-x5-sol',   'combo-gw9-999keha-g20-x5', 'SOLAR_BATTERY', 20753.46,   14767.46,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw9-999keha-g20-x5-alone', 'combo-gw9-999keha-g20-x5', 'BATTERY_ONLY', 26458.46, 20472.46, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw9-999keha-g20-x6-sol',   'combo-gw9-999keha-g20-x6', 'SOLAR_BATTERY', 24013.46,   17735.46,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw9-999keha-g20-x6-alone', 'combo-gw9-999keha-g20-x6', 'BATTERY_ONLY', 30498.46, 24220.46, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw5k-eta-g20-x2-sol',   'combo-gw5k-eta-g20-x2', 'SOLAR_BATTERY', 11615.00,   7855.50,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw5k-eta-g20-x2-alone', 'combo-gw5k-eta-g20-x2', 'BATTERY_ONLY', 16040.00, 12280.50, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw5k-eta-g20-x3-sol',   'combo-gw5k-eta-g20-x3', 'SOLAR_BATTERY', 14275.00,   9347.50,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw5k-eta-g20-x3-alone', 'combo-gw5k-eta-g20-x3', 'BATTERY_ONLY', 19360.00, 14432.50, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw5k-eta-g20-x4-sol',   'combo-gw5k-eta-g20-x4', 'SOLAR_BATTERY', 17285.00,   11591.00,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw5k-eta-g20-x4-alone', 'combo-gw5k-eta-g20-x4', 'BATTERY_ONLY', 22930.00, 17236.00, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw9-999k-eta-g20-x2-sol',   'combo-gw9-999k-eta-g20-x2', 'SOLAR_BATTERY', 11538.63,   7779.13,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw9-999k-eta-g20-x2-alone', 'combo-gw9-999k-eta-g20-x2', 'BATTERY_ONLY', 15963.63, 12204.13, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw9-999k-eta-g20-x3-sol',   'combo-gw9-999k-eta-g20-x3', 'SOLAR_BATTERY', 14198.63,   9271.13,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw9-999k-eta-g20-x3-alone', 'combo-gw9-999k-eta-g20-x3', 'BATTERY_ONLY', 19283.63, 14356.13, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw9-999k-eta-g20-x4-sol',   'combo-gw9-999k-eta-g20-x4', 'SOLAR_BATTERY', 17208.63,   11514.63,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw9-999k-eta-g20-x4-alone', 'combo-gw9-999k-eta-g20-x4', 'BATTERY_ONLY', 22853.63, 17159.63, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw9-999k-eta-g20-x5-sol',   'combo-gw9-999k-eta-g20-x5', 'SOLAR_BATTERY', 21718.63,   15732.63,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw9-999k-eta-g20-x5-alone', 'combo-gw9-999k-eta-g20-x5', 'BATTERY_ONLY', 24923.63, 18937.63, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw9-999k-eta-g20-x6-sol',   'combo-gw9-999k-eta-g20-x6', 'SOLAR_BATTERY', 24978.63,   18700.63,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw9-999k-eta-g20-x6-alone', 'combo-gw9-999k-eta-g20-x6', 'BATTERY_ONLY', 28963.63, 22685.63, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw15k-eta-g20-x2-sol',   'combo-gw15k-eta-g20-x2', 'SOLAR_BATTERY', 11656.60,   7897.10,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw15k-eta-g20-x2-alone', 'combo-gw15k-eta-g20-x2', 'BATTERY_ONLY', 16081.60, 12322.10, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw15k-eta-g20-x3-sol',   'combo-gw15k-eta-g20-x3', 'SOLAR_BATTERY', 14316.60,   9389.10,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw15k-eta-g20-x3-alone', 'combo-gw15k-eta-g20-x3', 'BATTERY_ONLY', 19401.60, 14474.10, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw15k-eta-g20-x4-sol',   'combo-gw15k-eta-g20-x4', 'SOLAR_BATTERY', 17326.60,   11632.60,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw15k-eta-g20-x4-alone', 'combo-gw15k-eta-g20-x4', 'BATTERY_ONLY', 22971.60, 17277.60, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw15k-eta-g20-x5-sol',   'combo-gw15k-eta-g20-x5', 'SOLAR_BATTERY', 21836.60,   15850.60,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw15k-eta-g20-x5-alone', 'combo-gw15k-eta-g20-x5', 'BATTERY_ONLY', 25041.60, 19055.60, DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw15k-eta-g20-x6-sol',   'combo-gw15k-eta-g20-x6', 'SOLAR_BATTERY', 25096.60,   18818.60,   DATE '2026-03-21', CURRENT_TIMESTAMP),
  ('bcp-gw15k-eta-g20-x6-alone', 'combo-gw15k-eta-g20-x6', 'BATTERY_ONLY', 29081.60, 22803.60, DATE '2026-03-21', CURRENT_TIMESTAMP)
ON CONFLICT ("compatId","context") DO NOTHING;
