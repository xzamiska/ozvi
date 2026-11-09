-- RLS for the F4 tenant tables (ADR-0004).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['changelog_entries', 'changelog_items'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant ON %I USING (ozvi_project_ok(project_id)) WITH CHECK (ozvi_project_ok(project_id))', t);
  END LOOP;
END $$;
