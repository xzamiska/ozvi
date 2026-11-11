ALTER TABLE "projects" ADD COLUMN "github_installation_id" bigint;--> statement-breakpoint
CREATE INDEX "projects_github_installation" ON "projects" USING btree ("github_installation_id");