-- Add SolaX inverters (TAS) and extend the existing Sungrow rows to cover TAS.
-- updatedAt has no DB default (Prisma sets @updatedAt at app level), so set it here.

-- 1) New SolaX products (TAS). Idempotent on id.
INSERT INTO "InverterProduct"
  ("id", "productName", "brand", "inverterModel", "type", "phase", "systemSize", "maxPVArray", "mppt", "strings", "notes", "states", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('x1-boost-5k-g4', 'X1-BOOST-5K-G4', 'SolaX', 'X1-BOOST-5K-G4', 'Grid Tied', 1, 5.000,  6.600,  2, 2, 'Comes with CT - No extra cost - No extra spaces required in swicthboard it goes at the back of switchboard', ARRAY['TAS']::text[], 15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('x1-smt-5k-g2',   'X1-SMT-5K-G2',   'SolaX', 'X1-SMT-5K-G2',   'Grid Tied', 1, 5.000,  6.600,  3, 3, 'Comes with CT - No extra cost - No extra spaces required in swicthboard it goes at the back of switchboard', ARRAY['TAS']::text[], 16, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('x1-smt-6k-g2',   'X1-SMT-6K-G2',   'SolaX', 'X1-SMT-6K-G2',   'Grid Tied', 1, 6.000,  7.980,  3, 3, 'Comes with CT - No extra cost - No extra spaces required in swicthboard it goes at the back of switchboard', ARRAY['TAS']::text[], 17, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('x1-smt-7k-g2',   'X1-SMT-7K-G2',   'SolaX', 'X1-SMT-7K-G2',   'Grid Tied', 1, 7.000,  9.300,  3, 3, 'Comes with CT - No extra cost - No extra spaces required in swicthboard it goes at the back of switchboard', ARRAY['TAS']::text[], 18, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('x1-smt-8k-g2',   'X1-SMT-8K-G2',   'SolaX', 'X1-SMT-8K-G2',   'Grid Tied', 1, 8.000,  10.640, 3, 3, 'Comes with CT - No extra cost - No extra spaces required in swicthboard it goes at the back of switchboard', ARRAY['TAS']::text[], 19, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('x1-smt-9k-g2',   'X1-SMT-9K-G2',   'SolaX', 'X1-SMT-9K-G2',   'Grid Tied', 1, 9.000,  11.970, 3, 3, 'Comes with CT - No extra cost - No extra spaces required in swicthboard it goes at the back of switchboard', ARRAY['TAS']::text[], 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('x1-smt-10k-g2',  'X1-SMT-10K-G2',  'SolaX', 'X1-SMT-10K-G2',  'Grid Tied', 1, 10.000, 13.300, 3, 3, 'Comes with CT - No extra cost - No extra spaces required in swicthboard it goes at the back of switchboard', ARRAY['TAS']::text[], 21, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('x3-mic-5k-g2',   'X3-MIC-5K-G2',   'SolaX', 'X3-MIC-5K-G2',   'Grid Tied', 3, 5.000,  6.600,  2, 2, 'DTSU666-CT - Add $350', ARRAY['TAS']::text[], 22, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('x3-pro-8k-g2',   'X3-PRO-8K-G2',   'SolaX', 'X3-PRO-8K-G2',   'Grid Tied', 3, 8.000,  10.640, 2, 4, 'DTSU666-CT - Add $350', ARRAY['TAS']::text[], 23, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('x3-pro-10k-g2',  'X3-PRO-10K-G2',  'SolaX', 'X3-PRO-10K-G2',  'Grid Tied', 3, 10.000, 13.300, 2, 4, 'DTSU666-CT - Add $350', ARRAY['TAS']::text[], 24, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('x3-pro-15k-g2',  'X3-PRO-15K-G2',  'SolaX', 'X3-PRO-15K-G2',  'Grid Tied', 3, 15.000, 19.950, 2, 4, 'DTSU666-CT - Add $350', ARRAY['TAS']::text[], 25, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- 2) Extend existing Sungrow rows (already ACT/NSW) to also cover TAS.
--    Same products, so add the state rather than duplicate the row. Idempotent.
UPDATE "InverterProduct"
SET "states" = ARRAY(SELECT DISTINCT unnest("states" || ARRAY['TAS']::text[])),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" IN ('sg8-0rs', 'sg10rs', 'sg5-0rt', 'sg10rt');
