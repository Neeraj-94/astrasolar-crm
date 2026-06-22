-- Seed InverterProduct catalogue (idempotent on id; status defaults to ACTIVE).
-- updatedAt has no DB default (Prisma sets @updatedAt at app level), so set it here.
INSERT INTO "InverterProduct"
  ("id", "productName", "brand", "inverterModel", "type", "phase", "systemSize", "maxPVArray", "mppt", "strings", "notes", "states", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('gw5000-dns-30', 'GW5000-DNS-30', 'GoodWe',  'GW5000-DNS-30', 'Grid Tied', 1, 5.000,  6.600,  2, 2, '1P - 2MPPT - 2 Strings', ARRAY['ACT','NSW']::text[], 1,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gw5000-ms-30',  'GW5000-MS-30',  'GoodWe',  'GW5000-MS-30',  'Grid Tied', 1, 5.000,  6.600,  3, 3, '1P - 3MPPT - 3 Strings', ARRAY['ACT','NSW']::text[], 2,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gw6000-ms-30',  'GW6000-MS-30',  'GoodWe',  'GW6000-MS-30',  'Grid Tied', 1, 6.000,  7.980,  3, 3, '1P - 3MPPT - 3 Strings', ARRAY['ACT','NSW']::text[], 3,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gw8500-ms-30',  'GW8500-MS-30',  'GoodWe',  'GW8500-MS-30',  'Grid Tied', 1, 8.500,  11.305, 3, 3, '1P - 3MPPT - 3 Strings', ARRAY['ACT','NSW']::text[], 4,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gw10k-ms-30',   'GW10K-MS-30',   'GoodWe',  'GW10K-MS-30',   'Grid Tied', 1, 10.000, 13.300, 3, 3, '1P - 3MPPT - 3 Strings', ARRAY['ACT','NSW']::text[], 5,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gw5000-sdt-20', 'GW5000-SDT-20', 'GoodWe',  'GW5000-SDT-20', 'Grid Tied', 3, 5.000,  6.600,  2, 2, '3P - 2MPPT - 2 Strings', ARRAY['ACT','NSW']::text[], 6,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gw6000-sdt-20', 'GW6000-SDT-20', 'GoodWe',  'GW6000-SDT-20', 'Grid Tied', 3, 6.000,  7.980,  2, 2, '3P - 2MPPT - 2 Strings', ARRAY['ACT','NSW']::text[], 7,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gw8kau-dt',     'GW8KAU-DT',     'GoodWe',  'GW8KAU-DT',     'Grid Tied', 3, 8.000,  10.640, 2, 4, '3P - 2MPPT - 4 Strings', ARRAY['ACT','NSW']::text[], 8,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gw10kau-dt',    'GW10KAU-DT',    'GoodWe',  'GW10KAU-DT',    'Grid Tied', 3, 10.000, 13.300, 2, 4, '3P - 2MPPT - 4 Strings', ARRAY['ACT','NSW']::text[], 9,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gw15kau-dt',    'GW15KAU-DT',    'GoodWe',  'GW15KAU-DT',    'Grid Tied', 3, 15.000, 19.950, 2, 4, '3P - 2MPPT - 4 Strings', ARRAY['ACT','NSW']::text[], 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('sg8-0rs',       'SG8.0RS',       'Sungrow', 'SG8.0RS',       'Grid Tied', 1, 8.000,  10.640, 3, 3, '1p - 3MPPT - 3 Strings', ARRAY['ACT','NSW']::text[], 11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('sg10rs',        'SG10RS',        'Sungrow', 'SG10RS',        'Grid Tied', 1, 10.000, 13.300, 3, 3, '1p - 3MPPT - 3 Strings', ARRAY['ACT','NSW']::text[], 12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('sg5-0rt',       'SG5.0RT',       'Sungrow', 'SG5.0RT',       'Grid Tied', 3, 5.000,  6.600,  2, 2, '3p - 2MPPT - 2 Strings', ARRAY['ACT','NSW']::text[], 13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('sg10rt',        'SG10RT',        'Sungrow', 'SG10RT',        'Grid Tied', 3, 10.000, 13.300, 2, 3, '3p - 2MPPT - 3 Strings', ARRAY['ACT','NSW']::text[], 14, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
