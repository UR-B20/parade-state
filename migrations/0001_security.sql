-- Security and integrity that drizzle-kit cannot express from the schema file:
-- the link to Supabase Auth, row level security, triggers, the settings row and Realtime.
--
-- Write access is never granted to the client roles. The Worker writes with the service role,
-- which bypasses row level security, and enforces authorisation in code. The policies below
-- only shape what a signed-in client may read directly from Supabase (Realtime and PostgREST).

-- 1. Link profiles to Supabase Auth. Deleting an auth user removes their profile.
ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_id_auth_users_fk"
  FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade;
--> statement-breakpoint

-- 2. Helpers that read the caller's profile. SECURITY DEFINER so they work inside policies
--    on the profiles table itself without recursion.
CREATE SCHEMA IF NOT EXISTS "app";
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "app"."is_admin"() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM "profiles" WHERE "id" = auth.uid() AND "role" = 'ADMIN' AND "is_active"
  );
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "app"."user_unit"() RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT "unit_id" FROM "profiles" WHERE "id" = auth.uid() AND "is_active";
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "app"."is_admin"() FROM public;
--> statement-breakpoint
REVOKE ALL ON FUNCTION "app"."user_unit"() FROM public;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "app"."is_admin"() TO authenticated, service_role;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "app"."user_unit"() TO authenticated, service_role;
--> statement-breakpoint
GRANT USAGE ON SCHEMA "app" TO authenticated, service_role;
--> statement-breakpoint

-- 3. Row level security on every table. Nothing is readable by anon; authenticated users
--    read what their role allows; no client role can write.
ALTER TABLE "units" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "personnel" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "absence_spans" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "present_marks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "unit_event_state" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "submissions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "date_unlocks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

GRANT SELECT ON "units", "profiles", "personnel", "absence_spans", "events", "present_marks",
  "unit_event_state", "submissions", "notifications", "settings", "date_unlocks" TO authenticated;
--> statement-breakpoint
GRANT ALL ON "units", "profiles", "personnel", "absence_spans", "events", "present_marks",
  "unit_event_state", "submissions", "notifications", "settings", "date_unlocks" TO service_role;
--> statement-breakpoint

CREATE POLICY "units_read" ON "units" FOR SELECT TO authenticated USING (true);
--> statement-breakpoint
CREATE POLICY "events_read" ON "events" FOR SELECT TO authenticated USING (true);
--> statement-breakpoint
CREATE POLICY "settings_read" ON "settings" FOR SELECT TO authenticated USING (true);
--> statement-breakpoint
CREATE POLICY "date_unlocks_read" ON "date_unlocks" FOR SELECT TO authenticated USING (true);
--> statement-breakpoint
CREATE POLICY "profiles_read" ON "profiles" FOR SELECT TO authenticated
  USING ("id" = auth.uid() OR app.is_admin());
--> statement-breakpoint
CREATE POLICY "personnel_read" ON "personnel" FOR SELECT TO authenticated
  USING (app.is_admin() OR "unit_id" = app.user_unit());
--> statement-breakpoint
CREATE POLICY "absence_spans_read" ON "absence_spans" FOR SELECT TO authenticated
  USING (app.is_admin() OR "unit_id" = app.user_unit());
--> statement-breakpoint
CREATE POLICY "present_marks_read" ON "present_marks" FOR SELECT TO authenticated
  USING (app.is_admin() OR "unit_id" = app.user_unit());
--> statement-breakpoint
CREATE POLICY "unit_event_state_read" ON "unit_event_state" FOR SELECT TO authenticated
  USING (app.is_admin() OR "unit_id" = app.user_unit());
--> statement-breakpoint
CREATE POLICY "submissions_read" ON "submissions" FOR SELECT TO authenticated
  USING (app.is_admin() OR "unit_id" = app.user_unit());
--> statement-breakpoint
CREATE POLICY "notifications_read" ON "notifications" FOR SELECT TO authenticated
  USING ("user_id" = auth.uid());
--> statement-breakpoint

-- 4. Integrity triggers.
CREATE OR REPLACE FUNCTION "app"."set_updated_at"() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  NEW."updated_at" = now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "personnel_set_updated_at" BEFORE UPDATE ON "personnel"
  FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "settings_set_updated_at" BEFORE UPDATE ON "settings"
  FOR EACH ROW EXECUTE FUNCTION "app"."set_updated_at"();
--> statement-breakpoint

-- Absence spans are append-only: the only permitted update is marking a span superseded, once.
CREATE OR REPLACE FUNCTION "app"."absence_spans_append_only"() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."superseded_at" IS NOT NULL THEN
    RAISE EXCEPTION 'absence span % is already superseded', OLD."id" USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."person_id" IS DISTINCT FROM OLD."person_id"
    OR NEW."unit_id" IS DISTINCT FROM OLD."unit_id"
    OR NEW."status" IS DISTINCT FROM OLD."status"
    OR NEW."sub_type" IS DISTINCT FROM OLD."sub_type"
    OR NEW."start_date" IS DISTINCT FROM OLD."start_date"
    OR NEW."end_date" IS DISTINCT FROM OLD."end_date"
    OR NEW."remark" IS DISTINCT FROM OLD."remark"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
    OR NEW."created_by" IS DISTINCT FROM OLD."created_by"
  THEN
    RAISE EXCEPTION 'absence spans are append-only; write a new span instead of editing %', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "absence_spans_append_only" BEFORE UPDATE ON "absence_spans"
  FOR EACH ROW EXECUTE FUNCTION "app"."absence_spans_append_only"();
--> statement-breakpoint

-- Submissions are immutable once written.
CREATE OR REPLACE FUNCTION "app"."reject_change"() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "submissions_immutable" BEFORE UPDATE ON "submissions"
  FOR EACH ROW EXECUTE FUNCTION "app"."reject_change"();
--> statement-breakpoint

-- 5. The single settings row exists from the start.
INSERT INTO "settings" ("id") VALUES (1) ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- 6. Realtime: the S1 dashboard listens to these tables. The publication exists on Supabase;
--    on a plain Postgres (tests) there is nothing to do.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE "submissions", "unit_event_state", "notifications";
  END IF;
END
$$;
