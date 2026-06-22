-- Seed Main Extras into ExtraProduct (idempotent on id).
-- updatedAt has no DB default (Prisma sets @updatedAt at app level), so set it here.
INSERT INTO "ExtraProduct" ("id", "itemName", "category", "unit", "unitPrice", "notes", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('tilt',        'Tilt Panel',                            'Main Extras', 'Per Panel',   40.00,   '+$200 for extra labour & material',            1,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cliplock',    'Clip Lock Roof',                        'Main Extras', 'Per Panel',   22.00,   NULL,                                           2,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('split',       'Split Array',                           'Main Extras', 'Per Split',   150.00,  'No free split',                                3,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('optimiser',   'Optimiser',                             'Main Extras', 'Per Panel',   95.00,   NULL,                                           4,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('removal',     'System Removal',                        'Main Extras', 'Per Panel',   80.00,   NULL,                                           5,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('hwremoval',   'Hot Water / Pool System Removal',       'Main Extras', 'Per System',  500.00,  NULL,                                           6,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('terracotta',  'Terracotta Tiles',                      'Main Extras', 'Per Job',     250.00,  NULL,                                           7,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('doublestory', 'Double Story',                          'Main Extras', 'Per Unit',    350.00,  NULL,                                           8,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('mainswitch',  'Main Switch',                           'Main Extras', 'Per Unit',    200.00,  NULL,                                           9,  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('steeproof',   'Steep Roof',                            'Main Extras', 'Per Job',     1000.00, 'Unless advised otherwise',                     10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('sbmajor',     'Switchboard Upgrade (Major)',           'Main Extras', 'Per Meter',   2000.00, 'Unless advised otherwise',                     11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('sbminor',     'Switchboard Upgrade (Minor)',           'Main Extras', 'Per Meter',   1000.00, 'Unless advised otherwise',                     12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('extrainv',    'Goodwe 5kW Extra Inverter (1ph)',       'Main Extras', 'Per System',  1000.00, NULL,                                           13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('invcanopy',   'Inverter Canopy',                       'Main Extras', 'Per Unit',    200.00,  'If no shed available',                         14, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('bdcert',      'Technical Assessment / BD Certificate', 'Main Extras', 'Per Install', 1350.00, NULL,                                           15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('smartmeter',  'Smart Meter / Export Limiter (1ph)',    'Main Extras', 'Per Unit',    350.00,  NULL,                                           16, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ctmeter2ph',  'CT Meter (2 Phase)',                    'Main Extras', 'Per Unit',    220.00,  NULL,                                           17, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ctmeter3ph',  'CT Meter (3 Phase)',                    'Main Extras', 'Per Unit',    340.00,  NULL,                                           18, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('landscape',   'Landscape Panel',                       'Main Extras', 'Per Panel',   20.00,   NULL,                                           19, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('scissorlift', 'Scissor Lift',                          'Main Extras', 'Per Day',     700.00,  'Plus travel — quote per job',                  20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('travelkm',    'Travel (per km)',                       'Main Extras', 'Per KM',      1.50,    'ACT: after 70km from CBD. TAS: all km. Both ways.', 21, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('3phase',      '3 Phase Extra',                         'Main Extras', 'Per Install', 1000.00, NULL,                                           22, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('3stringinv',  '3 String 5kW Inverter Add',             'Main Extras', 'Per Unit',    200.00,  NULL,                                           23, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('sungrow5',    'Sungrow 1ph Upgrade — 5kW',             'Main Extras', 'Per Unit',    671.00,  NULL,                                           24, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('sungrow8',    'Sungrow 1ph Upgrade — 8kW',             'Main Extras', 'Per Unit',    431.00,  NULL,                                           25, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('sungrow10',   'Sungrow 1ph Upgrade — 10kW',            'Main Extras', 'Per Unit',    550.00,  NULL,                                           26, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
