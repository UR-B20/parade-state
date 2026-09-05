-- Supabase-only wiring: link profiles to auth.users, lock every table behind row-level
-- security (the Worker uses the service role and bypasses it), and expose the two tables the
-- S1 dashboard subscribes to over Realtime. Guarded so the same migration set runs on a plain
-- Postgres (PGlite in tests), where the auth schema does not exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    ALTER TABLE "profiles"
      ADD CONSTRAINT "profiles_auth_user_fk" FOREIGN KEY ("id") REFERENCES auth.users ("id") ON DELETE CASCADE;

    ALTER TABLE "units" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "personnel" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "status_spans" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "event_marks" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "unit_event_state" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "submissions" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "app_settings" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "date_unlocks" ENABLE ROW LEVEL SECURITY;

    -- Signed-in S1 admins may read submissions and unit activity directly; this is what lets
    -- their Realtime subscription receive change events. Everything else goes via the Worker.
    CREATE POLICY "admins_read_submissions" ON "submissions" FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM "profiles" p WHERE p."id" = auth.uid() AND p."role" = 'ADMIN' AND p."is_active"));
    CREATE POLICY "admins_read_unit_event_state" ON "unit_event_state" FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM "profiles" p WHERE p."id" = auth.uid() AND p."role" = 'ADMIN' AND p."is_active"));
    CREATE POLICY "users_read_own_profile" ON "profiles" FOR SELECT TO authenticated
      USING ("id" = auth.uid());

    ALTER PUBLICATION supabase_realtime ADD TABLE "submissions", "unit_event_state";
  END IF;
END $$;
