ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE emails FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant ON emails USING (ozvi_project_ok(project_id)) WITH CHECK (ozvi_project_ok(project_id));
