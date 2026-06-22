-- Add SolaX hybrid inverters (TAS). Idempotent on id.
-- updatedAt has no DB default (Prisma sets @updatedAt at app level), so set it here.
INSERT INTO "InverterProduct"
  ("id", "productName", "brand", "inverterModel", "type", "phase", "systemSize", "maxPVArray", "mppt", "strings", "notes", "states", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('x1-hybrid-5-0-d',  'X1-HYBRID-5.0-D',  'SolaX', 'X1-HYBRID-5.0-D',  'Hybrid', 1, 5.000,  6.600,  2, 2, NULL, ARRAY['TAS']::text[], 43, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('x1-hybrid-7-5-d',  'X1-HYBRID-7.5-D',  'SolaX', 'X1-HYBRID-7.5-D',  'Hybrid', 1, 7.500,  9.975,  2, 2, NULL, ARRAY['TAS']::text[], 44, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('x1-vast-8k',       'X1-VAST-8K',       'SolaX', 'X1-VAST-8K',       'Hybrid', 1, 8.000,  10.640, 4, 4, NULL, ARRAY['TAS']::text[], 45, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('x1-vast-10k',      'X1-VAST-10K',      'SolaX', 'X1-VAST-10K',      'Hybrid', 1, 10.000, 13.300, 4, 4, NULL, ARRAY['TAS']::text[], 46, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('x3-hybrid-5-0-d',  'X3-HYBRID-5.0-D',  'SolaX', 'X3-HYBRID-5.0-D',  'Hybrid', 3, 5.000,  6.600,  2, 2, NULL, ARRAY['TAS']::text[], 47, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('x3-hybrid-8-0-d',  'X3-HYBRID-8.0-D',  'SolaX', 'X3-HYBRID-8.0-D',  'Hybrid', 3, 8.000,  10.640, 2, 3, NULL, ARRAY['TAS']::text[], 48, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('x3-hybrid-10-0-d', 'X3-HYBRID-10.0-D', 'SolaX', 'X3-HYBRID-10.0-D', 'Hybrid', 3, 10.000, 13.300, 2, 3, NULL, ARRAY['TAS']::text[], 49, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('x3-hybrid-15-0d',  'X3-HYBRID-15.0D',  'SolaX', 'X3-HYBRID-15.0D',  'Hybrid', 3, 15.000, 19.950, 2, 3, NULL, ARRAY['TAS']::text[], 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('solax-x3-ult-20kp','SOLAX-X3-ULT-20KP','SolaX', 'SOLAX-X3-ULT-20KP','Hybrid', 3, 20.000, 26.600, 3, 6, NULL, ARRAY['TAS']::text[], 51, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
