ALTER TABLE "dataset_versions" DROP CONSTRAINT "dataset_versions_source_version_owner_unique";--> statement-breakpoint
ALTER TABLE "season_statistics" DROP CONSTRAINT "season_statistics_team_id_nfl_teams_id_fk";
--> statement-breakpoint
ALTER TABLE "weekly_statistics" DROP CONSTRAINT "weekly_statistics_team_id_nfl_teams_id_fk";
--> statement-breakpoint
ALTER TABLE "season_statistics" ALTER COLUMN "team_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_statistics" ALTER COLUMN "team_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "season_statistics" ADD CONSTRAINT "season_statistics_team_id_nfl_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."nfl_teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_statistics" ADD CONSTRAINT "weekly_statistics_team_id_nfl_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."nfl_teams"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dataset_versions_public_source_version_unique" ON "dataset_versions" USING btree ("data_source_id","version") WHERE "dataset_versions"."owner_user_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "dataset_versions_private_source_version_owner_unique" ON "dataset_versions" USING btree ("data_source_id","version","owner_user_id") WHERE "dataset_versions"."owner_user_id" is not null;