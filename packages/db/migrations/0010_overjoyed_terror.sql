ALTER TABLE "projects" DROP CONSTRAINT "projects_custom_domain_unique";--> statement-breakpoint
ALTER TABLE "login_codes" ADD COLUMN "purpose" text DEFAULT 'login' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "creem_event_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_custom_domain_verified" ON "projects" USING btree ("custom_domain") WHERE "projects"."custom_domain_verified_at" is not null;