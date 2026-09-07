-- Accounts sign in with a username. Existing accounts take the part of their email before the @.
ALTER TABLE "profiles" ADD COLUMN "username" text;--> statement-breakpoint
UPDATE "profiles" SET "username" = lower(split_part("email", '@', 1)) WHERE "username" IS NULL;--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "username" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_username_idx" ON "profiles" USING btree ("username");--> statement-breakpoint
-- CO Office is the first Branch/Coy of 15C4I Battalion.
INSERT INTO "units" ("id", "name", "sort_order") VALUES ('CO', 'CO Office', 0) ON CONFLICT ("id") DO NOTHING;
