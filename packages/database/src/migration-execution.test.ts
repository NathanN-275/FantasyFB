import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDatabase } from "./index.js";
import { migrateDatabase } from "../scripts/migrate.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const testIfDatabase = testDatabaseUrl ? it : it.skip;

describe("migration execution", () => {
  testIfDatabase("applies migrations and enforces database constraints", async () => {
    if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required for this test.");
    await migrateDatabase(testDatabaseUrl);
    const database = createDatabase(testDatabaseUrl);
    const userId = randomUUID();
    const otherUserId = randomUUID();
    const teamId = randomUUID();
    const playerId = randomUUID();
    const sourceId = randomUUID();
    const datasetId = randomUUID();
    const seasonId = randomUUID();
    const leagueId = randomUUID();
    const draftId = randomUUID();

    await database.execute(
      sql`insert into user_accounts (id) values (${userId}), (${otherUserId})`
    );
    await database.execute(
      sql`insert into nfl_teams (id, name, abbreviation) values (${teamId}, 'Test Team', ${`T${teamId.slice(0, 2)}`})`
    );
    await database.execute(
      sql`insert into players (id, full_name, position) values (${playerId}, 'Test Player', 'WR')`
    );
    await database.execute(
      sql`insert into player_external_ids (player_id, provider, external_id) values (${playerId}, 'fixture', 'player-1')`
    );
    await expect(
      database.execute(
        sql`insert into player_external_ids (player_id, provider, external_id) values (${playerId}, 'fixture', 'player-1')`
      )
    ).rejects.toThrow();

    await database.execute(
      sql`insert into data_sources (id, name, source_identifier) values (${sourceId}, 'Fixture', 'migration-test')`
    );
    await database.execute(
      sql`insert into dataset_versions (id, data_source_id, visibility, version, retrieved_at, validation_status, freshness_status) values (${datasetId}, ${sourceId}, 'public', 'v1', now(), 'valid', 'valid')`
    );
    await expect(
      database.execute(
        sql`insert into dataset_versions (id, data_source_id, visibility, version, retrieved_at, validation_status, freshness_status) values (${randomUUID()}, ${sourceId}, 'public', 'v1', now(), 'valid', 'valid')`
      )
    ).rejects.toThrow();
    await expect(
      database.execute(
        sql`insert into dataset_versions (id, data_source_id, visibility, version, retrieved_at, validation_status, freshness_status) values (${randomUUID()}, ${sourceId}, 'private', 'ownerless', now(), 'valid', 'valid')`
      )
    ).rejects.toThrow();

    await database.execute(
      sql`insert into seasons (id, year, kind) values (${seasonId}, 2026, 'regular')`
    );
    await expect(
      database.execute(
        sql`insert into weekly_statistics (player_id, team_id, season_id, week, dataset_version_id, values) values (${randomUUID()}, ${teamId}, ${seasonId}, 1, ${datasetId}, '{}'::jsonb)`
      )
    ).rejects.toThrow();

    await database.execute(
      sql`insert into league_configurations (id, owner_user_id, name, team_count) values (${leagueId}, ${userId}, 'Test League', 10)`
    );
    await database.execute(
      sql`insert into workspace_preferences (owner_user_id, default_league_id) values (${userId}, ${leagueId})`
    );
    await expect(
      database.execute(
        sql`insert into workspace_preferences (owner_user_id, default_league_id) values (${otherUserId}, ${randomUUID()})`
      )
    ).rejects.toThrow();
    await database.execute(
      sql`insert into drafts (id, league_configuration_id) values (${draftId}, ${leagueId})`
    );
    await database.execute(
      sql`insert into draft_events (draft_id, sequence, event_type, idempotency_key, payload) values (${draftId}, 1, 'pick_recorded', 'event-1', '{}'::jsonb)`
    );
    await expect(
      database.execute(
        sql`insert into draft_events (draft_id, sequence, event_type, idempotency_key, payload) values (${draftId}, 1, 'pick_recorded', 'event-2', '{}'::jsonb)`
      )
    ).rejects.toThrow();
    await expect(
      database.execute(
        sql`insert into draft_events (draft_id, sequence, event_type, idempotency_key, payload) values (${draftId}, 2, 'pick_recorded', 'event-1', '{}'::jsonb)`
      )
    ).rejects.toThrow();

    const table = await database.execute(
      sql`select to_regclass('public.draft_events') as relation`
    );
    expect(table.rows[0]?.relation).toBe("draft_events");
  });
});
