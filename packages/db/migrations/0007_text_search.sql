-- Fuzzy text matching for search and the duplicate finder when no embeddings are configured.
-- Both are "trusted" extensions (PostgreSQL 13+), so the database owner (the app role) may create them.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
-- unaccent() is only STABLE; this wrapper pins the dictionary so it can be used in indexes.
CREATE OR REPLACE FUNCTION ozvi_fold(t text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT lower(public.unaccent('public.unaccent'::regdictionary, coalesce(t, ''))) $$;
