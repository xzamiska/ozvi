-- Row-level security for the F2 tenant tables (ADR-0004).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['api_tokens', 'webhooks', 'webhook_deliveries', 'integrations', 'item_links'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant ON %I USING (ozvi_project_ok(project_id)) WITH CHECK (ozvi_project_ok(project_id))', t);
  END LOOP;
END $$;
--> statement-breakpoint
-- Embeddings for duplicate detection need pgvector. The extension is created by the superuser in
-- deploy/initdb; the app role usually cannot create it, so everything here is skipped without it
-- and the app falls back to full-text similarity.
DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
  EXCEPTION WHEN insufficient_privilege OR undefined_file THEN
    RAISE NOTICE 'pgvector not available, skipping item_embeddings';
  END;
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    CREATE TABLE IF NOT EXISTS item_embeddings (
      item_id uuid PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
      project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      model text NOT NULL,
      embedding vector NOT NULL,
      -- md5 of the embedded text, so status/vote changes do not trigger re-embedding
      source_md5 text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS item_embeddings_project ON item_embeddings (project_id, model);
    ALTER TABLE item_embeddings ENABLE ROW LEVEL SECURITY;
    ALTER TABLE item_embeddings FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant ON item_embeddings USING (ozvi_project_ok(project_id)) WITH CHECK (ozvi_project_ok(project_id));
  END IF;
END $$;
