#!/bin/sh
# Creates the app role as a NON-superuser so row-level security applies (ADR-0004).
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<SQL
CREATE ROLE ozvi LOGIN PASSWORD '${OZVI_DB_PASSWORD}' NOSUPERUSER NOBYPASSRLS NOCREATEROLE;
CREATE DATABASE ozvi OWNER ozvi;
\connect ozvi
CREATE EXTENSION IF NOT EXISTS vector;
SQL
