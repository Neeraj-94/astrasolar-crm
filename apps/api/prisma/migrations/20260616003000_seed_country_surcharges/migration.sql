-- Seed Country Surcharges into ExtraProduct (idempotent on id).
-- updatedAt has no DB default (Prisma sets @updatedAt at app level), so set it here.
INSERT INTO "ExtraProduct" ("id", "itemName", "category", "unit", "unitPrice", "notes", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('country_small', 'Country Job ≤ 6.6kW', 'Country Surcharges', 'Per kW',  80.00,  '$80/kW extra',                 27, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('country_mid',   'Country Job 7–11kW',  'Country Surcharges', 'Per kW',  80.00,  '$80/kW + $250 accommodation',  28, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('country_large', 'Country Job > 11kW',  'Country Surcharges', 'Per kW',  80.00,  '$80/kW + $500 accommodation',  29, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('accommodation', 'Accommodation',       'Country Surcharges', 'Per Day', 500.00, NULL,                           30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
