ALTER TABLE "oauth_clients" DROP CONSTRAINT "oauth_clients_client_id_unique";--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "deleted_by_id" uuid;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "pending_reason" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "deleted_by_id" uuid;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "delete_reason" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "moderate_ideas" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "vote_mode" text DEFAULT 'simple' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "vote_budget" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "blocked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_deleted_by_id_users_id_fk" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_deleted_by_id_users_id_fk" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_clients_project_client" ON "oauth_clients" USING btree ("project_id","client_id");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_vote_mode" CHECK ("projects"."vote_mode" in ('simple', 'importance'));--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_vote_budget" CHECK ("projects"."vote_budget" is null or "projects"."vote_budget" between 1 and 100);