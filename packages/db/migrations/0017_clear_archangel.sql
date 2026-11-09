ALTER TABLE "projects" ADD COLUMN "default_locale" text DEFAULT 'sk' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "locales" text[] DEFAULT '{sk,cs,en}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locale" text;