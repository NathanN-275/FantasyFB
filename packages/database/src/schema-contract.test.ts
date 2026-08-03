import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationDirectory = new URL("../../../drizzle/", import.meta.url);

async function migrationSql() {
  const files = [
    "0000_spotty_exodus.sql",
    "0001_brief_bloodstrike.sql",
    "0002_authentication_sessions.sql",
    "0003_organic_leo.sql",
    "0004_projection-engine-v1.sql",
    "0005_expert-imports-adp-snapshots.sql",
    "0006_wise_loa.sql",
    "0007_loud_miracleman.sql"
  ];
  return Promise.all(
    files.map((file) => readFile(fileURLToPath(new URL(file, migrationDirectory)), "utf8"))
  ).then((contents) => contents.join("\n"));
}

describe("initial database migrations", () => {
  it("creates every required database area", async () => {
    const sql = await migrationSql();
    for (const table of [
      "players",
      "nfl_teams",
      "player_external_ids",
      "seasons",
      "weekly_statistics",
      "season_statistics",
      "team_weekly_statistics",
      "team_season_statistics",
      "data_sources",
      "dataset_versions",
      "projection_runs",
      "player_projections",
      "ranking_runs",
      "player_rankings",
      "adp_snapshots",
      "league_configurations",
      "workspace_preferences",
      "league_scoring_rules",
      "roster_configurations",
      "fantasy_teams",
      "fantasy_rosters",
      "drafts",
      "draft_events",
      "draft_queues",
      "saved_players",
      "trade_evaluations",
      "news_records",
      "player_news",
      "private_data_imports",
      "expert_import_rows",
      "user_accounts",
      "authorized_user_identities",
      "auth_sessions"
    ]) {
      expect(sql).toContain(`CREATE TABLE "${table}"`);
    }
  });

  it("enforces external identity, versioning, privacy, and draft ordering constraints", async () => {
    const sql = await migrationSql();
    expect(sql).toContain("player_external_ids_provider_value_unique");
    expect(sql).toContain("dataset_versions_public_source_version_unique");
    expect(sql).toContain("dataset_versions_private_source_version_owner_unique");
    expect(sql).toContain("dataset_versions_private_owner_required");
    expect(sql).toContain("draft_events_draft_sequence_unique");
    expect(sql).toContain("draft_events_draft_idempotency_unique");
    expect(sql).toContain("auth_sessions_token_unique");
    expect(sql).toContain("workspace_preferences_owner_user_id_user_accounts_id_fk");
    expect(sql).toContain("workspace_preferences_default_league_id_league_configurations_id_fk");
    expect(sql).toContain("awaiting_confirmation");
    expect(sql).toContain("expert_import_rows_matched_player_required");
    expect(sql).toContain("adp_snapshots_provider_context_time_index");
    expect(sql).toContain("adp_snapshots_pick_bounds_valid");
    expect(sql).toContain("news_records_deduplication_key_unique");
    expect(sql).toContain("news_records_entity_confidence_valid");
    expect(sql).toContain("news_data_freshness");
    expect(sql).toContain('ALTER TYPE "public"."news_type" ADD VALUE \'contract\'');
    expect(sql).toContain('ALTER TYPE "public"."news_type" ADD VALUE \'suspension\'');
    expect(sql).toContain('REFERENCES "public"."players"');
    expect(sql).toContain('REFERENCES "public"."user_accounts"');
  });
});
