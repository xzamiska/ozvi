CREATE TYPE "public"."email_status" AS ENUM('queued', 'sent', 'deferred', 'digested', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid,
	"to" text NOT NULL,
	"kind" text NOT NULL,
	"subject" text NOT NULL,
	"summary" text NOT NULL,
	"html" text NOT NULL,
	"text" text NOT NULL,
	"status" "email_status" DEFAULT 'queued' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"last_error" text,
	"send_after" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "name" text DEFAULT 'subor' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "allowed_origins" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_opt_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "emails_queue" ON "emails" USING btree ("status","send_after");--> statement-breakpoint
CREATE INDEX "emails_quota" ON "emails" USING btree ("project_id","sent_at");