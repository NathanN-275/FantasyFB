CREATE TABLE "team_season_statistics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"dataset_version_id" uuid NOT NULL,
	"values" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_season_statistics_team_season_dataset_unique" UNIQUE("team_id","season_id","dataset_version_id")
);
--> statement-breakpoint
CREATE TABLE "team_weekly_statistics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"week" integer NOT NULL,
	"dataset_version_id" uuid NOT NULL,
	"values" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_weekly_statistics_team_season_week_dataset_unique" UNIQUE("team_id","season_id","week","dataset_version_id"),
	CONSTRAINT "team_weekly_statistics_week_positive" CHECK ("team_weekly_statistics"."week" > 0)
);
--> statement-breakpoint
ALTER TABLE "team_season_statistics" ADD CONSTRAINT "team_season_statistics_team_id_nfl_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."nfl_teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_season_statistics" ADD CONSTRAINT "team_season_statistics_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_season_statistics" ADD CONSTRAINT "team_season_statistics_dataset_version_id_dataset_versions_id_fk" FOREIGN KEY ("dataset_version_id") REFERENCES "public"."dataset_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_weekly_statistics" ADD CONSTRAINT "team_weekly_statistics_team_id_nfl_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."nfl_teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_weekly_statistics" ADD CONSTRAINT "team_weekly_statistics_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_weekly_statistics" ADD CONSTRAINT "team_weekly_statistics_dataset_version_id_dataset_versions_id_fk" FOREIGN KEY ("dataset_version_id") REFERENCES "public"."dataset_versions"("id") ON DELETE restrict ON UPDATE no action;