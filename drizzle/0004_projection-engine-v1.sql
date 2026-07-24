ALTER TABLE "player_projections" ADD COLUMN "projected_games" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "player_projections" ADD COLUMN "projected_points_per_game" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "projection_runs" ADD COLUMN "scoring_configuration_identifier" text;--> statement-breakpoint
ALTER TABLE "projection_runs" ADD COLUMN "training_start_season" integer;--> statement-breakpoint
ALTER TABLE "projection_runs" ADD COLUMN "training_end_season" integer;--> statement-breakpoint
ALTER TABLE "projection_runs" ADD COLUMN "metrics" jsonb DEFAULT '{}'::jsonb NOT NULL;