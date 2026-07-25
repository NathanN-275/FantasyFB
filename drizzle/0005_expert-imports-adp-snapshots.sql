CREATE TYPE "public"."expert_import_kind" AS ENUM('projection', 'ranking', 'combined');--> statement-breakpoint
CREATE TYPE "public"."player_resolution_status" AS ENUM('matched', 'ambiguous', 'missing', 'invalid');--> statement-breakpoint
ALTER TYPE "public"."import_status" ADD VALUE 'awaiting_confirmation' BEFORE 'completed';--> statement-breakpoint
CREATE TABLE "expert_import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"resolution" "player_resolution_status" NOT NULL,
	"player_id" uuid,
	"candidate_player_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_identity" jsonb NOT NULL,
	"normalized_projection" jsonb,
	"normalized_ranking" jsonb,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expert_import_rows_import_row_unique" UNIQUE("import_id","row_number"),
	CONSTRAINT "expert_import_rows_row_positive" CHECK ("expert_import_rows"."row_number" > 0),
	CONSTRAINT "expert_import_rows_matched_player_required" CHECK (("expert_import_rows"."resolution" <> 'matched' or "expert_import_rows"."player_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "adp_snapshots" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "adp_snapshots" ADD COLUMN "scoring_format" text;--> statement-breakpoint
ALTER TABLE "adp_snapshots" ADD COLUMN "league_size" integer;--> statement-breakpoint
ALTER TABLE "adp_snapshots" ADD COLUMN "positional_adp" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "adp_snapshots" ADD COLUMN "minimum_pick" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "adp_snapshots" ADD COLUMN "maximum_pick" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "private_data_imports" ADD COLUMN "season_id" uuid;--> statement-breakpoint
ALTER TABLE "private_data_imports" ADD COLUMN "provider_name" text;--> statement-breakpoint
ALTER TABLE "private_data_imports" ADD COLUMN "import_kind" "expert_import_kind";--> statement-breakpoint
ALTER TABLE "private_data_imports" ADD COLUMN "import_profile" jsonb;--> statement-breakpoint
ALTER TABLE "private_data_imports" ADD COLUMN "original_content" text;--> statement-breakpoint
ALTER TABLE "private_data_imports" ADD COLUMN "preview_summary" jsonb;--> statement-breakpoint
ALTER TABLE "private_data_imports" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projection_runs" ADD COLUMN "import_id" uuid;--> statement-breakpoint
ALTER TABLE "ranking_runs" ADD COLUMN "import_id" uuid;--> statement-breakpoint
UPDATE "adp_snapshots"
SET
	"provider" = 'legacy',
	"scoring_format" = 'unknown',
	"league_size" = 12,
	"positional_adp" = "average_draft_position"
WHERE "provider" IS NULL;--> statement-breakpoint
ALTER TABLE "adp_snapshots" ALTER COLUMN "provider" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "adp_snapshots" ALTER COLUMN "scoring_format" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "adp_snapshots" ALTER COLUMN "league_size" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "adp_snapshots" ALTER COLUMN "positional_adp" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "expert_import_rows" ADD CONSTRAINT "expert_import_rows_import_id_private_data_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."private_data_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expert_import_rows" ADD CONSTRAINT "expert_import_rows_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expert_import_rows_import_resolution_index" ON "expert_import_rows" USING btree ("import_id","resolution");--> statement-breakpoint
ALTER TABLE "private_data_imports" ADD CONSTRAINT "private_data_imports_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projection_runs" ADD CONSTRAINT "projection_runs_import_id_private_data_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."private_data_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_runs" ADD CONSTRAINT "ranking_runs_import_id_private_data_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."private_data_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "adp_snapshots_provider_context_time_index" ON "adp_snapshots" USING btree ("provider","season_id","scoring_format","league_size","captured_at");--> statement-breakpoint
ALTER TABLE "adp_snapshots" ADD CONSTRAINT "adp_snapshots_league_size_positive" CHECK ("adp_snapshots"."league_size" > 0);--> statement-breakpoint
ALTER TABLE "adp_snapshots" ADD CONSTRAINT "adp_snapshots_pick_bounds_valid" CHECK (("adp_snapshots"."minimum_pick" is null or "adp_snapshots"."maximum_pick" is null or "adp_snapshots"."minimum_pick" <= "adp_snapshots"."maximum_pick"));
