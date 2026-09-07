-- New absence reasons, half-day LL/OFF, new Others sub-types and the daily Roll Call.
-- New enum values are only referenced as text here: Postgres refuses to use a value added in
-- the same transaction, and the migrator runs every pending migration in one transaction.
ALTER TYPE "public"."absence_status" ADD VALUE IF NOT EXISTS 'OFF';--> statement-breakpoint
ALTER TYPE "public"."absence_status" ADD VALUE IF NOT EXISTS 'RSO';--> statement-breakpoint
ALTER TYPE "public"."absence_status" ADD VALUE IF NOT EXISTS 'HL';--> statement-breakpoint
ALTER TYPE "public"."absence_status" ADD VALUE IF NOT EXISTS 'OL';--> statement-breakpoint
ALTER TYPE "public"."others_sub_type" ADD VALUE IF NOT EXISTS 'VOC';--> statement-breakpoint
ALTER TYPE "public"."others_sub_type" ADD VALUE IF NOT EXISTS 'SOC';--> statement-breakpoint
ALTER TYPE "public"."others_sub_type" ADD VALUE IF NOT EXISTS 'ATP_CS';--> statement-breakpoint
ALTER TYPE "public"."others_sub_type" ADD VALUE IF NOT EXISTS 'MEETING';--> statement-breakpoint
ALTER TYPE "public"."others_sub_type" ADD VALUE IF NOT EXISTS 'STAY_OUT';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE IF NOT EXISTS 'ROLLCALL';--> statement-breakpoint
-- The Roll Call has no cut-off.
ALTER TABLE "events" ALTER COLUMN "cutoff_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_cutoff_required" CHECK ("events"."type"::text = 'ROLLCALL' OR "events"."cutoff_at" IS NOT NULL);--> statement-breakpoint
-- One of each standard event per date; ad hoc events stay unlimited.
DROP INDEX IF EXISTS "events_standard_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "events_standard_unique" ON "events" USING btree ("date","type") WHERE "events"."type" <> 'ADHOC';--> statement-breakpoint
-- Half-day LL or OFF: 'AM' (0800-1200) or 'PM' (1200-1800), always a single day.
ALTER TABLE "status_spans" ADD COLUMN "half_day" text;--> statement-breakpoint
ALTER TABLE "status_spans" DROP CONSTRAINT IF EXISTS "spans_rsi_single_day";--> statement-breakpoint
ALTER TABLE "status_spans" ADD CONSTRAINT "spans_rsi_single_day" CHECK ("status_spans"."status"::text NOT IN ('RSI', 'RSO') OR "status_spans"."end_date" = "status_spans"."start_date");--> statement-breakpoint
ALTER TABLE "status_spans" ADD CONSTRAINT "spans_half_day" CHECK ("status_spans"."half_day" IS NULL OR ("status_spans"."half_day" IN ('AM', 'PM') AND "status_spans"."status"::text IN ('LL', 'OFF') AND "status_spans"."end_date" = "status_spans"."start_date"));
