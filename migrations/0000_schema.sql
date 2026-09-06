CREATE TABLE "absence_spans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"unit_id" text NOT NULL,
	"status" text NOT NULL,
	"sub_type" text,
	"start_date" date NOT NULL,
	"end_date" date,
	"remark" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"superseded_at" timestamp with time zone,
	"superseded_by" uuid,
	CONSTRAINT "absence_spans_status_check" CHECK ("absence_spans"."status" in ('MC', 'LL', 'MA', 'RSI', 'OTHERS')),
	CONSTRAINT "absence_spans_sub_type_check" CHECK (("absence_spans"."status" = 'OTHERS' and "absence_spans"."sub_type" in ('ATTACHED_OUT', 'COURSE', 'OUTFIELD', 'DUTY')) or ("absence_spans"."status" <> 'OTHERS' and "absence_spans"."sub_type" is null)),
	CONSTRAINT "absence_spans_dates_check" CHECK ("absence_spans"."end_date" is null or "absence_spans"."end_date" >= "absence_spans"."start_date"),
	CONSTRAINT "absence_spans_rsi_single_day_check" CHECK ("absence_spans"."status" <> 'RSI' or "absence_spans"."end_date" = "absence_spans"."start_date"),
	CONSTRAINT "absence_spans_superseded_check" CHECK (("absence_spans"."superseded_at" is null and "absence_spans"."superseded_by" is null) or ("absence_spans"."superseded_at" is not null and "absence_spans"."superseded_by" is not null))
);
--> statement-breakpoint
CREATE TABLE "date_unlocks" (
	"date" date PRIMARY KEY NOT NULL,
	"unlocked_by" uuid NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"type" text NOT NULL,
	"name" text,
	"cutoff_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "events_type_check" CHECK ("events"."type" in ('AM', 'PM', 'ADHOC')),
	CONSTRAINT "events_name_check" CHECK (("events"."type" = 'ADHOC' and "events"."name" is not null) or ("events"."type" <> 'ADHOC' and "events"."name" is null))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"unit_id" text NOT NULL,
	"event_id" text NOT NULL,
	"submission_id" uuid,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "notifications_type_check" CHECK ("notifications"."type" in ('SUBMITTED', 'RESUBMITTED', 'LATE'))
);
--> statement-breakpoint
CREATE TABLE "personnel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" text NOT NULL,
	"rank" text NOT NULL,
	"name" text NOT NULL,
	"service_no" text,
	"posted_in_date" date NOT NULL,
	"posted_out_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personnel_posting_check" CHECK ("personnel"."posted_out_date" is null or "personnel"."posted_out_date" > "personnel"."posted_in_date")
);
--> statement-breakpoint
CREATE TABLE "present_marks" (
	"event_id" text NOT NULL,
	"person_id" uuid NOT NULL,
	"unit_id" text NOT NULL,
	"marked_by" uuid NOT NULL,
	"marked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "present_marks_event_id_person_id_pk" PRIMARY KEY("event_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"role" text NOT NULL,
	"unit_id" text,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_role_check" CHECK ("profiles"."role" in ('ADMIN', 'COMMANDER')),
	CONSTRAINT "profiles_role_unit_check" CHECK (("profiles"."role" = 'COMMANDER' and "profiles"."unit_id" is not null) or ("profiles"."role" = 'ADMIN' and "profiles"."unit_id" is null))
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"cutoff_am" text DEFAULT '10:00' NOT NULL,
	"cutoff_pm" text DEFAULT '14:00' NOT NULL,
	"demo_now" timestamp with time zone,
	"last_cron_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "settings_singleton_check" CHECK ("settings"."id" = 1),
	CONSTRAINT "settings_cutoff_am_check" CHECK ("settings"."cutoff_am" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "settings_cutoff_pm_check" CHECK ("settings"."cutoff_pm" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" text NOT NULL,
	"event_id" text NOT NULL,
	"version" integer NOT NULL,
	"submitted_by" uuid NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"content_hash" text NOT NULL,
	"counts" jsonb NOT NULL,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "submissions_version_check" CHECK ("submissions"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "unit_event_state" (
	"unit_id" text NOT NULL,
	"event_id" text NOT NULL,
	"first_changed_at" timestamp with time zone NOT NULL,
	"last_changed_at" timestamp with time zone NOT NULL,
	"last_changed_by" uuid NOT NULL,
	CONSTRAINT "unit_event_state_unit_id_event_id_pk" PRIMARY KEY("unit_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "absence_spans" ADD CONSTRAINT "absence_spans_person_id_personnel_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."personnel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absence_spans" ADD CONSTRAINT "absence_spans_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absence_spans" ADD CONSTRAINT "absence_spans_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "absence_spans" ADD CONSTRAINT "absence_spans_superseded_by_profiles_id_fk" FOREIGN KEY ("superseded_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "date_unlocks" ADD CONSTRAINT "date_unlocks_unlocked_by_profiles_id_fk" FOREIGN KEY ("unlocked_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personnel" ADD CONSTRAINT "personnel_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "present_marks" ADD CONSTRAINT "present_marks_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "present_marks" ADD CONSTRAINT "present_marks_person_id_personnel_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."personnel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "present_marks" ADD CONSTRAINT "present_marks_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "present_marks" ADD CONSTRAINT "present_marks_marked_by_profiles_id_fk" FOREIGN KEY ("marked_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_submitted_by_profiles_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_event_state" ADD CONSTRAINT "unit_event_state_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_event_state" ADD CONSTRAINT "unit_event_state_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_event_state" ADD CONSTRAINT "unit_event_state_last_changed_by_profiles_id_fk" FOREIGN KEY ("last_changed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "absence_spans_person_active_idx" ON "absence_spans" USING btree ("person_id") WHERE "absence_spans"."superseded_at" is null;--> statement-breakpoint
CREATE INDEX "absence_spans_unit_dates_idx" ON "absence_spans" USING btree ("unit_id","start_date","end_date") WHERE "absence_spans"."superseded_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "events_date_parade_key" ON "events" USING btree ("date","type") WHERE "events"."type" in ('AM', 'PM');--> statement-breakpoint
CREATE INDEX "events_date_idx" ON "events" USING btree ("date");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id") WHERE "notifications"."read_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_late_once_key" ON "notifications" USING btree ("user_id","unit_id","event_id") WHERE "notifications"."type" = 'LATE';--> statement-breakpoint
CREATE INDEX "personnel_unit_idx" ON "personnel" USING btree ("unit_id","posted_in_date","posted_out_date");--> statement-breakpoint
CREATE INDEX "present_marks_unit_event_idx" ON "present_marks" USING btree ("unit_id","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_email_key" ON "profiles" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "profiles_unit_idx" ON "profiles" USING btree ("unit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_unit_event_version_key" ON "submissions" USING btree ("unit_id","event_id","version");--> statement-breakpoint
CREATE INDEX "unit_event_state_event_idx" ON "unit_event_state" USING btree ("event_id");