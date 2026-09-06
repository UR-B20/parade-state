CREATE TABLE "platoons" (
	"id" text PRIMARY KEY NOT NULL,
	"unit_id" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personnel" ADD COLUMN "platoon_id" text;--> statement-breakpoint
ALTER TABLE "platoons" ADD CONSTRAINT "platoons_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platoons_unit_idx" ON "platoons" USING btree ("unit_id","sort_order");--> statement-breakpoint
ALTER TABLE "personnel" ADD CONSTRAINT "personnel_platoon_id_platoons_id_fk" FOREIGN KEY ("platoon_id") REFERENCES "public"."platoons"("id") ON DELETE no action ON UPDATE no action;