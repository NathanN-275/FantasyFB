CREATE TYPE "public"."news_data_freshness" AS ENUM('current', 'stale', 'unknown');--> statement-breakpoint
ALTER TYPE "public"."news_type" ADD VALUE 'contract' BEFORE 'game';--> statement-breakpoint
ALTER TYPE "public"."news_type" ADD VALUE 'suspension' BEFORE 'game';--> statement-breakpoint
ALTER TABLE "news_records" ALTER COLUMN "summary" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "news_records" ALTER COLUMN "published_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "news_records" ADD COLUMN "retrieved_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "news_records" ADD COLUMN "reported_facts" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "news_records" ADD COLUMN "related_teams" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "news_records" ADD COLUMN "injury_information" jsonb;--> statement-breakpoint
ALTER TABLE "news_records" ADD COLUMN "fantasy_relevance" text DEFAULT 'No application-generated fantasy interpretation is available.' NOT NULL;--> statement-breakpoint
ALTER TABLE "news_records" ADD COLUMN "interpretation_reasoning" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "news_records" ADD COLUMN "entity_match_confidence" numeric(14, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "news_records" ADD COLUMN "data_freshness" "news_data_freshness" DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "news_records" ADD COLUMN "deduplication_key" text;--> statement-breakpoint
UPDATE "news_records"
SET "deduplication_key" = md5("source_url" || ':' || "id"::text)
WHERE "deduplication_key" IS NULL;--> statement-breakpoint
ALTER TABLE "news_records" ALTER COLUMN "deduplication_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "news_records" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "player_news" ADD COLUMN "matched_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "news_records_deduplication_key_unique" ON "news_records" USING btree ("deduplication_key");--> statement-breakpoint
CREATE INDEX "news_records_category_published_index" ON "news_records" USING btree ("news_type","published_at");--> statement-breakpoint
CREATE INDEX "news_records_freshness_retrieved_index" ON "news_records" USING btree ("data_freshness","retrieved_at");--> statement-breakpoint
ALTER TABLE "news_records" ADD CONSTRAINT "news_records_entity_confidence_valid" CHECK ("news_records"."entity_match_confidence" >= 0 and "news_records"."entity_match_confidence" <= 1);
