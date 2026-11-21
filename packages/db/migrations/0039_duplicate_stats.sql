CREATE TABLE "duplicate_stats" (
	"project_id" uuid NOT NULL,
	"day" date NOT NULL,
	"kind" text NOT NULL,
	"n" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "duplicate_stats_project_id_day_kind_pk" PRIMARY KEY("project_id","day","kind"),
	CONSTRAINT "duplicate_stats_kind" CHECK ("duplicate_stats"."kind" in ('attached', 'created_anyway', 'said_different', 'merged_later', 'split'))
);
--> statement-breakpoint
ALTER TABLE "duplicate_stats" ADD CONSTRAINT "duplicate_stats_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE duplicate_stats ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE duplicate_stats FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant ON duplicate_stats USING (ozvi_project_ok(project_id)) WITH CHECK (ozvi_project_ok(project_id));--> statement-breakpoint
-- Counts so far (ADR-0015 phase 1 kept them on the items) go into the counters; then the attach timestamps go.
SELECT set_config('ozvi.system', 'on', true);--> statement-breakpoint
INSERT INTO duplicate_stats (project_id, day, kind, n)
SELECT project_id, day, kind, count(*)::int FROM (
  SELECT i.project_id, (a.at::timestamptz at time zone 'utc')::date AS day, 'attached' AS kind
    FROM items i, jsonb_array_elements_text(i.context->'attached') a(at) WHERE jsonb_typeof(i.context->'attached') = 'array'
  UNION ALL SELECT project_id, (created_at at time zone 'utc')::date, 'created_anyway' FROM items WHERE kind = 'idea' AND context ? 'similarSeen'
  UNION ALL SELECT project_id, (created_at at time zone 'utc')::date, 'said_different' FROM items WHERE kind = 'idea' AND context->'similarSeen' ? 'strong'
  UNION ALL SELECT project_id, (updated_at at time zone 'utc')::date, 'merged_later' FROM items WHERE kind = 'idea' AND context ? 'similarSeen' AND merged_into_id IS NOT NULL
  UNION ALL SELECT a.project_id, (a.created_at at time zone 'utc')::date, 'split' FROM activity a JOIN projects p ON p.id = a.project_id WHERE a.action = 'triage.unmerged'
) c GROUP BY project_id, day, kind;--> statement-breakpoint
UPDATE items SET context = CASE WHEN context - 'attached' = '{}'::jsonb THEN NULL ELSE context - 'attached' END WHERE context ? 'attached';--> statement-breakpoint
SELECT set_config('ozvi.system', '', true);