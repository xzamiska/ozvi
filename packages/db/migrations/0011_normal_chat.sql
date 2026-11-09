CREATE TABLE "changelog_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"author_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "changelog_title_len" CHECK (char_length("changelog_entries"."title") between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "changelog_items" (
	"project_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	CONSTRAINT "changelog_items_entry_id_item_id_pk" PRIMARY KEY("entry_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "changelog_entries" ADD CONSTRAINT "changelog_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changelog_entries" ADD CONSTRAINT "changelog_entries_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changelog_items" ADD CONSTRAINT "changelog_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changelog_items" ADD CONSTRAINT "changelog_items_entry_id_changelog_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."changelog_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changelog_items" ADD CONSTRAINT "changelog_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "changelog_project" ON "changelog_entries" USING btree ("project_id","published_at");--> statement-breakpoint
CREATE INDEX "changelog_items_item" ON "changelog_items" USING btree ("item_id");