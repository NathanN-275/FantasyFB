import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const decimal = (name: string) => numeric(name, { precision: 14, scale: 4 });

export const dataVisibility = pgEnum("data_visibility", ["public", "sample", "private"]);
export const datasetStatus = pgEnum("dataset_status", [
  "pending",
  "valid",
  "invalid",
  "stale",
  "quarantined"
]);
export const importStatus = pgEnum("import_status", [
  "pending",
  "processing",
  "completed",
  "failed",
  "quarantined"
]);
export const seasonKind = pgEnum("season_kind", ["preseason", "regular", "postseason"]);
export const rosterSlotKind = pgEnum("roster_slot_kind", ["starter", "bench", "injured_reserve"]);
export const rosterEntryStatus = pgEnum("roster_entry_status", [
  "active",
  "bench",
  "injured_reserve",
  "waived"
]);
export const draftStatus = pgEnum("draft_status", [
  "scheduled",
  "in_progress",
  "paused",
  "completed",
  "cancelled"
]);
export const draftEventType = pgEnum("draft_event_type", [
  "pick_recorded",
  "pick_corrected",
  "pick_removed",
  "draft_paused",
  "draft_resumed",
  "draft_completed",
  "keeper_assigned",
  "pick_traded",
  "player_mapping_resolved"
]);
export const rankingKind = pgEnum("ranking_kind", ["model", "expert", "hybrid"]);
export const projectionKind = pgEnum("projection_kind", ["model", "expert", "hybrid"]);
export const tradeStatus = pgEnum("trade_status", ["draft", "evaluated", "archived"]);
export const newsType = pgEnum("news_type", [
  "injury",
  "transaction",
  "depth_chart",
  "game",
  "general"
]);

/** Auth is added in Prompt 4; these portable tables reserve the durable ownership boundary now. */
export const userAccounts = pgTable(
  "user_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    displayName: text("display_name"),
    email: text("email"),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    createdAt,
    updatedAt
  },
  (table) => [uniqueIndex("user_accounts_email_unique").on(table.email)]
);

export const authorizedUserIdentities = pgTable(
  "authorized_user_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => userAccounts.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    isAuthorized: boolean("is_authorized").notNull().default(false),
    createdAt,
    updatedAt
  },
  (table) => [
    unique("authorized_user_identities_provider_account_unique").on(
      table.provider,
      table.providerAccountId
    )
  ]
);

/** Server-side sessions for the Better Auth adapter. */
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => userAccounts.id, { onDelete: "cascade" }),
    createdAt,
    updatedAt
  },
  (table) => [
    unique("auth_sessions_token_unique").on(table.token),
    index("auth_sessions_user_id_index").on(table.userId)
  ]
);

export const nflTeams = pgTable(
  "nfl_teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    abbreviation: text("abbreviation").notNull(),
    conference: text("conference"),
    division: text("division"),
    active: boolean("active").notNull().default(true),
    createdAt,
    updatedAt
  },
  (table) => [uniqueIndex("nfl_teams_abbreviation_unique").on(table.abbreviation)]
);

export const players = pgTable(
  "players",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    position: text("position").notNull(),
    teamId: uuid("team_id").references(() => nflTeams.id, { onDelete: "set null" }),
    availability: text("availability").notNull().default("unknown"),
    injuryStatus: text("injury_status").notNull().default("unknown"),
    birthDate: timestamp("birth_date", { withTimezone: false }),
    active: boolean("active").notNull().default(true),
    createdAt,
    updatedAt
  },
  (table) => [index("players_team_position_index").on(table.teamId, table.position)]
);

export const playerExternalIds = pgTable(
  "player_external_ids",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    sourceUrl: text("source_url"),
    createdAt,
    updatedAt
  },
  (table) => [
    unique("player_external_ids_provider_value_unique").on(table.provider, table.externalId),
    unique("player_external_ids_player_provider_unique").on(table.playerId, table.provider)
  ]
);

export const seasons = pgTable(
  "seasons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    year: integer("year").notNull(),
    kind: seasonKind("kind").notNull().default("regular"),
    createdAt
  },
  (table) => [unique("seasons_year_kind_unique").on(table.year, table.kind)]
);

export const dataSources = pgTable(
  "data_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    sourceIdentifier: text("source_identifier").notNull(),
    sourceUrl: text("source_url"),
    licenseOrUsageNote: text("license_or_usage_note"),
    createdAt,
    updatedAt
  },
  (table) => [unique("data_sources_name_identifier_unique").on(table.name, table.sourceIdentifier)]
);

