INSERT INTO "units" ("id", "name", "sort_order") VALUES
  ('S1', 'S1', 1),
  ('S2', 'S2', 2),
  ('S3', 'S3', 3),
  ('S4', 'S4', 4),
  ('SSP', 'SSP', 5),
  ('COY1', 'Coy 1', 6),
  ('COY2', 'Coy 2', 7),
  ('ISR', 'ISR Coy', 8)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "app_settings" ("key", "value") VALUES ('cutoff_am', '10:00'), ('cutoff_pm', '14:00')
ON CONFLICT ("key") DO NOTHING;
