ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
SELECT set_config('ozvi.system', 'on', true);--> statement-breakpoint
UPDATE "users" SET "email_verified" = true WHERE "external_id" LIKE 'email:%';--> statement-breakpoint
SELECT set_config('ozvi.system', '', true);
