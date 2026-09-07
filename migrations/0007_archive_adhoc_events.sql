-- S1 can archive an ad hoc event; it disappears from every event picker but keeps its data.
ALTER TABLE "events" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "archived_by" uuid;
