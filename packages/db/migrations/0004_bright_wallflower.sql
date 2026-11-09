DROP INDEX "projects_workspace_slug";--> statement-breakpoint
CREATE INDEX "projects_workspace" ON "projects" USING btree ("workspace_id");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_slug_unique" UNIQUE("slug");