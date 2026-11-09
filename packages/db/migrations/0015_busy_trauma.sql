CREATE TABLE "item_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"from_status" "item_status",
	"to_status" "item_status" NOT NULL,
	"version" text,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "item_events" ADD CONSTRAINT "item_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_events" ADD CONSTRAINT "item_events_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_events" ADD CONSTRAINT "item_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_events_item" ON "item_events" USING btree ("item_id","created_at");--> statement-breakpoint
ALTER TABLE "item_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "item_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant ON "item_events" USING (ozvi_project_ok(project_id)) WITH CHECK (ozvi_project_ok(project_id));--> statement-breakpoint
-- Backfill: items already past their first stage get one event at their last update (system scope, this transaction only).
SELECT set_config('ozvi.system', 'on', true);--> statement-breakpoint
INSERT INTO "item_events" ("project_id", "item_id", "from_status", "to_status", "version", "created_at")
SELECT "project_id", "id", NULL, "status", "fixed_in_version", "updated_at" FROM "items"
WHERE "status" NOT IN ('new', 'open');--> statement-breakpoint
SELECT set_config('ozvi.system', '', true);
