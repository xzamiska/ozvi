ALTER TABLE "workspaces" ADD COLUMN "plan_source" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "plan_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "plan_note" text;