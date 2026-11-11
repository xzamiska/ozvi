CREATE TABLE "telemetry_instances" (
	"id" text PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"projects" integer DEFAULT 0 NOT NULL,
	"users" integer DEFAULT 0 NOT NULL,
	"active_users_30" integer DEFAULT 0 NOT NULL,
	"items" integer DEFAULT 0 NOT NULL,
	"items_30" integer DEFAULT 0 NOT NULL,
	"reports" integer DEFAULT 1 NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL
);
