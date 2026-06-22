-- Seed Battery Extras into ExtraProduct (idempotent on id).
-- updatedAt has no DB default (Prisma sets @updatedAt at app level), so set it here.
INSERT INTO "ExtraProduct" ("id", "itemName", "category", "unit", "unitPrice", "notes", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('batt_cable_10_20',     'Battery Cabling 10–20m',            'Battery Extras', 'Per Install', 380.00,  NULL,                                              31, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('batt_cable_20_30',     'Battery Cabling 20–30m',            'Battery Extras', 'Per Install', 480.00,  NULL,                                              32, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('batt_fireproof',       'Supply & Install Fireproofing',     'Battery Extras', 'Per Install', 475.00,  NULL,                                              33, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('batt_smoke_alarm',     'Supply & Install Smoke Alarm',      'Battery Extras', 'Per Install', 300.00,  NULL,                                              34, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('batt_bollard',         'Supply & Install Bollard',          'Battery Extras', 'Per Install', 150.00,  NULL,                                              35, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('batt_paver',           'Supply & Install Paver',            'Battery Extras', 'Per Install', 150.00,  NULL,                                              36, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('batt_existing_hybrid', 'Existing Hybrid Inverter On-site',  'Battery Extras', 'Per Install', 250.00,  NULL,                                              37, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('batt_covers',          'Battery Covers',                    'Battery Extras', 'Per Install', 1000.00, NULL,                                              38, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('batt_junction_box',    'Junction Box (Hybrid Swap)',        'Battery Extras', 'Per Install', 250.00,  'Required when swapping inverter for hybrid',      39, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('batt_country_150',     'Battery Country Surcharge (150km+)', 'Battery Extras', 'Per Install', 600.00,  NULL,                                              40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
