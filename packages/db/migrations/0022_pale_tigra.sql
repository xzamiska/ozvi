ALTER TYPE "public"."webhook_format" ADD VALUE 'teams';--> statement-breakpoint
ALTER TYPE "public"."webhook_format" ADD VALUE 'discord';--> statement-breakpoint
CREATE TABLE "content_translations" (
	"project_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"source_hash" text NOT NULL,
	"target_locale" text NOT NULL,
	"source_locale" text,
	"title" text,
	"body" text DEFAULT '' NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_translations_subject_id_source_hash_target_locale_pk" PRIMARY KEY("subject_id","source_hash","target_locale"),
	CONSTRAINT "content_translations_subject" CHECK ("content_translations"."subject" in ('item', 'comment', 'changelog'))
);
--> statement-breakpoint
CREATE TABLE "tracker_syncs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"link_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "delivery_status" DEFAULT 'queued' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"last_error" text,
	"send_after" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracker_syncs_kind" CHECK ("tracker_syncs"."kind" in ('status', 'comment'))
);
--> statement-breakpoint
ALTER TABLE "item_links" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "item_links" ADD COLUMN "sync" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "retention_capture_days" integer DEFAULT 180;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "retention_closed_files_days" integer;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "retention_contacts_months" integer;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "retention_run_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "translation_mode" text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "content_translations" ADD CONSTRAINT "content_translations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_syncs" ADD CONSTRAINT "tracker_syncs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_syncs" ADD CONSTRAINT "tracker_syncs_link_id_item_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."item_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_translations_project" ON "content_translations" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "tracker_syncs_queue" ON "tracker_syncs" USING btree ("status","send_after");--> statement-breakpoint
CREATE INDEX "item_links_external" ON "item_links" USING btree ("provider","external_id");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_retention_capture" CHECK ("projects"."retention_capture_days" is null or "projects"."retention_capture_days" in (30, 90, 180, 365));--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_retention_closed_files" CHECK ("projects"."retention_closed_files_days" is null or "projects"."retention_closed_files_days" in (30, 90, 180, 365));--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_translation_mode" CHECK ("projects"."translation_mode" in ('off','on_demand','auto'));--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_retention_contacts" CHECK ("projects"."retention_contacts_months" is null or "projects"."retention_contacts_months" in (6, 12, 24));--> statement-breakpoint
-- Real existing users are never treated as never-signed-in placeholders (retention, compliance agent).
UPDATE users SET last_seen_at = created_at WHERE last_seen_at IS NULL AND NOT (coalesce(traits, '{}'::jsonb) ? 'importedFrom') AND coalesce(external_id, '') NOT LIKE 'insight:%';--> statement-breakpoint
-- RLS for the wave-3 tenant tables (ADR-0004).
ALTER TABLE content_translations ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE content_translations FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant ON content_translations USING (ozvi_project_ok(project_id)) WITH CHECK (ozvi_project_ok(project_id));--> statement-breakpoint
ALTER TABLE tracker_syncs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE tracker_syncs FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant ON tracker_syncs USING (ozvi_project_ok(project_id)) WITH CHECK (ozvi_project_ok(project_id));
