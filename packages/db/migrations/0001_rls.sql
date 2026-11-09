-- Row-level security for every tenant table (ADR-0004).
-- FORCE makes it apply to the table owner too, i.e. to the app's own connection.
-- nullif(...) because a setting that was set locally once reads back as '' afterwards, not NULL.
CREATE FUNCTION ozvi_project_ok(pid uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$
  SELECT pid = nullif(current_setting('ozvi.project_id', true), '')::uuid
      OR current_setting('ozvi.system', true) = 'on'
$$;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users', 'items', 'votes', 'comments', 'attachments'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant ON %I USING (ozvi_project_ok(project_id)) WITH CHECK (ozvi_project_ok(project_id))', t);
  END LOOP;
END $$;
