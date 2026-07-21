CREATE TYPE "public"."data_visibility" AS ENUM('public', 'sample', 'private');--> statement-breakpoint
CREATE TYPE "public"."dataset_status" AS ENUM('pending', 'valid', 'invalid', 'stale', 'quarantined');--> statement-breakpoint
CREATE TYPE "public"."draft_event_type" AS ENUM('pick_recorded', 'pick_corrected', 'pick_removed', 'draft_paused', 'draft_resumed', 'draft_completed', 'keeper_assigned', 'pick_traded', 'player_mapping_resolved');--> statement-breakpoint
CREATE TYPE "public"."draft_status" AS ENUM('scheduled', 'in_progress', 'paused', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'quarantined');--> statement-breakpoint
CREATE TYPE "public"."news_type" AS ENUM('injury', 'transaction', 'depth_chart', 'game', 'general');--> statement-breakpoint
CREATE TYPE "public"."projection_kind" AS ENUM('model', 'expert', 'hybrid');--> statement-breakpoint
CREATE TYPE "public"."ranking_kind" AS ENUM('model', 'expert', 'hybrid');--> statement-breakpoint
CREATE TYPE "public"."roster_entry_status" AS ENUM('active', 'bench', 'injured_reserve', 'waived');--> statement-breakpoint
CREATE TYPE "public"."roster_slot_kind" AS ENUM('starter', 'bench', 'injured_reserve');--> statement-breakpoint
CREATE TYPE "public"."season_kind" AS ENUM('preseason', 'regular', 'postseason');--> statement-breakpoint
CREATE TYPE "public"."trade_status" AS ENUM('draft', 'evaluated', 'archived');--> statement-breakpoint
CREATE TABLE "adp_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_version_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"average_draft_position" numeric(14, 4) NOT NULL,
	"sample_size" integer,
	"captured_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "adp_snapshots_dataset_player_unique" UNIQUE("dataset_version_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "authorized_user_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"is_authorized" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "authorized_user_identities_provider_account_unique" UNIQUE("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "data_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"source_identifier" text NOT NULL,
	"source_url" text,
	"license_or_usage_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_sources_name_identifier_unique" UNIQUE("name","source_identifier")
);
--> statement-breakpoint
CREATE TABLE "dataset_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"data_source_id" uuid NOT NULL,
	"import_id" uuid,
	"owner_user_id" uuid,
	"visibility" "data_visibility" NOT NULL,
	"version" text NOT NULL,
	"season_year" integer,
	"week" integer,
	"retrieved_at" timestamp with time zone NOT NULL,
	"effective_at" timestamp with time zone,
	"validation_status" "dataset_status" NOT NULL,
	"freshness_status" "dataset_status" NOT NULL,
	"record_count" integer DEFAULT 0 NOT NULL,
	"license_or_usage_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dataset_versions_source_version_owner_unique" UNIQUE("data_source_id","version","owner_user_id"),
	CONSTRAINT "dataset_versions_private_owner_required" CHECK (("dataset_versions"."visibility" <> 'private' or "dataset_versions"."owner_user_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "draft_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"event_type" "draft_event_type" NOT NULL,
	"idempotency_key" text NOT NULL,
	"provider_event_id" text,
	"provider_timestamp" timestamp with time zone,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "draft_events_draft_sequence_unique" UNIQUE("draft_id","sequence"),
	CONSTRAINT "draft_events_draft_idempotency_unique" UNIQUE("draft_id","idempotency_key"),
	CONSTRAINT "draft_events_sequence_positive" CHECK ("draft_events"."sequence" > 0)
);
--> statement-breakpoint
CREATE TABLE "draft_queues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draft_id" uuid NOT NULL,
	"fantasy_team_id" uuid,
	"player_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "draft_queues_draft_team_player_unique" UNIQUE("draft_id","fantasy_team_id","player_id"),
	CONSTRAINT "draft_queues_draft_team_position_unique" UNIQUE("draft_id","fantasy_team_id","position"),
	CONSTRAINT "draft_queues_position_positive" CHECK ("draft_queues"."position" > 0)
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_configuration_id" uuid NOT NULL,
	"provider" text,
	"external_draft_id" text,
	"status" "draft_status" DEFAULT 'scheduled' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drafts_league_provider_external_unique" UNIQUE("league_configuration_id","provider","external_draft_id")
);
--> statement-breakpoint
CREATE TABLE "fantasy_rosters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fantasy_team_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"status" "roster_entry_status" DEFAULT 'active' NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fantasy_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_configuration_id" uuid NOT NULL,
	"name" text NOT NULL,
	"owner_label" text,
	"external_team_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fantasy_teams_league_name_unique" UNIQUE("league_configuration_id","name"),
	CONSTRAINT "fantasy_teams_league_external_unique" UNIQUE("league_configuration_id","external_team_id")
);
--> statement-breakpoint
CREATE TABLE "league_configurations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"team_count" integer NOT NULL,
	"provider" text,
	"external_league_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "league_configurations_provider_external_unique" UNIQUE("owner_user_id","provider","external_league_id"),
	CONSTRAINT "league_configurations_team_count_positive" CHECK ("league_configurations"."team_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "league_scoring_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_configuration_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"name" text NOT NULL,
	"rules" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "league_scoring_rules_league_version_unique" UNIQUE("league_configuration_id","version")
);
--> statement-breakpoint
CREATE TABLE "news_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_version_id" uuid NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"source_url" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"news_type" "news_type" DEFAULT 'general' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "news_records_dataset_source_url_unique" UNIQUE("dataset_version_id","source_url")
);
--> statement-breakpoint
CREATE TABLE "nfl_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"abbreviation" text NOT NULL,
	"conference" text,
	"division" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_external_ids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"source_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_external_ids_provider_value_unique" UNIQUE("provider","external_id"),
	CONSTRAINT "player_external_ids_player_provider_unique" UNIQUE("player_id","provider")
);
--> statement-breakpoint
CREATE TABLE "player_news" (
	"player_id" uuid NOT NULL,
	"news_record_id" uuid NOT NULL,
	"relevance" numeric(14, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_news_primary" PRIMARY KEY("player_id","news_record_id")
);
--> statement-breakpoint
CREATE TABLE "player_projections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projection_run_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"projected_stats" jsonb NOT NULL,
	"projected_points" numeric(14, 4),
	"floor_points" numeric(14, 4),
	"median_points" numeric(14, 4),
	"ceiling_points" numeric(14, 4),
	"confidence" numeric(14, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_projections_run_player_unique" UNIQUE("projection_run_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "player_rankings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ranking_run_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"score" numeric(14, 4),
	"rationale" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_rankings_run_player_unique" UNIQUE("ranking_run_id","player_id"),
	CONSTRAINT "player_rankings_run_rank_unique" UNIQUE("ranking_run_id","rank"),
	CONSTRAINT "player_rankings_rank_positive" CHECK ("player_rankings"."rank" > 0)
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"position" text NOT NULL,
	"team_id" uuid,
	"availability" text DEFAULT 'unknown' NOT NULL,
	"injury_status" text DEFAULT 'unknown' NOT NULL,
	"birth_date" timestamp,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "private_data_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"source_id" uuid,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"checksum" text NOT NULL,
	"status" "import_status" DEFAULT 'pending' NOT NULL,
	"record_count" integer,
	"error_message" text,
	"preserve_original" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "projection_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_version_id" uuid NOT NULL,
	"owner_user_id" uuid,
	"visibility" "data_visibility" NOT NULL,
	"season_id" uuid NOT NULL,
	"projection_kind" "projection_kind" NOT NULL,
	"model_version" text,
	"feature_version" text,
	"generated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projection_runs_private_owner_required" CHECK (("projection_runs"."visibility" <> 'private' or "projection_runs"."owner_user_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "ranking_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_version_id" uuid,
	"owner_user_id" uuid,
	"visibility" "data_visibility" NOT NULL,
	"season_id" uuid NOT NULL,
	"ranking_kind" "ranking_kind" NOT NULL,
	"version" text NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ranking_runs_private_owner_required" CHECK (("ranking_runs"."visibility" <> 'private' or "ranking_runs"."owner_user_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "roster_configurations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_configuration_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"slots" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roster_configurations_league_version_unique" UNIQUE("league_configuration_id","version")
);
--> statement-breakpoint
CREATE TABLE "saved_players" (
	"user_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_players_user_player_primary" PRIMARY KEY("user_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "season_statistics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"team_id" uuid,
	"season_id" uuid NOT NULL,
	"dataset_version_id" uuid NOT NULL,
	"values" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_statistics_player_team_season_dataset_unique" UNIQUE("player_id","team_id","season_id","dataset_version_id")
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"kind" "season_kind" DEFAULT 'regular' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seasons_year_kind_unique" UNIQUE("year","kind")
);
--> statement-breakpoint
CREATE TABLE "trade_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"league_configuration_id" uuid,
	"status" "trade_status" DEFAULT 'draft' NOT NULL,
	"side_a" jsonb NOT NULL,
	"side_b" jsonb NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_statistics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"team_id" uuid,
	"season_id" uuid NOT NULL,
	"week" integer NOT NULL,
	"dataset_version_id" uuid NOT NULL,
	"values" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_statistics_player_season_week_dataset_unique" UNIQUE("player_id","season_id","week","dataset_version_id"),
	CONSTRAINT "weekly_statistics_week_positive" CHECK ("weekly_statistics"."week" > 0)
);
--> statement-breakpoint
ALTER TABLE "adp_snapshots" ADD CONSTRAINT "adp_snapshots_dataset_version_id_dataset_versions_id_fk" FOREIGN KEY ("dataset_version_id") REFERENCES "public"."dataset_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adp_snapshots" ADD CONSTRAINT "adp_snapshots_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adp_snapshots" ADD CONSTRAINT "adp_snapshots_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorized_user_identities" ADD CONSTRAINT "authorized_user_identities_user_id_user_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD CONSTRAINT "dataset_versions_data_source_id_data_sources_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "public"."data_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD CONSTRAINT "dataset_versions_import_id_private_data_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."private_data_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD CONSTRAINT "dataset_versions_owner_user_id_user_accounts_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_events" ADD CONSTRAINT "draft_events_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_queues" ADD CONSTRAINT "draft_queues_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_queues" ADD CONSTRAINT "draft_queues_fantasy_team_id_fantasy_teams_id_fk" FOREIGN KEY ("fantasy_team_id") REFERENCES "public"."fantasy_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_queues" ADD CONSTRAINT "draft_queues_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_league_configuration_id_league_configurations_id_fk" FOREIGN KEY ("league_configuration_id") REFERENCES "public"."league_configurations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_rosters" ADD CONSTRAINT "fantasy_rosters_fantasy_team_id_fantasy_teams_id_fk" FOREIGN KEY ("fantasy_team_id") REFERENCES "public"."fantasy_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_rosters" ADD CONSTRAINT "fantasy_rosters_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fantasy_teams" ADD CONSTRAINT "fantasy_teams_league_configuration_id_league_configurations_id_fk" FOREIGN KEY ("league_configuration_id") REFERENCES "public"."league_configurations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_configurations" ADD CONSTRAINT "league_configurations_owner_user_id_user_accounts_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_scoring_rules" ADD CONSTRAINT "league_scoring_rules_league_configuration_id_league_configurations_id_fk" FOREIGN KEY ("league_configuration_id") REFERENCES "public"."league_configurations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_records" ADD CONSTRAINT "news_records_dataset_version_id_dataset_versions_id_fk" FOREIGN KEY ("dataset_version_id") REFERENCES "public"."dataset_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_external_ids" ADD CONSTRAINT "player_external_ids_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_news" ADD CONSTRAINT "player_news_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_news" ADD CONSTRAINT "player_news_news_record_id_news_records_id_fk" FOREIGN KEY ("news_record_id") REFERENCES "public"."news_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_projections" ADD CONSTRAINT "player_projections_projection_run_id_projection_runs_id_fk" FOREIGN KEY ("projection_run_id") REFERENCES "public"."projection_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_projections" ADD CONSTRAINT "player_projections_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_rankings" ADD CONSTRAINT "player_rankings_ranking_run_id_ranking_runs_id_fk" FOREIGN KEY ("ranking_run_id") REFERENCES "public"."ranking_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_rankings" ADD CONSTRAINT "player_rankings_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_team_id_nfl_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."nfl_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_data_imports" ADD CONSTRAINT "private_data_imports_owner_user_id_user_accounts_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_data_imports" ADD CONSTRAINT "private_data_imports_source_id_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."data_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projection_runs" ADD CONSTRAINT "projection_runs_dataset_version_id_dataset_versions_id_fk" FOREIGN KEY ("dataset_version_id") REFERENCES "public"."dataset_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projection_runs" ADD CONSTRAINT "projection_runs_owner_user_id_user_accounts_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projection_runs" ADD CONSTRAINT "projection_runs_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_runs" ADD CONSTRAINT "ranking_runs_dataset_version_id_dataset_versions_id_fk" FOREIGN KEY ("dataset_version_id") REFERENCES "public"."dataset_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_runs" ADD CONSTRAINT "ranking_runs_owner_user_id_user_accounts_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ranking_runs" ADD CONSTRAINT "ranking_runs_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_configurations" ADD CONSTRAINT "roster_configurations_league_configuration_id_league_configurations_id_fk" FOREIGN KEY ("league_configuration_id") REFERENCES "public"."league_configurations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_players" ADD CONSTRAINT "saved_players_user_id_user_accounts_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_players" ADD CONSTRAINT "saved_players_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_statistics" ADD CONSTRAINT "season_statistics_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_statistics" ADD CONSTRAINT "season_statistics_team_id_nfl_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."nfl_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_statistics" ADD CONSTRAINT "season_statistics_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_statistics" ADD CONSTRAINT "season_statistics_dataset_version_id_dataset_versions_id_fk" FOREIGN KEY ("dataset_version_id") REFERENCES "public"."dataset_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_evaluations" ADD CONSTRAINT "trade_evaluations_owner_user_id_user_accounts_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_evaluations" ADD CONSTRAINT "trade_evaluations_league_configuration_id_league_configurations_id_fk" FOREIGN KEY ("league_configuration_id") REFERENCES "public"."league_configurations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_statistics" ADD CONSTRAINT "weekly_statistics_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_statistics" ADD CONSTRAINT "weekly_statistics_team_id_nfl_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."nfl_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_statistics" ADD CONSTRAINT "weekly_statistics_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_statistics" ADD CONSTRAINT "weekly_statistics_dataset_version_id_dataset_versions_id_fk" FOREIGN KEY ("dataset_version_id") REFERENCES "public"."dataset_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dataset_versions_visibility_owner_index" ON "dataset_versions" USING btree ("visibility","owner_user_id");--> statement-breakpoint
CREATE INDEX "draft_events_draft_sequence_index" ON "draft_events" USING btree ("draft_id","sequence");--> statement-breakpoint
CREATE INDEX "fantasy_rosters_team_status_index" ON "fantasy_rosters" USING btree ("fantasy_team_id","status");--> statement-breakpoint
CREATE INDEX "league_configurations_owner_index" ON "league_configurations" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "nfl_teams_abbreviation_unique" ON "nfl_teams" USING btree ("abbreviation");--> statement-breakpoint
CREATE INDEX "players_team_position_index" ON "players" USING btree ("team_id","position");--> statement-breakpoint
CREATE INDEX "private_data_imports_owner_created_index" ON "private_data_imports" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE INDEX "projection_runs_visibility_owner_index" ON "projection_runs" USING btree ("visibility","owner_user_id");--> statement-breakpoint
CREATE INDEX "ranking_runs_visibility_owner_index" ON "ranking_runs" USING btree ("visibility","owner_user_id");--> statement-breakpoint
CREATE INDEX "trade_evaluations_owner_created_index" ON "trade_evaluations" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_accounts_email_unique" ON "user_accounts" USING btree ("email");