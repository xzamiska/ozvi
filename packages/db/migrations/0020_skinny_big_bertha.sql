CREATE TABLE "custom_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" "item_kind" NOT NULL,
	"stage" "item_status" NOT NULL,
	"labels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_records" (
	"project_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"source" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"target_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"label" text,
	"input" jsonb,
	"total" integer DEFAULT 0 NOT NULL,
	"done" integer DEFAULT 0 NOT NULL,
	"report" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"undone_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "item_tags" (
	"project_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_tags_item_id_tag_id_pk" PRIMARY KEY("item_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT 'neutral' NOT NULL,
	"public" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_name_len" CHECK (char_length("tags"."name") between 1 and 40),
	CONSTRAINT "tags_color" CHECK ("tags"."color" in ('neutral', 'accent', 'amber', 'green', 'red', 'muted'))
);
--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "item_events" ADD COLUMN "sub_status_id" uuid;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "sub_status_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "status_labels" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "unanswered_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_statuses" ADD CONSTRAINT "custom_statuses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_records" ADD CONSTRAINT "import_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_records" ADD CONSTRAINT "import_records_run_id_import_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."import_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_tags" ADD CONSTRAINT "item_tags_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_tags" ADD CONSTRAINT "item_tags_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_tags" ADD CONSTRAINT "item_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_statuses_project" ON "custom_statuses" USING btree ("project_id","kind","stage","position");--> statement-breakpoint
CREATE UNIQUE INDEX "import_records_source" ON "import_records" USING btree ("project_id","source","source_type","source_id");--> statement-breakpoint
CREATE INDEX "import_records_run" ON "import_records" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "import_runs_project" ON "import_runs" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "item_tags_tag" ON "item_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_project_name" ON "tags" USING btree ("project_id",lower("name"));--> statement-breakpoint
ALTER TABLE "item_events" ADD CONSTRAINT "item_events_sub_status_id_custom_statuses_id_fk" FOREIGN KEY ("sub_status_id") REFERENCES "public"."custom_statuses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_sub_status_id_custom_statuses_id_fk" FOREIGN KEY ("sub_status_id") REFERENCES "public"."custom_statuses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_unanswered_days" CHECK ("projects"."unanswered_days" between 1 and 90);--> statement-breakpoint
-- RLS for the wave-1 tenant tables (ADR-0004).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['custom_statuses', 'tags', 'item_tags', 'import_runs', 'import_records'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant ON %I USING (ozvi_project_ok(project_id)) WITH CHECK (ozvi_project_ok(project_id))', t);
  END LOOP;
END $$;
