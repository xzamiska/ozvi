ALTER TABLE "duplicate_stats" DROP CONSTRAINT "duplicate_stats_kind";--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "known_title" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "known_body" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "known_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "items_known" ON "items" USING btree ("project_id") WHERE "items"."known_at" is not null;--> statement-breakpoint
ALTER TABLE "duplicate_stats" ADD CONSTRAINT "duplicate_stats_kind" CHECK ("duplicate_stats"."kind" in ('attached', 'created_anyway', 'said_different', 'merged_later', 'split', 'joined_known'));--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_known_issue" CHECK ("items"."known_at" is null or ("items"."kind" = 'bug' and char_length("items"."known_title") between 3 and 200));