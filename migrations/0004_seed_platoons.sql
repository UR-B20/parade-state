INSERT INTO "platoons" ("id", "unit_id", "name", "sort_order") VALUES
  ('COY1-HQ', 'COY1', 'Coy HQ', 0), ('COY1-P1', 'COY1', 'Platoon 1', 1), ('COY1-P2', 'COY1', 'Platoon 2', 2), ('COY1-P3', 'COY1', 'Platoon 3', 3),
  ('COY2-HQ', 'COY2', 'Coy HQ', 0), ('COY2-P1', 'COY2', 'Platoon 1', 1), ('COY2-P2', 'COY2', 'Platoon 2', 2), ('COY2-P3', 'COY2', 'Platoon 3', 3),
  ('ISR-HQ', 'ISR', 'Coy HQ', 0), ('ISR-P1', 'ISR', 'Platoon 1', 1), ('ISR-P2', 'ISR', 'Platoon 2', 2)
ON CONFLICT ("id") DO NOTHING;
