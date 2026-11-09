-- The app role owns its tables but is NOT a superuser: superusers and BYPASSRLS roles skip
-- row-level security even with FORCE, which would silently disable tenant isolation (ADR-0004).
CREATE ROLE ozvi LOGIN PASSWORD 'ozvi' NOSUPERUSER NOBYPASSRLS NOCREATEROLE;
CREATE DATABASE ozvi OWNER ozvi;
\connect ozvi
-- Extensions that need superuser are created here once.
CREATE EXTENSION IF NOT EXISTS vector;
