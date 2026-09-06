CREATE TYPE "public"."absence_status" AS ENUM('MC', 'LL', 'MA', 'RSI', 'OTHERS');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('AM', 'PM', 'ADHOC');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('SUBMITTED', 'RESUBMITTED', 'LATE');--> statement-breakpoint
CREATE TYPE "public"."others_sub_type" AS ENUM('ATTACHED_OUT', 'COURSE', 'OUTFIELD', 'DUTY');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('ADMIN', 'COMMANDER');--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "date_unlocks" (
	"date" date PRIMARY KEY NOT NULL,
	"unlocked_by" uuid NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_marks" (
	"event_id" text NOT NULL,
	"person_id" uuid NOT NULL,
	"unit_id" text NOT NULL,
	"marked_by" uuid NOT NULL,
	"marked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_marks_event_id_person_id_pk" PRIMARY KEY("event_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"type" "event_type" NOT NULL,
	"name" text,
	"cutoff_at" timestamp with time zone NOT NULL,
	"unit_id" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_adhoc_named" CHECK ("events"."type" <> 'ADHOC' OR "events"."name" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"unit_id" text NOT NULL,
	"event_id" text NOT NULL,
	"submission_id" uuid,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
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
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personnel_posting_order" CHECK ("personnel"."posted_out_date" IS NULL OR "personnel"."posted_out_date" >= "personnel"."posted_in_date")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"role" "role" NOT NULL,
	"unit_id" text,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_commander_has_unit" CHECK ("profiles"."role" <> 'COMMANDER' OR "profiles"."unit_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "status_spans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"unit_id" text NOT NULL,
	"status" "absence_status" NOT NULL,
	"sub_type" "others_sub_type",
	"start_date" date NOT NULL,
	"end_date" date,
	"remark" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	"superseded_by" uuid,
	"replaces_id" uuid,
	CONSTRAINT "spans_rsi_single_day" CHECK ("status_spans"."status" <> 'RSI' OR "status_spans"."end_date" = "status_spans"."start_date"),
	CONSTRAINT "spans_others_sub_type" CHECK ("status_spans"."status" <> 'OTHERS' OR "status_spans"."sub_type" IS NOT NULL),
	CONSTRAINT "spans_date_order" CHECK ("status_spans"."end_date" IS NULL OR "status_spans"."end_date" >= "status_spans"."start_date")
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
	"snapshot" jsonb NOT NULL
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
ALTER TABLE "event_marks" ADD CONSTRAINT "event_marks_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_marks" ADD CONSTRAINT "event_marks_person_id_personnel_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."personnel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_marks" ADD CONSTRAINT "event_marks_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personnel" ADD CONSTRAINT "personnel_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_spans" ADD CONSTRAINT "status_spans_person_id_personnel_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."personnel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_spans" ADD CONSTRAINT "status_spans_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_event_state" ADD CONSTRAINT "unit_event_state_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_event_state" ADD CONSTRAINT "unit_event_state_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_marks_unit_idx" ON "event_marks" USING btree ("event_id","unit_id");--> statement-breakpoint
CREATE INDEX "events_date_idx" ON "events" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "events_standard_unique" ON "events" USING btree ("date","type") WHERE "events"."type" IN ('AM', 'PM');--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_late_once" ON "notifications" USING btree ("user_id","unit_id","event_id") WHERE "notifications"."type" = 'LATE';--> statement-breakpoint
CREATE INDEX "personnel_unit_idx" ON "personnel" USING btree ("unit_id","posted_out_date");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_email_idx" ON "profiles" USING btree ("email");--> statement-breakpoint
CREATE INDEX "spans_unit_active_idx" ON "status_spans" USING btree ("unit_id","superseded_at","start_date");--> statement-breakpoint
CREATE INDEX "spans_person_active_idx" ON "status_spans" USING btree ("person_id","superseded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_version_unique" ON "submissions" USING btree ("unit_id","event_id","version");--> statement-breakpoint
CREATE INDEX "submissions_event_idx" ON "submissions" USING btree ("event_id","unit_id");