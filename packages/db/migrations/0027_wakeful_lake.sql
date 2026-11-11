CREATE TABLE "usage_alerts" (
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"period" text NOT NULL,
	"level" smallint NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_alerts_workspace_id_kind_period_level_pk" PRIMARY KEY("workspace_id","kind","period","level")
);
--> statement-breakpoint
ALTER TABLE "usage_alerts" ADD CONSTRAINT "usage_alerts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;