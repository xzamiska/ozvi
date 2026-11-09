CREATE TABLE "item_proofs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"ref" text,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_proofs_kind" CHECK ("item_proofs"."kind" in ('pr', 'preview'))
);
--> statement-breakpoint
ALTER TABLE "changelog_entries" ADD COLUMN "release_tag" text;--> statement-breakpoint
ALTER TABLE "changelog_entries" ADD COLUMN "release_url" text;--> statement-breakpoint
ALTER TABLE "changelog_entries" ADD COLUMN "ai_model" text;--> statement-breakpoint
ALTER TABLE "changelog_entries" ADD COLUMN "ai_pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "changelog_entries" ADD COLUMN "reviewed_by_id" uuid;--> statement-breakpoint
ALTER TABLE "changelog_entries" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "source" text DEFAULT 'board' NOT NULL;--> statement-breakpoint
ALTER TABLE "item_events" ADD COLUMN "proof" jsonb;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "source" text DEFAULT 'board' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "mcp_lockdown" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "item_proofs" ADD CONSTRAINT "item_proofs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_proofs" ADD CONSTRAINT "item_proofs_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_proofs" ADD CONSTRAINT "item_proofs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "item_proofs_url" ON "item_proofs" USING btree ("item_id","kind","url");--> statement-breakpoint
ALTER TABLE "changelog_entries" ADD CONSTRAINT "changelog_entries_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "changelog_release" ON "changelog_entries" USING btree ("project_id","release_tag");--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_source" CHECK ("comments"."source" in ('board', 'widget', 'mcp', 'import', 'api'));--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_source" CHECK ("items"."source" in ('board', 'widget', 'mcp', 'import', 'api'));--> statement-breakpoint
-- Backfill where items and comments came from (MCP agent, wave 2).
UPDATE items SET source = 'import' WHERE id::text IN (SELECT target_id FROM import_records WHERE source_type = 'item') OR context ? 'importedFrom';--> statement-breakpoint
UPDATE items SET source = 'mcp' WHERE source = 'board' AND context->>'appVersion' = 'MCP';--> statement-breakpoint
UPDATE comments SET source = 'import' WHERE id::text IN (SELECT target_id FROM import_records WHERE source_type = 'comment');--> statement-breakpoint
-- RLS for the wave-2 tenant table (ADR-0004).
ALTER TABLE item_proofs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE item_proofs FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant ON item_proofs USING (ozvi_project_ok(project_id)) WITH CHECK (ozvi_project_ok(project_id));
