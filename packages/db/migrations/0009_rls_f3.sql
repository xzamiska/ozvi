-- RLS for the F3 tenant tables (ADR-0004). accounts, workspace_members and login_codes are
-- global (like workspaces/projects) and only touched by the auth code with explicit filters.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['oauth_clients', 'oauth_codes'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant ON %I USING (ozvi_project_ok(project_id)) WITH CHECK (ozvi_project_ok(project_id))', t);
  END LOOP;
END $$;