export const privateDataImports = pgTable(
  "private_data_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => userAccounts.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").references(() => dataSources.id, { onDelete: "set null" }),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    checksum: text("checksum").notNull(),
    status: importStatus("status").notNull().default("pending"),
    recordCount: integer("record_count"),
    errorMessage: text("error_message"),
    preserveOriginal: boolean("preserve_original").notNull().default(false),
    createdAt,
    completedAt: timestamp("completed_at", { withTimezone: true })
  },
  (table) => [
    index("private_data_imports_owner_created_index").on(table.ownerUserId, table.createdAt)
  ]
);

export const datasetVersions = pgTable(
  "dataset_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dataSourceId: uuid("data_source_id")
      .notNull()
      .references(() => dataSources.id, { onDelete: "restrict" }),
    importId: uuid("import_id").references(() => privateDataImports.id, { onDelete: "set null" }),
    ownerUserId: uuid("owner_user_id").references(() => userAccounts.id, { onDelete: "cascade" }),
    visibility: dataVisibility("visibility").notNull(),
    version: text("version").notNull(),
    seasonYear: integer("season_year"),
    week: integer("week"),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }),
    validationStatus: datasetStatus("validation_status").notNull(),
    freshnessStatus: datasetStatus("freshness_status").notNull(),
    recordCount: integer("record_count").notNull().default(0),
    licenseOrUsageNote: text("license_or_usage_note"),
    createdAt
  },
  (table) => [
    uniqueIndex("dataset_versions_public_source_version_unique")
      .on(table.dataSourceId, table.version)
      .where(sql`${table.ownerUserId} is null`),
    uniqueIndex("dataset_versions_private_source_version_owner_unique")
      .on(table.dataSourceId, table.version, table.ownerUserId)
      .where(sql`${table.ownerUserId} is not null`),
    index("dataset_versions_visibility_owner_index").on(table.visibility, table.ownerUserId),
    check(
      "dataset_versions_private_owner_required",
      sql`(${table.visibility} <> 'private' or ${table.ownerUserId} is not null)`
    )
  ]
);

export const weeklyStatistics = pgTable(
  "weekly_statistics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => nflTeams.id, { onDelete: "restrict" }),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "restrict" }),
    week: integer("week").notNull(),
    datasetVersionId: uuid("dataset_version_id")
      .notNull()
      .references(() => datasetVersions.id, { onDelete: "restrict" }),
    values: jsonb("values").notNull(),
    createdAt
  },
  (table) => [
    unique("weekly_statistics_player_season_week_dataset_unique").on(
      table.playerId,
      table.seasonId,
      table.week,
      table.datasetVersionId
    ),
    check("weekly_statistics_week_positive", sql`${table.week} > 0`)
  ]
);

export const seasonStatistics = pgTable(
  "season_statistics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => nflTeams.id, { onDelete: "restrict" }),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "restrict" }),
    datasetVersionId: uuid("dataset_version_id")
      .notNull()
      .references(() => datasetVersions.id, { onDelete: "restrict" }),
    values: jsonb("values").notNull(),
    createdAt
  },
  (table) => [
    unique("season_statistics_player_team_season_dataset_unique").on(
      table.playerId,
      table.teamId,
      table.seasonId,
      table.datasetVersionId
    )
  ]
);

/** Provider-normalized team totals; the UI reads these instead of aggregating player rows. */
export const teamWeeklyStatistics = pgTable(
  "team_weekly_statistics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => nflTeams.id, { onDelete: "restrict" }),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "restrict" }),
    week: integer("week").notNull(),
    datasetVersionId: uuid("dataset_version_id")
      .notNull()
      .references(() => datasetVersions.id, { onDelete: "restrict" }),
    values: jsonb("values").notNull(),
    createdAt
  },
  (table) => [
    unique("team_weekly_statistics_team_season_week_dataset_unique").on(
      table.teamId,
      table.seasonId,
      table.week,
      table.datasetVersionId
    ),
    check("team_weekly_statistics_week_positive", sql`${table.week} > 0`)
  ]
);

export const teamSeasonStatistics = pgTable(
  "team_season_statistics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => nflTeams.id, { onDelete: "restrict" }),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "restrict" }),
    datasetVersionId: uuid("dataset_version_id")
      .notNull()
      .references(() => datasetVersions.id, { onDelete: "restrict" }),
    values: jsonb("values").notNull(),
    createdAt
  },
  (table) => [
    unique("team_season_statistics_team_season_dataset_unique").on(
      table.teamId,
      table.seasonId,
      table.datasetVersionId
    )
  ]
);

