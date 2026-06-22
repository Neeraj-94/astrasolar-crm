-- Add GoodWe hybrid inverters (ACT/NSW). Idempotent on id.
-- updatedAt has no DB default (Prisma sets @updatedAt at app level), so set it here.
INSERT INTO "InverterProduct"
  ("id", "productName", "brand", "inverterModel", "type", "phase", "systemSize", "maxPVArray", "mppt", "strings", "notes", "states", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('gw5k-ehb-au-g11',   'GW5K-EHB-AU-G11',   'GoodWe', 'GW5K-EHB-AU-G11',   'Hybrid', 1, 5.000,  6.600,  3, 3, '1 Phase 3MPPT', ARRAY['ACT','NSW']::text[], 26, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gw8-6k-ehb-au-g11', 'GW8.6K-EHB-AU-G11', 'GoodWe', 'GW8.6K-EHB-AU-G11', 'Hybrid', 1, 8.600,  11.440, 4, 4, '1 Phase 4MPPT', ARRAY['ACT','NSW']::text[], 27, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gw9-99k-ehb-au-g11','GW9.99K-EHB-AU-G11','GoodWe', 'GW9.99K-EHB-AU-G11','Hybrid', 1, 9.999,  13.300, 4, 4, '1 Phase 4MPPT', ARRAY['ACT','NSW']::text[], 28, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gw5k-eha-g20',      'GW5K-EHA-G20',      'GoodWe', 'GW5K-EHA-G20',      'Hybrid', 1, 5.000,  6.600,  2, 2, NULL,            ARRAY['ACT','NSW']::text[], 29, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gw6k-eha-g20',      'GW6K-EHA-G20',      'GoodWe', 'GW6K-EHA-G20',      'Hybrid', 1, 6.000,  7.980,  2, 2, NULL,            ARRAY['ACT','NSW']::text[], 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gw8k-eha-g20',      'GW8K-EHA-G20',      'GoodWe', 'GW8K-EHA-G20',      'Hybrid', 1, 8.000,  10.640, 4, 4, NULL,            ARRAY['ACT','NSW']::text[], 31, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gw9-999keha-g20',   'GW9.999KEHA-G20',   'GoodWe', 'GW9.999KEHA-G20',   'Hybrid', 1, 9.999,  13.300, 4, 4, NULL,            ARRAY['ACT','NSW']::text[], 32, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gw5k-eta-g20',      'GW5K-ETA-G20',      'GoodWe', 'GW5K-ETA-G20',      'Hybrid', 3, 5.000,  6.600,  2, 2, '3 Phase 2MPPT', ARRAY['ACT','NSW']::text[], 33, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gw8000-et-20',      'GW8000-ET-20',      'GoodWe', 'GW8000-ET-20',      'Hybrid', 3, 8.000,  10.640, 2, 2, '3 Phase 2MPPT', ARRAY['ACT','NSW']::text[], 34, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gw9-999k-eta-g20',  'GW9.999K-ETA-G20',  'GoodWe', 'GW9.999K-ETA-G20',  'Hybrid', 3, 9.999,  13.300, 3, 3, '3 Phase 3MPPT', ARRAY['ACT','NSW']::text[], 35, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('gw15k-eta-g20',     'GW15K-ETA-G20',     'GoodWe', 'GW15K-ETA-G20',     'Hybrid', 3, 15.000, 19.950, 3, 3, '3 Phase 3MPPT', ARRAY['ACT','NSW']::text[], 36, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
