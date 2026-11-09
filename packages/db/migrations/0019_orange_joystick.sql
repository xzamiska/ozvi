ALTER TABLE "api_tokens" ADD COLUMN "oauth_family" uuid;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD COLUMN "refresh_used_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "api_tokens_oauth_family" ON "api_tokens" USING btree ("oauth_family");