export const projectionRuns = pgTable(
  "projection_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    datasetVersionId: uuid("dataset_version_id")
      .notNull()
      .references(() => datasetVersions.id, { onDelete: "restrict" }),
    ownerUserId: uuid("owner_user_id").references(() => userAccounts.id, { onDelete: "cascade" }),
    visibility: dataVisibility("visibility").notNull(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "restrict" }),
    projectionKind: projectionKind("projection_kind").notNull(),
    modelVersion: text("model_version"),
    featureVersion: text("feature_version"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    createdAt
  },
  (table) => [
    index("projection_runs_visibility_owner_index").on(table.visibility, table.ownerUserId),
    check(
      "projection_runs_private_owner_required",
      sql`(${table.visibility} <> 'private' or ${table.ownerUserId} is not null)`
    )
  ]
);

export const playerProjections = pgTable(
  "player_projections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectionRunId: uuid("projection_run_id")
      .notNull()
      .references(() => projectionRuns.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    projectedStats: jsonb("projected_stats").notNull(),
    projectedPoints: decimal("projected_points"),
    floorPoints: decimal("floor_points"),
    medianPoints: decimal("median_points"),
    ceilingPoints: decimal("ceiling_points"),
    confidence: decimal("confidence"),
    createdAt
  },
  (table) => [
    unique("player_projections_run_player_unique").on(table.projectionRunId, table.playerId)
  ]
);

export const rankingRuns = pgTable(
  "ranking_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    datasetVersionId: uuid("dataset_version_id").references(() => datasetVersions.id, {
      onDelete: "restrict"
    }),
    ownerUserId: uuid("owner_user_id").references(() => userAccounts.id, { onDelete: "cascade" }),
    visibility: dataVisibility("visibility").notNull(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "restrict" }),
    rankingKind: rankingKind("ranking_kind").notNull(),
    version: text("version").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    createdAt
  },
  (table) => [
    index("ranking_runs_visibility_owner_index").on(table.visibility, table.ownerUserId),
    check(
      "ranking_runs_private_owner_required",
      sql`(${table.visibility} <> 'private' or ${table.ownerUserId} is not null)`
    )
  ]
);

export const playerRankings = pgTable(
  "player_rankings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rankingRunId: uuid("ranking_run_id")
      .notNull()
      .references(() => rankingRuns.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
    score: decimal("score"),
    rationale: jsonb("rationale").notNull().default({}),
    createdAt
  },
  (table) => [
    unique("player_rankings_run_player_unique").on(table.rankingRunId, table.playerId),
    unique("player_rankings_run_rank_unique").on(table.rankingRunId, table.rank),
    check("player_rankings_rank_positive", sql`${table.rank} > 0`)
  ]
);

export const adpSnapshots = pgTable(
  "adp_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    datasetVersionId: uuid("dataset_version_id")
      .notNull()
      .references(() => datasetVersions.id, { onDelete: "restrict" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "restrict" }),
    averageDraftPosition: decimal("average_draft_position").notNull(),
    sampleSize: integer("sample_size"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    createdAt
  },
  (table) => [
    unique("adp_snapshots_dataset_player_unique").on(table.datasetVersionId, table.playerId)
  ]
);

export const leagueConfigurations = pgTable(
  "league_configurations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => userAccounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    teamCount: integer("team_count").notNull(),
    provider: text("provider"),
    externalLeagueId: text("external_league_id"),
    createdAt,
    updatedAt
  },
  (table) => [
    unique("league_configurations_provider_external_unique").on(
      table.ownerUserId,
      table.provider,
      table.externalLeagueId
    ),
    index("league_configurations_owner_index").on(table.ownerUserId),
    check("league_configurations_team_count_positive", sql`${table.teamCount} > 0`)
  ]
);

export const leagueScoringRules = pgTable(
  "league_scoring_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueConfigurationId: uuid("league_configuration_id")
      .notNull()
      .references(() => leagueConfigurations.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    name: text("name").notNull(),
    rules: jsonb("rules").notNull(),
    createdAt
  },
  (table) => [
    unique("league_scoring_rules_league_version_unique").on(
      table.leagueConfigurationId,
      table.version
    )
  ]
);

export const rosterConfigurations = pgTable(
  "roster_configurations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueConfigurationId: uuid("league_configuration_id")
      .notNull()
      .references(() => leagueConfigurations.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    slots: jsonb("slots").notNull(),
    createdAt
  },
  (table) => [
    unique("roster_configurations_league_version_unique").on(
      table.leagueConfigurationId,
      table.version
    )
  ]
);

