-- Add GoodWe SBP + Sungrow SH hybrid inverters. The Sungrow SH models were
-- supplied once for ACT/NSW and again for TAS; they are the same product, so
-- each is a single row covering all three states (mirrors the earlier SG/TAS
-- merge). MPPT/Strings were blank in source -> NULL; phase/MPPT detail kept in notes.
-- updatedAt has no DB default (Prisma sets @updatedAt at app level), so set it here.
INSERT INTO "InverterProduct"
  ("id", "productName", "brand", "inverterModel", "type", "phase", "systemSize", "maxPVArray", "mppt", "strings", "notes", "states", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('gw5000s-sbp', 'GW5000S-SBP', 'GoodWe',  'GW5000S-SBP', 'Hybrid', 1, 5.000,  6.600,  NULL, NULL, '1 Phase',        ARRAY['ACT','NSW']::text[],       52, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('sh5-0rs-ada', 'SH5.0RS-ADA', 'Sungrow', 'SH5.0RS-ADA', 'Hybrid', 1, 5.000,  6.600,  NULL, NULL, '1 Phase 2MPPT',  ARRAY['ACT','NSW','TAS']::text[], 53, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('sh8-0rs-ada', 'SH8.0RS-ADA', 'Sungrow', 'SH8.0RS-ADA', 'Hybrid', 1, 8.000,  10.640, NULL, NULL, '1 Phase 4MPPT',  ARRAY['ACT','NSW','TAS']::text[], 54, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('sh10rs',      'SH10RS',      'Sungrow', 'SH10RS',      'Hybrid', 1, 10.000, 13.300, NULL, NULL, '1 Phase 4MPPT',  ARRAY['ACT','NSW','TAS']::text[], 55, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('sh5-0rt',     'SH5.0RT',     'Sungrow', 'SH5.0RT',     'Hybrid', 3, 5.000,  6.600,  NULL, NULL, '3 Phase 2MPPT',  ARRAY['ACT','NSW','TAS']::text[], 56, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('sh10-0rt',    'SH10.0RT',    'Sungrow', 'SH10.0RT',    'Hybrid', 3, 10.000, 13.300, NULL, NULL, NULL,             ARRAY['ACT','NSW','TAS']::text[], 57, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('sh15-0rt',    'SH15.0RT',    'Sungrow', 'SH15.0RT',    'Hybrid', 3, 15.000, 19.950, NULL, NULL, NULL,             ARRAY['ACT','NSW','TAS']::text[], 58, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('sh20-0rt',    'SH20.0RT',    'Sungrow', 'SH20.0RT',    'Hybrid', 3, 20.000, 26.600, NULL, NULL, NULL,             ARRAY['ACT','NSW','TAS']::text[], 59, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('sh25-0rt',    'SH25.0RT',    'Sungrow', 'SH25.0RT',    'Hybrid', 3, 25.000, 33.250, NULL, NULL, NULL,             ARRAY['ACT','NSW','TAS']::text[], 60, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
