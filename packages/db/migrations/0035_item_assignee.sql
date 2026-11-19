ALTER TABLE "items" ADD COLUMN "assignee_id" uuid;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "items_assignee" ON "items" USING btree ("project_id","assignee_id");