-- Add Fox ESS hybrid inverters (ACT/NSW). Idempotent on id.
-- updatedAt has no DB default (Prisma sets @updatedAt at app level), so set it here.
INSERT INTO "InverterProduct"
  ("id", "productName", "brand", "inverterModel", "type", "phase", "systemSize", "maxPVArray", "mppt", "strings", "notes", "states", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('h3-5-0-smart',  'H3-5.0-Smart',  'Fox ESS', 'H3-5.0-Smart',  'Hybrid', 3, 5.000,  6.600,  3, 3, NULL, ARRAY['ACT','NSW']::text[], 37, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('h3-10-0-smart', 'H3-10.0-Smart', 'Fox ESS', 'H3-10.0-Smart', 'Hybrid', 3, 10.000, 13.300, 3, 3, NULL, ARRAY['ACT','NSW']::text[], 38, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('h3-15-0-smart', 'H3-15.0-Smart', 'Fox ESS', 'H3-15.0-Smart', 'Hybrid', 3, 15.000, 19.950, 3, 3, NULL, ARRAY['ACT','NSW']::text[], 39, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('h1-5-0-e-g2',   'H1-5.0-E-G2',   'Fox ESS', 'H1-5.0-E-G2',   'Hybrid', 1, 5.000,  6.600,  2, 2, NULL, ARRAY['ACT','NSW']::text[], 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('kh8',           'KH8',           'Fox ESS', 'KH8',           'Hybrid', 1, 8.000,  10.640, 3, 3, NULL, ARRAY['ACT','NSW']::text[], 41, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('kh10',          'KH10',          'Fox ESS', 'KH10',          'Hybrid', 1, 10.000, 13.300, 4, 4, NULL, ARRAY['ACT','NSW']::text[], 42, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