export const fantasyTeams = pgTable(
  "fantasy_teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueConfigurationId: uuid("league_configuration_id")
      .notNull()
      .references(() => leagueConfigurations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ownerLabel: text("owner_label"),
    externalTeamId: text("external_team_id"),
    createdAt,
    updatedAt
  },
  (table) => [
    unique("fantasy_teams_league_name_unique").on(table.leagueConfigurationId, table.name),
    unique("fantasy_teams_league_external_unique").on(
      table.leagueConfigurationId,
      table.externalTeamId
    )
  ]
);

export const fantasyRosters = pgTable(
  "fantasy_rosters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fantasyTeamId: uuid("fantasy_team_id")
      .notNull()
      .references(() => fantasyTeams.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    status: rosterEntryStatus("status").notNull().default("active"),
    acquiredAt: timestamp("acquired_at", { withTimezone: true }).notNull().defaultNow(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    createdAt
  },
  (table) => [index("fantasy_rosters_team_status_index").on(table.fantasyTeamId, table.status)]
);

export const drafts = pgTable(
  "drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueConfigurationId: uuid("league_configuration_id")
      .notNull()
      .references(() => leagueConfigurations.id, { onDelete: "cascade" }),
    provider: text("provider"),
    externalDraftId: text("external_draft_id"),
    status: draftStatus("status").notNull().default("scheduled"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    createdAt,
    updatedAt
  },
  (table) => [
    unique("drafts_league_provider_external_unique").on(
      table.leagueConfigurationId,
      table.provider,
      table.externalDraftId
    )
  ]
);

export const draftEvents = pgTable(
  "draft_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => drafts.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    eventType: draftEventType("event_type").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    providerEventId: text("provider_event_id"),
    providerTimestamp: timestamp("provider_timestamp", { withTimezone: true }),
    payload: jsonb("payload").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt
  },
  (table) => [
    unique("draft_events_draft_sequence_unique").on(table.draftId, table.sequence),
    unique("draft_events_draft_idempotency_unique").on(table.draftId, table.idempotencyKey),
    index("draft_events_draft_sequence_index").on(table.draftId, table.sequence),
    check("draft_events_sequence_positive", sql`${table.sequence} > 0`)
  ]
);

export const draftQueues = pgTable(
  "draft_queues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => drafts.id, { onDelete: "cascade" }),
    fantasyTeamId: uuid("fantasy_team_id").references(() => fantasyTeams.id, {
      onDelete: "cascade"
    }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    createdAt,
    updatedAt
  },
  (table) => [
    unique("draft_queues_draft_team_player_unique").on(
      table.draftId,
      table.fantasyTeamId,
      table.playerId
    ),
    unique("draft_queues_draft_team_position_unique").on(
      table.draftId,
      table.fantasyTeamId,
      table.position
    ),
    check("draft_queues_position_positive", sql`${table.position} > 0`)
  ]
);

export const savedPlayers = pgTable(
  "saved_players",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => userAccounts.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    note: text("note"),
    createdAt
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.playerId],
      name: "saved_players_user_player_primary"
    })
  ]
);

export const tradeEvaluations = pgTable(
  "trade_evaluations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => userAccounts.id, { onDelete: "cascade" }),
    leagueConfigurationId: uuid("league_configuration_id").references(
      () => leagueConfigurations.id,
      { onDelete: "set null" }
    ),
    status: tradeStatus("status").notNull().default("draft"),
    sideA: jsonb("side_a").notNull(),
    sideB: jsonb("side_b").notNull(),
    result: jsonb("result"),
    createdAt,
    updatedAt
  },
  (table) => [index("trade_evaluations_owner_created_index").on(table.ownerUserId, table.createdAt)]
);

export const newsRecords = pgTable(
  "news_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    datasetVersionId: uuid("dataset_version_id")
      .notNull()
      .references(() => datasetVersions.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    sourceUrl: text("source_url").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    newsType: newsType("news_type").notNull().default("general"),
    createdAt
  },
  (table) => [
    unique("news_records_dataset_source_url_unique").on(table.datasetVersionId, table.sourceUrl)
  ]
);

export const playerNews = pgTable(
  "player_news",
  {
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    newsRecordId: uuid("news_record_id")
      .notNull()
      .references(() => newsRecords.id, { onDelete: "cascade" }),
    relevance: decimal("relevance"),
    createdAt
  },
  (table) => [
    primaryKey({ columns: [table.playerId, table.newsRecordId], name: "player_news_primary" })
  ]
);
