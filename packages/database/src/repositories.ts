import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, sql, type InferSelectModel, type SQL } from "drizzle-orm";
import type {
  AdpRepository,
  AuthorizationContext,
  ConfirmedExpertImportRecord,
  DraftEventRecord,
  DraftRepository,
  HistoricalStatisticsRepository,
  ImportRepository,
  LeagueRepository,
  NewsRepository,
  NewsRecord,
  NewNewsSnapshotRecord,
  PlayerRepository,
  PlayerRecord,
  ProjectionRepository,
  RankingRepository,
  NewExpertImportRowRecord,
  NewTradeEvaluationRecord,
  StatsRepository,
  TradeRepository,
  WorkspacePreferencesInput,
  WorkspaceRepository,
  VisiblePlayerQuery,
  VisibleNewsQuery,
  VisibleSeasonQuery
} from "@fantasyfb/contracts";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  adpSnapshots,
  dataSources,
  dataVisibility,
  datasetVersions,
  draftEvents,
  draftQueues,
  drafts,
  expertImportRows,
  leagueConfigurations,
  leagueScoringRules,
  newsRecords,
  nflTeams,
  playerExternalIds,
  playerNews,
  playerProjections,
  playerRankings,
  players,
  privateDataImports,
  projectionRuns,
  rankingRuns,
  seasons,
  seasonStatistics,
  teamSeasonStatistics,
  teamWeeklyStatistics,
  tradeEvaluations,
  workspacePreferences,
  weeklyStatistics
} from "./schema.js";
import type { Database } from "./types.js";

type Visibility = (typeof dataVisibility.enumValues)[number];
type DraftEventType = (typeof import("./schema.js").draftEventType.enumValues)[number];

function requiredOwner(
  context: AuthorizationContext | undefined,
  visibility: Visibility
): string | undefined {
  if (visibility !== "private") return undefined;
  if (!context) throw new Error("Private data access requires authorization context.");
  return context.userId;
}

function visibleDatasetCondition(
  query: VisibleSeasonQuery,
  table: { visibility: AnyPgColumn; ownerUserId: AnyPgColumn }
): SQL | undefined {
  const ownerUserId = requiredOwner(query.authorization, query.visibility);
  const conditions: SQL[] = [eq(table.visibility, query.visibility)];
  if (ownerUserId) conditions.push(eq(table.ownerUserId, ownerUserId));
  return and(...conditions);
}

async function assertOwnedDraft(
  database: Database,
  context: AuthorizationContext,
  draftId: string
) {
  const [draft] = await database
    .select({ id: drafts.id })
    .from(drafts)
    .innerJoin(leagueConfigurations, eq(drafts.leagueConfigurationId, leagueConfigurations.id))
    .where(and(eq(drafts.id, draftId), eq(leagueConfigurations.ownerUserId, context.userId)))
    .limit(1);
  if (!draft) throw new Error("Draft was not found for the authorized user.");
}

async function assertOwnedLeague(
  database: Database,
  context: AuthorizationContext,
  leagueConfigurationId: string
) {
  const [league] = await database
    .select({ id: leagueConfigurations.id })
    .from(leagueConfigurations)
    .where(
      and(
        eq(leagueConfigurations.id, leagueConfigurationId),
        eq(leagueConfigurations.ownerUserId, context.userId)
      )
    )
    .limit(1);
  if (!league) throw new Error("League configuration was not found for the authorized user.");
}

export function createRepositories(database: Database): {
  playerRepository: PlayerRepository;
  statsRepository: StatsRepository;
  historicalStatisticsRepository: HistoricalStatisticsRepository;
  projectionRepository: ProjectionRepository;
  rankingRepository: RankingRepository;
  leagueRepository: LeagueRepository;
  draftRepository: DraftRepository;
  tradeRepository: TradeRepository;
  newsRepository: NewsRepository;
  importRepository: ImportRepository;
  adpRepository: AdpRepository;
  workspaceRepository: WorkspaceRepository;
} {
  const playerRepository: PlayerRepository = {
    async findById(playerId) {
      const [player] = await database
        .select({
          id: players.id,
          fullName: players.fullName,
          position: players.position,
          teamId: players.teamId
        })
        .from(players)
        .where(eq(players.id, playerId))
        .limit(1);
      return player;
    },
    async findByExternalId(provider, externalId) {
      const [player] = await database
        .select({
          id: players.id,
          fullName: players.fullName,
          position: players.position,
          teamId: players.teamId
        })
        .from(playerExternalIds)
        .innerJoin(players, eq(playerExternalIds.playerId, players.id))
        .where(
          and(
            eq(playerExternalIds.provider, provider),
            eq(playerExternalIds.externalId, externalId)
          )
        )
        .limit(1);
      return player;
    },
    async listResolutionCandidates() {
      const records = await database
        .select({
          id: players.id,
          fullName: players.fullName,
          position: players.position,
          team: nflTeams.abbreviation,
          externalProvider: playerExternalIds.provider,
          externalValue: playerExternalIds.externalId
        })
        .from(players)
        .leftJoin(nflTeams, eq(players.teamId, nflTeams.id))
        .leftJoin(playerExternalIds, eq(players.id, playerExternalIds.playerId))
        .orderBy(asc(players.fullName));
      const candidates = new Map<
        string,
        {
          id: string;
          fullName: string;
          position: string;
          team?: string;
          externalIds: { provider: string; value: string }[];
        }
      >();
      for (const record of records) {
        const candidate = candidates.get(record.id) ?? {
          id: record.id,
          fullName: record.fullName,
          position: record.position,
          ...(record.team ? { team: record.team } : {}),
          externalIds: []
        };
        if (record.externalProvider && record.externalValue) {
          candidate.externalIds.push({
            provider: record.externalProvider,
            value: record.externalValue
          });
        }
        candidates.set(record.id, candidate);
      }
      return [...candidates.values()];
    },
    async upsert(record) {
      const [player] = await database
        .insert(players)
        .values({
          id: record.id,
          fullName: record.fullName,
          position: record.position,
          teamId: record.teamId,
          availability: record.availability ?? "unknown",
          injuryStatus: record.injuryStatus ?? "unknown"
        })
        .onConflictDoUpdate({
          target: players.id,
          set: {
            fullName: record.fullName,
            position: record.position,
            teamId: record.teamId,
            availability: record.availability ?? "unknown",
            injuryStatus: record.injuryStatus ?? "unknown",
            updatedAt: sql`now()`
          }
        })
        .returning({
          id: players.id,
          fullName: players.fullName,
          position: players.position,
          teamId: players.teamId
        });

      if (!player) throw new Error("Player upsert did not return a player.");
      for (const externalId of record.externalIds) {
        await database
          .insert(playerExternalIds)
          .values({ playerId: player.id, ...externalId })
          .onConflictDoUpdate({
            target: [playerExternalIds.provider, playerExternalIds.externalId],
            set: { playerId: player.id, sourceUrl: externalId.sourceUrl, updatedAt: sql`now()` }
          });
      }
      return player as PlayerRecord;
    }
  };

  const statsRepository: StatsRepository = {
    async upsertWeekly(record) {
      await database
        .insert(weeklyStatistics)
        .values(record)
        .onConflictDoUpdate({
          target: [
            weeklyStatistics.playerId,
            weeklyStatistics.seasonId,
            weeklyStatistics.week,
            weeklyStatistics.datasetVersionId
          ],
          set: { teamId: record.teamId, values: record.values }
        });
    },
    async upsertSeason(record) {
      await database
        .insert(seasonStatistics)
        .values(record)
        .onConflictDoUpdate({
          target: [
            seasonStatistics.playerId,
            seasonStatistics.teamId,
            seasonStatistics.seasonId,
            seasonStatistics.datasetVersionId
          ],
          set: { values: record.values }
        });
    }
  };

  const historicalStatisticsRepository: HistoricalStatisticsRepository = {
    async listPlayerWeeks(input) {
      const visibility = visibleDatasetCondition(input, datasetVersions);
      const records = await database
        .select({
          teamId: weeklyStatistics.teamId,
          week: weeklyStatistics.week,
          values: weeklyStatistics.values
        })
        .from(weeklyStatistics)
        .innerJoin(datasetVersions, eq(weeklyStatistics.datasetVersionId, datasetVersions.id))
        .where(
          and(
            eq(weeklyStatistics.playerId, input.playerId),
            eq(weeklyStatistics.seasonId, input.seasonId),
            eq(weeklyStatistics.datasetVersionId, input.datasetVersionId),
            visibility
          )
        )
        .orderBy(asc(weeklyStatistics.week));
      return records.map((record) => ({
        ...record,
        values: numericStatisticValues(record.values)
      }));
    },
    async listPlayerSeasons(input) {
      const visibility = visibleDatasetCondition(input, datasetVersions);
      const records = await database
        .select({ teamId: seasonStatistics.teamId, values: seasonStatistics.values })
        .from(seasonStatistics)
        .innerJoin(datasetVersions, eq(seasonStatistics.datasetVersionId, datasetVersions.id))
        .where(
          and(
            eq(seasonStatistics.playerId, input.playerId),
            eq(seasonStatistics.seasonId, input.seasonId),
            eq(seasonStatistics.datasetVersionId, input.datasetVersionId),
            visibility
          )
        );
      return records.map((record) => ({
        ...record,
        values: numericStatisticValues(record.values)
      }));
    },
    async listTeamWeeks(input) {
      const visibility = visibleDatasetCondition(input, datasetVersions);
      const records = await database
        .select({
          teamId: teamWeeklyStatistics.teamId,
          week: teamWeeklyStatistics.week,
          values: teamWeeklyStatistics.values
        })
        .from(teamWeeklyStatistics)
        .innerJoin(datasetVersions, eq(teamWeeklyStatistics.datasetVersionId, datasetVersions.id))
        .where(
          and(
            eq(teamWeeklyStatistics.teamId, input.teamId),
            eq(teamWeeklyStatistics.seasonId, input.seasonId),
            eq(teamWeeklyStatistics.datasetVersionId, input.datasetVersionId),
            visibility
          )
        )
        .orderBy(asc(teamWeeklyStatistics.week));
      return records.map((record) => ({
        ...record,
        values: numericStatisticValues(record.values)
      }));
    },
    async listTeamSeasons(input) {
      const visibility = visibleDatasetCondition(input, datasetVersions);
      const records = await database
        .select({ teamId: teamSeasonStatistics.teamId, values: teamSeasonStatistics.values })
        .from(teamSeasonStatistics)
        .innerJoin(datasetVersions, eq(teamSeasonStatistics.datasetVersionId, datasetVersions.id))
        .where(
          and(
            eq(teamSeasonStatistics.teamId, input.teamId),
            eq(teamSeasonStatistics.seasonId, input.seasonId),
            eq(teamSeasonStatistics.datasetVersionId, input.datasetVersionId),
            visibility
          )
        );
      return records.map((record) => ({
        ...record,
        values: numericStatisticValues(record.values)
      }));
    }
  };

  const projectionRepository: ProjectionRepository = {
    async listForSeason(query) {
      const visibility = visibleDatasetCondition(query, projectionRuns);
      return database
        .select({
          playerId: playerProjections.playerId,
          seasonId: projectionRuns.seasonId,
          projectedGames: playerProjections.projectedGames,
          projectedStatistics: playerProjections.projectedStats,
          projectedPoints: playerProjections.projectedPoints,
          projectedPointsPerGame: playerProjections.projectedPointsPerGame,
          floorPoints: playerProjections.floorPoints,
          medianPoints: playerProjections.medianPoints,
          ceilingPoints: playerProjections.ceilingPoints,
          confidence: playerProjections.confidence,
          projectionKind: projectionRuns.projectionKind,
          modelVersion: projectionRuns.modelVersion,
          featureVersion: projectionRuns.featureVersion,
          scoringConfigurationIdentifier: projectionRuns.scoringConfigurationIdentifier,
          generatedAt: projectionRuns.generatedAt
        })
        .from(playerProjections)
        .innerJoin(projectionRuns, eq(playerProjections.projectionRunId, projectionRuns.id))
        .where(and(eq(projectionRuns.seasonId, query.seasonId), visibility))
        .then((records) =>
          records.map((record) => ({
            ...record,
            projectedStatistics: numericStatisticValues(record.projectedStatistics)
          }))
        );
    }
  };

  const rankingRepository: RankingRepository = {
    async listForSeason(query) {
      const visibility = visibleDatasetCondition(query, rankingRuns);
      return database
        .select({
          playerId: playerRankings.playerId,
          rank: playerRankings.rank,
          rankingKind: rankingRuns.rankingKind
        })
        .from(playerRankings)
        .innerJoin(rankingRuns, eq(playerRankings.rankingRunId, rankingRuns.id))
        .where(and(eq(rankingRuns.seasonId, query.seasonId), visibility))
        .orderBy(asc(playerRankings.rank));
    }
  };

  const leagueRepository: LeagueRepository = {
    async list(context) {
      return database
        .select({
          id: leagueConfigurations.id,
          name: leagueConfigurations.name,
          teamCount: leagueConfigurations.teamCount
        })
        .from(leagueConfigurations)
        .where(eq(leagueConfigurations.ownerUserId, context.userId));
    },
    async findById(context, leagueId) {
      const [league] = await database
        .select({
          id: leagueConfigurations.id,
          name: leagueConfigurations.name,
          teamCount: leagueConfigurations.teamCount
        })
        .from(leagueConfigurations)
        .where(
          and(
            eq(leagueConfigurations.id, leagueId),
            eq(leagueConfigurations.ownerUserId, context.userId)
          )
        )
        .limit(1);
      return league;
    }
  };

  const draftRepository: DraftRepository = {
    async listEvents(context, draftId) {
      await assertOwnedDraft(database, context, draftId);
      return database
        .select({
          id: draftEvents.id,
          draftId: draftEvents.draftId,
          sequence: draftEvents.sequence,
          eventType: draftEvents.eventType,
          idempotencyKey: draftEvents.idempotencyKey,
          payload: draftEvents.payload,
          providerEventId: draftEvents.providerEventId,
          providerTimestamp: draftEvents.providerTimestamp,
          receivedAt: draftEvents.receivedAt
        })
        .from(draftEvents)
        .where(eq(draftEvents.draftId, draftId))
        .orderBy(asc(draftEvents.sequence))
        .then((events) => events as DraftEventRecord[]);
    },
    async appendEvent(context, event) {
      await assertOwnedDraft(database, context, event.draftId);
      const values = {
        ...event,
        eventType: event.eventType as DraftEventType
      };
      const [inserted] = await database
        .insert(draftEvents)
        .values(values)
        .onConflictDoNothing({ target: [draftEvents.draftId, draftEvents.idempotencyKey] })
        .returning();
      if (inserted) return inserted as DraftEventRecord;

      const [existing] = await database
        .select()
        .from(draftEvents)
        .where(
          and(
            eq(draftEvents.draftId, event.draftId),
            eq(draftEvents.idempotencyKey, event.idempotencyKey)
          )
        )
        .limit(1);
      if (!existing) throw new Error("Draft event was not persisted.");
      return existing as DraftEventRecord;
    }
  };

  const tradeRepository: TradeRepository = {
    async list(context) {
      return database
        .select({
          id: tradeEvaluations.id,
          status: tradeEvaluations.status,
          leagueConfigurationId: tradeEvaluations.leagueConfigurationId,
          sideA: tradeEvaluations.sideA,
          sideB: tradeEvaluations.sideB,
          result: tradeEvaluations.result,
          createdAt: tradeEvaluations.createdAt,
          updatedAt: tradeEvaluations.updatedAt
        })
        .from(tradeEvaluations)
        .where(eq(tradeEvaluations.ownerUserId, context.userId))
        .orderBy(desc(tradeEvaluations.createdAt));
    },
    async save(context, evaluation: NewTradeEvaluationRecord) {
      if (evaluation.leagueConfigurationId) {
        await assertOwnedLeague(database, context, evaluation.leagueConfigurationId);
      }
      const [saved] = await database
        .insert(tradeEvaluations)
        .values({
          ownerUserId: context.userId,
          leagueConfigurationId: evaluation.leagueConfigurationId,
          status: evaluation.status ?? "evaluated",
          sideA: evaluation.sideA,
          sideB: evaluation.sideB,
          result: evaluation.result,
          updatedAt: new Date()
        })
        .returning({
          id: tradeEvaluations.id,
          status: tradeEvaluations.status,
          leagueConfigurationId: tradeEvaluations.leagueConfigurationId,
          sideA: tradeEvaluations.sideA,
          sideB: tradeEvaluations.sideB,
          result: tradeEvaluations.result,
          createdAt: tradeEvaluations.createdAt,
          updatedAt: tradeEvaluations.updatedAt
        });
      if (!saved) throw new Error("Trade evaluation was not persisted.");
      return saved;
    }
  };

  const newsRepository: NewsRepository = {
    async listEntityCatalog() {
      const [playerRows, teamRows] = await Promise.all([
        database
          .select({
            id: players.id,
            fullName: players.fullName,
            position: players.position,
            currentTeam: nflTeams.abbreviation
          })
          .from(players)
          .leftJoin(nflTeams, eq(players.teamId, nflTeams.id))
          .where(eq(players.active, true))
          .orderBy(asc(players.fullName)),
        database
          .select({
            abbreviation: nflTeams.abbreviation,
            name: nflTeams.name
          })
          .from(nflTeams)
          .where(eq(nflTeams.active, true))
          .orderBy(asc(nflTeams.abbreviation))
      ]);
      return {
        players: playerRows.map((player) => ({
          id: player.id,
          fullName: player.fullName,
          position: player.position,
          ...(player.currentTeam ? { currentTeam: player.currentTeam } : {})
        })),
        teams: teamRows
      };
    },
    async list(query) {
      return listNews(database, query);
    },
    async listForPlayer(query: VisiblePlayerQuery) {
      return listNews(database, {
        playerId: query.playerId,
        visibility: query.visibility,
        ...(query.authorization ? { authorization: query.authorization } : {})
      });
    },
    async findLatestSourceSnapshot(sourceIdentifier) {
      const [latest] = await database
        .select({
          sourceId: dataSources.sourceIdentifier,
          sourceName: dataSources.name,
          datasetVersion: datasetVersions.version,
          retrievedAt: datasetVersions.retrievedAt,
          visibility: datasetVersions.visibility
        })
        .from(datasetVersions)
        .innerJoin(dataSources, eq(datasetVersions.dataSourceId, dataSources.id))
        .where(
          and(
            eq(dataSources.sourceIdentifier, sourceIdentifier),
            eq(datasetVersions.validationStatus, "valid")
          )
        )
        .orderBy(desc(datasetVersions.retrievedAt))
        .limit(1);
      if (!latest || latest.visibility === "private") return undefined;
      const records = await listNews(database, {
        visibility: latest.visibility,
        sourceIdentifier,
        limit: 500
      });
      return {
        sourceId: latest.sourceId,
        sourceName: latest.sourceName,
        datasetVersion: latest.datasetVersion,
        retrievedAt: latest.retrievedAt,
        records: records.filter((record) => record.source.id === sourceIdentifier)
      };
    },
    async saveSnapshot(input: NewNewsSnapshotRecord) {
      const [source] = await database
        .insert(dataSources)
        .values({
          name: input.source.name,
          sourceIdentifier: input.source.sourceIdentifier,
          sourceUrl: input.source.feedUrl,
          licenseOrUsageNote: input.source.usageNote
        })
        .onConflictDoUpdate({
          target: [dataSources.name, dataSources.sourceIdentifier],
          set: {
            sourceUrl: input.source.feedUrl,
            licenseOrUsageNote: input.source.usageNote,
            updatedAt: sql`now()`
          }
        })
        .returning({ id: dataSources.id });
      if (!source) throw new Error("News data source could not be persisted.");

      const datasetId = randomUUID();
      const [insertedDataset] = await database
        .insert(datasetVersions)
        .values({
          id: datasetId,
          dataSourceId: source.id,
          visibility: input.visibility,
          version: input.datasetVersion,
          retrievedAt: input.retrievedAt,
          validationStatus: "valid",
          freshnessStatus: input.records.some((record) => record.dataFreshness !== "current")
            ? "stale"
            : "valid",
          recordCount: input.records.length,
          licenseOrUsageNote: input.source.usageNote
        })
        .onConflictDoNothing()
        .returning({ id: datasetVersions.id });
      const persistedDatasetId =
        insertedDataset?.id ??
        (
          await database
            .select({ id: datasetVersions.id })
            .from(datasetVersions)
            .where(
              and(
                eq(datasetVersions.dataSourceId, source.id),
                eq(datasetVersions.version, input.datasetVersion)
              )
            )
            .limit(1)
        )[0]?.id;
      if (!persistedDatasetId) throw new Error("News dataset version could not be persisted.");

      for (const record of input.records) {
        const [saved] = await database
          .insert(newsRecords)
          .values({
            datasetVersionId: persistedDatasetId,
            title: record.headline,
            summary: record.permittedExcerpt,
            sourceUrl: record.originalArticleUrl,
            publishedAt: record.publicationTime,
            retrievedAt: record.retrievedTime,
            newsType: record.category,
            reportedFacts: [...record.reportedFacts],
            relatedTeams: [...record.relatedTeams],
            injuryInformation: record.injuryInformation ?? null,
            fantasyRelevance: record.fantasyRelevance.text,
            interpretationReasoning: [...record.fantasyRelevance.reasoning],
            entityMatchConfidence: String(record.entityMatchConfidence),
            dataFreshness: record.dataFreshness,
            deduplicationKey: record.deduplicationKey,
            updatedAt: input.retrievedAt
          })
          .onConflictDoUpdate({
            target: newsRecords.deduplicationKey,
            set: {
              datasetVersionId: persistedDatasetId,
              title: record.headline,
              summary: record.permittedExcerpt,
              sourceUrl: record.originalArticleUrl,
              publishedAt: record.publicationTime,
              retrievedAt: record.retrievedTime,
              newsType: record.category,
              reportedFacts: [...record.reportedFacts],
              relatedTeams: [...record.relatedTeams],
              injuryInformation: record.injuryInformation ?? null,
              fantasyRelevance: record.fantasyRelevance.text,
              interpretationReasoning: [...record.fantasyRelevance.reasoning],
              entityMatchConfidence: String(record.entityMatchConfidence),
              dataFreshness: record.dataFreshness,
              updatedAt: input.retrievedAt
            }
          })
          .returning({ id: newsRecords.id });
        if (!saved) throw new Error("News record could not be persisted.");

        await database.delete(playerNews).where(eq(playerNews.newsRecordId, saved.id));
        if (record.relatedPlayers.length) {
          await database
            .insert(playerNews)
            .values(
              record.relatedPlayers.map((player) => ({
                playerId: player.id,
                newsRecordId: saved.id,
                relevance: String(player.confidence),
                matchedText: player.matchedText
              }))
            )
            .onConflictDoNothing();
        }
      }

      return {
        datasetVersionId: persistedDatasetId,
        persistedRecordCount: input.records.length,
        retrievedAt: input.retrievedAt
      };
    }
  };

  const importRepository: ImportRepository = {
    async list(context) {
      return database
        .select({
          id: privateDataImports.id,
          fileName: privateDataImports.fileName,
          status: privateDataImports.status
        })
        .from(privateDataImports)
        .where(eq(privateDataImports.ownerUserId, context.userId));
    },
    async stageExpertImport(context, input) {
      const summary = summarizeImportRows(input.rows);
      const season = await ensureSeason(database, input.seasonYear);
      const importId = randomUUID();
      const importValues = {
        id: importId,
        ownerUserId: context.userId,
        seasonId: season.id,
        providerName: input.providerName,
        importKind: input.importKind,
        importProfile: input.importProfile,
        fileName: input.fileName,
        contentType: input.contentType,
        checksum: input.checksum,
        status: "awaiting_confirmation" as const,
        recordCount: input.rows.length,
        preserveOriginal: input.preserveOriginal,
        ...(input.originalContent ? { originalContent: input.originalContent } : {}),
        previewSummary: summary
      };
      if (input.rows.length) {
        await database.batch([
          database.insert(privateDataImports).values(importValues),
          database.insert(expertImportRows).values(
            input.rows.map((row) => ({
              importId,
              rowNumber: row.rowNumber,
              resolution: row.resolution,
              ...(row.playerId ? { playerId: row.playerId } : {}),
              candidatePlayerIds: [...row.candidatePlayerIds],
              sourceIdentity: row.sourceIdentity,
              ...(row.normalizedProjection
                ? { normalizedProjection: row.normalizedProjection }
                : {}),
              ...(row.normalizedRanking ? { normalizedRanking: row.normalizedRanking } : {}),
              errors: [...row.errors]
            }))
          )
        ]);
      } else {
        await database.insert(privateDataImports).values(importValues);
      }
      return {
        id: importId,
        fileName: input.fileName,
        status: "awaiting_confirmation",
        seasonYear: input.seasonYear,
        providerName: input.providerName,
        importKind: input.importKind,
        ...summary,
        rows: input.rows
      };
    },
    async findExpertImport(context, importId) {
      const [dataImport] = await database
        .select({
          id: privateDataImports.id,
          fileName: privateDataImports.fileName,
          status: privateDataImports.status,
          providerName: privateDataImports.providerName,
          importKind: privateDataImports.importKind,
          seasonYear: seasons.year
        })
        .from(privateDataImports)
        .innerJoin(seasons, eq(privateDataImports.seasonId, seasons.id))
        .where(
          and(
            eq(privateDataImports.id, importId),
            eq(privateDataImports.ownerUserId, context.userId)
          )
        )
        .limit(1);
      if (!dataImport || !dataImport.providerName || !dataImport.importKind) return undefined;
      const rows = await listExpertImportRows(database, importId);
      return {
        id: dataImport.id,
        fileName: dataImport.fileName,
        status: dataImport.status,
        seasonYear: dataImport.seasonYear,
        providerName: dataImport.providerName,
        importKind: dataImport.importKind,
        ...summarizeImportRows(rows),
        rows
      };
    },
    async confirmExpertImport(context, importId) {
      const [dataImport] = await database
        .select({
          id: privateDataImports.id,
          fileName: privateDataImports.fileName,
          status: privateDataImports.status,
          providerName: privateDataImports.providerName,
          importKind: privateDataImports.importKind,
          checksum: privateDataImports.checksum,
          preserveOriginal: privateDataImports.preserveOriginal,
          seasonId: privateDataImports.seasonId,
          seasonYear: seasons.year
        })
        .from(privateDataImports)
        .innerJoin(seasons, eq(privateDataImports.seasonId, seasons.id))
        .where(
          and(
            eq(privateDataImports.id, importId),
            eq(privateDataImports.ownerUserId, context.userId)
          )
        )
        .limit(1);
      if (
        !dataImport ||
        !dataImport.providerName ||
        !dataImport.importKind ||
        !dataImport.seasonId
      ) {
        throw new Error("Expert import was not found for the authorized user.");
      }
      if (dataImport.status !== "awaiting_confirmation") {
        throw new Error(`Expert import cannot be confirmed from status ${dataImport.status}.`);
      }
      const rows = await listExpertImportRows(database, importId);
      const matched = rows.filter(
        (row): row is typeof row & { playerId: string } =>
          row.resolution === "matched" && Boolean(row.playerId)
      );
      assertUniqueImportedRanks(matched);
      const now = new Date();
      const [source] = await database
        .insert(dataSources)
        .values({
          name: dataImport.providerName,
          sourceIdentifier: `private-expert:${dataImport.providerName}`,
          licenseOrUsageNote: "Private user-authorized expert import; not for redistribution."
        })
        .onConflictDoUpdate({
          target: [dataSources.name, dataSources.sourceIdentifier],
          set: { updatedAt: sql`now()` }
        })
        .returning({ id: dataSources.id });
      if (!source) throw new Error("Expert import source could not be persisted.");

      const datasetId = randomUUID();
      const projectionRunId = randomUUID();
      const rankingRunId = randomUUID();
      const datasetValues = {
        id: datasetId,
        dataSourceId: source.id,
        importId,
        ownerUserId: context.userId,
        visibility: "private" as const,
        version: `private-${importId}`,
        seasonYear: dataImport.seasonYear,
        retrievedAt: now,
        validationStatus: "valid" as const,
        freshnessStatus: "valid" as const,
        recordCount: matched.length,
        licenseOrUsageNote: "Private user-authorized expert import; not for redistribution."
      };
      const projectionRows = matched.filter((row) => row.normalizedProjection);
      const projectionValues = projectionRows.map((row) => {
        const projection = normalizedProjectionValues(row.normalizedProjection!);
        return {
          projectionRunId,
          playerId: row.playerId,
          projectedStats: projection.statistics,
          ...optionalDecimal("projectedGames", projection.projectedGames),
          ...optionalDecimal("projectedPoints", projection.projectedPoints),
          ...optionalDecimal("projectedPointsPerGame", projection.projectedPointsPerGame),
          ...optionalDecimal("floorPoints", projection.floorPoints),
          ...optionalDecimal("medianPoints", projection.medianPoints),
          ...optionalDecimal("ceilingPoints", projection.ceilingPoints),
          ...optionalDecimal("confidence", projection.confidence)
        };
      });
      const rankingRows = matched.filter((row) => row.normalizedRanking);
      const rankingValues = rankingRows.map((row) => {
        const ranking = normalizedRankingValues(row.normalizedRanking!);
        return {
          rankingRunId,
          playerId: row.playerId,
          rank: ranking.overallRank,
          rationale: {
            provider: dataImport.providerName,
            ...(ranking.positionRank === undefined ? {} : { positionRank: ranking.positionRank })
          }
        };
      });
      const projectionRunValues = {
        id: projectionRunId,
        datasetVersionId: datasetId,
        importId,
        ownerUserId: context.userId,
        visibility: "private" as const,
        seasonId: dataImport.seasonId,
        projectionKind: "expert" as const,
        generatedAt: now,
        metrics: { provider: dataImport.providerName, importId }
      };
      const rankingRunValues = {
        id: rankingRunId,
        datasetVersionId: datasetId,
        importId,
        ownerUserId: context.userId,
        visibility: "private" as const,
        seasonId: dataImport.seasonId,
        rankingKind: "expert" as const,
        version: `private-${importId}`,
        generatedAt: now
      };
      const completionValues = {
        status: "completed" as const,
        confirmedAt: now,
        completedAt: now,
        recordCount: matched.length,
        ...(!dataImport.preserveOriginal ? { originalContent: null } : {})
      };
      const completeImport = database
        .update(privateDataImports)
        .set(completionValues)
        .where(
          and(
            eq(privateDataImports.id, importId),
            eq(privateDataImports.ownerUserId, context.userId),
            eq(privateDataImports.status, "awaiting_confirmation")
          )
        );
      if (projectionValues.length && rankingValues.length) {
        await database.batch([
          database.insert(datasetVersions).values(datasetValues),
          database.insert(projectionRuns).values(projectionRunValues),
          database.insert(playerProjections).values(projectionValues),
          database.insert(rankingRuns).values(rankingRunValues),
          database.insert(playerRankings).values(rankingValues),
          completeImport
        ]);
      } else if (projectionValues.length) {
        await database.batch([
          database.insert(datasetVersions).values(datasetValues),
          database.insert(projectionRuns).values(projectionRunValues),
          database.insert(playerProjections).values(projectionValues),
          completeImport
        ]);
      } else if (rankingValues.length) {
        await database.batch([
          database.insert(datasetVersions).values(datasetValues),
          database.insert(rankingRuns).values(rankingRunValues),
          database.insert(playerRankings).values(rankingValues),
          completeImport
        ]);
      } else {
        await database.batch([
          database.insert(datasetVersions).values(datasetValues),
          completeImport
        ]);
      }
      const result: ConfirmedExpertImportRecord = {
        id: dataImport.id,
        fileName: dataImport.fileName,
        status: "completed",
        persistedProjectionCount: projectionRows.length,
        persistedRankingCount: rankingRows.length,
        skippedRowCount: rows.length - matched.length
      };
      return result;
    }
  };

  const adpRepository: AdpRepository = {
    async findLatestSnapshot(input) {
      const [latest] = await database
        .select({
          datasetVersionId: adpSnapshots.datasetVersionId,
          persistedRecordCount: datasetVersions.recordCount,
          retrievedAt: adpSnapshots.capturedAt
        })
        .from(adpSnapshots)
        .innerJoin(seasons, eq(adpSnapshots.seasonId, seasons.id))
        .innerJoin(datasetVersions, eq(adpSnapshots.datasetVersionId, datasetVersions.id))
        .where(
          and(
            eq(adpSnapshots.provider, input.provider),
            eq(seasons.year, input.seasonYear),
            eq(adpSnapshots.scoringFormat, input.scoringFormat),
            eq(adpSnapshots.leagueSize, input.leagueSize)
          )
        )
        .orderBy(desc(adpSnapshots.capturedAt))
        .limit(1);
      return latest;
    },
    async saveSnapshot(input) {
      const season = await ensureSeason(database, input.seasonYear);
      const [source] = await database
        .insert(dataSources)
        .values({
          name: "Fantasy Football Calculator ADP",
          sourceIdentifier: input.provider,
          sourceUrl: "https://fantasyfootballcalculator.com/api/v1/adp",
          licenseOrUsageNote:
            "Free REST API use with requested attribution; data updates once daily."
        })
        .onConflictDoUpdate({
          target: [dataSources.name, dataSources.sourceIdentifier],
          set: {
            sourceUrl: "https://fantasyfootballcalculator.com/api/v1/adp",
            updatedAt: sql`now()`
          }
        })
        .returning({ id: dataSources.id });
      if (!source) throw new Error("ADP data source could not be persisted.");
      const datasetId = randomUUID();
      const version = `${input.retrievedAt.toISOString()}-${randomUUID()}`;
      const datasetQuery = database.insert(datasetVersions).values({
        id: datasetId,
        dataSourceId: source.id,
        visibility: "public",
        version,
        seasonYear: input.seasonYear,
        retrievedAt: input.retrievedAt,
        validationStatus: "valid",
        freshnessStatus: "valid",
        recordCount: input.records.length,
        licenseOrUsageNote: "Fantasy Football Calculator REST API; attribution required."
      });
      if (input.records.length) {
        await database.batch([
          datasetQuery,
          database.insert(adpSnapshots).values(
            input.records.map((record) => ({
              datasetVersionId: datasetId,
              playerId: record.playerId,
              seasonId: season.id,
              provider: input.provider,
              scoringFormat: input.scoringFormat,
              leagueSize: input.leagueSize,
              averageDraftPosition: String(record.overallAdp),
              positionalAdp: String(record.positionalAdp),
              ...(record.minimumPick === undefined
                ? {}
                : { minimumPick: String(record.minimumPick) }),
              ...(record.maximumPick === undefined
                ? {}
                : { maximumPick: String(record.maximumPick) }),
              ...(record.sampleSize === undefined ? {} : { sampleSize: record.sampleSize }),
              capturedAt: input.retrievedAt
            }))
          )
        ]);
      } else {
        await datasetQuery;
      }
      return {
        datasetVersionId: datasetId,
        persistedRecordCount: input.records.length,
        retrievedAt: input.retrievedAt
      };
    },
    async listSnapshots(input) {
      const conditions: SQL[] = [eq(adpSnapshots.seasonId, input.seasonId)];
      if (input.provider) conditions.push(eq(adpSnapshots.provider, input.provider));
      if (input.scoringFormat) {
        conditions.push(eq(adpSnapshots.scoringFormat, input.scoringFormat));
      }
      if (input.leagueSize !== undefined) {
        conditions.push(eq(adpSnapshots.leagueSize, input.leagueSize));
      }
      return database
        .select({
          datasetVersionId: adpSnapshots.datasetVersionId,
          playerId: adpSnapshots.playerId,
          provider: adpSnapshots.provider,
          scoringFormat: adpSnapshots.scoringFormat,
          leagueSize: adpSnapshots.leagueSize,
          seasonId: adpSnapshots.seasonId,
          overallAdp: adpSnapshots.averageDraftPosition,
          positionalAdp: adpSnapshots.positionalAdp,
          minimumPick: adpSnapshots.minimumPick,
          maximumPick: adpSnapshots.maximumPick,
          sampleSize: adpSnapshots.sampleSize,
          retrievedAt: adpSnapshots.capturedAt
        })
        .from(adpSnapshots)
        .where(and(...conditions))
        .orderBy(desc(adpSnapshots.capturedAt), asc(adpSnapshots.averageDraftPosition));
    }
  };

  const workspaceRepository: WorkspaceRepository = {
    async getOverview(context) {
      const [
        leagueRows,
        scoringProfileRows,
        importRows,
        rankingRows,
        draftRows,
        queueRows,
        tradeRows,
        refreshRows,
        preferenceRows
      ] = await Promise.all([
        database
          .select({
            id: leagueConfigurations.id,
            name: leagueConfigurations.name,
            teamCount: leagueConfigurations.teamCount,
            provider: leagueConfigurations.provider,
            externalLeagueId: leagueConfigurations.externalLeagueId
          })
          .from(leagueConfigurations)
          .where(eq(leagueConfigurations.ownerUserId, context.userId))
          .orderBy(asc(leagueConfigurations.name)),
        database
          .select({
            id: leagueScoringRules.id,
            leagueConfigurationId: leagueScoringRules.leagueConfigurationId,
            leagueName: leagueConfigurations.name,
            name: leagueScoringRules.name,
            version: leagueScoringRules.version
          })
          .from(leagueScoringRules)
          .innerJoin(
            leagueConfigurations,
            eq(leagueScoringRules.leagueConfigurationId, leagueConfigurations.id)
          )
          .where(eq(leagueConfigurations.ownerUserId, context.userId))
          .orderBy(asc(leagueConfigurations.name), desc(leagueScoringRules.version)),
        database
          .select({
            id: privateDataImports.id,
            fileName: privateDataImports.fileName,
            providerName: privateDataImports.providerName,
            status: privateDataImports.status,
            createdAt: privateDataImports.createdAt
          })
          .from(privateDataImports)
          .where(eq(privateDataImports.ownerUserId, context.userId))
          .orderBy(desc(privateDataImports.createdAt)),
        database
          .select({
            id: rankingRuns.id,
            kind: rankingRuns.rankingKind,
            version: rankingRuns.version,
            generatedAt: rankingRuns.generatedAt
          })
          .from(rankingRuns)
          .where(
            and(eq(rankingRuns.visibility, "private"), eq(rankingRuns.ownerUserId, context.userId))
          )
          .orderBy(desc(rankingRuns.generatedAt)),
        database
          .select({
            id: drafts.id,
            leagueName: leagueConfigurations.name,
            provider: drafts.provider,
            status: drafts.status,
            updatedAt: drafts.updatedAt
          })
          .from(drafts)
          .innerJoin(
            leagueConfigurations,
            eq(drafts.leagueConfigurationId, leagueConfigurations.id)
          )
          .where(eq(leagueConfigurations.ownerUserId, context.userId))
          .orderBy(desc(drafts.updatedAt)),
        database
          .select({
            draftId: draftQueues.draftId,
            count: sql<number>`count(${draftQueues.id})`
          })
          .from(draftQueues)
          .innerJoin(drafts, eq(draftQueues.draftId, drafts.id))
          .innerJoin(
            leagueConfigurations,
            eq(drafts.leagueConfigurationId, leagueConfigurations.id)
          )
          .where(eq(leagueConfigurations.ownerUserId, context.userId))
          .groupBy(draftQueues.draftId),
        database
          .select({
            id: tradeEvaluations.id,
            status: tradeEvaluations.status,
            updatedAt: tradeEvaluations.updatedAt
          })
          .from(tradeEvaluations)
          .where(eq(tradeEvaluations.ownerUserId, context.userId))
          .orderBy(desc(tradeEvaluations.updatedAt)),
        database
          .select({
            id: datasetVersions.id,
            sourceName: dataSources.name,
            version: datasetVersions.version,
            validationStatus: datasetVersions.validationStatus,
            freshnessStatus: datasetVersions.freshnessStatus,
            retrievedAt: datasetVersions.retrievedAt
          })
          .from(datasetVersions)
          .innerJoin(dataSources, eq(datasetVersions.dataSourceId, dataSources.id))
          .where(
            and(
              eq(datasetVersions.visibility, "private"),
              eq(datasetVersions.ownerUserId, context.userId)
            )
          )
          .orderBy(desc(datasetVersions.retrievedAt)),
        database
          .select({
            defaultLeagueId: workspacePreferences.defaultLeagueId,
            defaultScoringFormat: workspacePreferences.defaultScoringFormat,
            timezone: workspacePreferences.timezone,
            compactRankings: workspacePreferences.compactRankings,
            updatedAt: workspacePreferences.updatedAt
          })
          .from(workspacePreferences)
          .where(eq(workspacePreferences.ownerUserId, context.userId))
          .limit(1)
      ]);

      const queueCounts = new Map(queueRows.map((row) => [row.draftId, Number(row.count)]));
      const preferences = preferenceRows[0];
      return {
        leagues: leagueRows,
        scoringProfiles: scoringProfileRows,
        expertImports: importRows,
        rankings: rankingRows,
        drafts: draftRows.map((draft) => ({
          ...draft,
          queuedPlayerCount: queueCounts.get(draft.id) ?? 0
        })),
        tradeEvaluations: tradeRows,
        dataRefreshes: refreshRows,
        preferences: preferences
          ? {
              ...(preferences.defaultLeagueId
                ? { defaultLeagueId: preferences.defaultLeagueId }
                : {}),
              defaultScoringFormat: scoringFormat(preferences.defaultScoringFormat),
              timezone: preferences.timezone,
              compactRankings: preferences.compactRankings,
              updatedAt: preferences.updatedAt
            }
          : {
              defaultScoringFormat: "ppr",
              timezone: "America/New_York",
              compactRankings: false,
              updatedAt: new Date(0)
            }
      };
    },
    async updatePreferences(context, preferences: WorkspacePreferencesInput) {
      if (preferences.defaultLeagueId) {
        await assertOwnedLeague(database, context, preferences.defaultLeagueId);
      }
      const [saved] = await database
        .insert(workspacePreferences)
        .values({
          ownerUserId: context.userId,
          defaultLeagueId: preferences.defaultLeagueId,
          defaultScoringFormat: preferences.defaultScoringFormat,
          timezone: preferences.timezone,
          compactRankings: preferences.compactRankings,
          updatedAt: new Date()
        })
        .onConflictDoUpdate({
          target: workspacePreferences.ownerUserId,
          set: {
            defaultLeagueId: preferences.defaultLeagueId ?? null,
            defaultScoringFormat: preferences.defaultScoringFormat,
            timezone: preferences.timezone,
            compactRankings: preferences.compactRankings,
            updatedAt: new Date()
          }
        })
        .returning({
          defaultLeagueId: workspacePreferences.defaultLeagueId,
          defaultScoringFormat: workspacePreferences.defaultScoringFormat,
          timezone: workspacePreferences.timezone,
          compactRankings: workspacePreferences.compactRankings,
          updatedAt: workspacePreferences.updatedAt
        });
      if (!saved) throw new Error("Workspace preferences were not persisted.");
      return {
        ...(saved.defaultLeagueId ? { defaultLeagueId: saved.defaultLeagueId } : {}),
        defaultScoringFormat: scoringFormat(saved.defaultScoringFormat),
        timezone: saved.timezone,
        compactRankings: saved.compactRankings,
        updatedAt: saved.updatedAt
      };
    }
  };

  return {
    playerRepository,
    statsRepository,
    historicalStatisticsRepository,
    projectionRepository,
    rankingRepository,
    leagueRepository,
    draftRepository,
    tradeRepository,
    newsRepository,
    importRepository,
    adpRepository,
    workspaceRepository
  };
}

function scoringFormat(value: string): WorkspacePreferencesInput["defaultScoringFormat"] {
  if (value === "standard" || value === "half-ppr" || value === "ppr") return value;
  throw new Error(`Unsupported saved scoring format: ${value}.`);
}

async function listNews(database: Database, query: VisibleNewsQuery): Promise<NewsRecord[]> {
  if (query.categories?.length === 0) return [];
  const ownerUserId = requiredOwner(query.authorization, query.visibility);
  const conditions: SQL[] = [eq(datasetVersions.visibility, query.visibility)];
  if (ownerUserId) conditions.push(eq(datasetVersions.ownerUserId, ownerUserId));
  if (query.sourceIdentifier) {
    conditions.push(eq(dataSources.sourceIdentifier, query.sourceIdentifier));
  }
  if (query.playerId) conditions.push(eq(playerNews.playerId, query.playerId));
  if (query.position === "DEF") {
    conditions.push(
      sql`regexp_replace(upper(${players.position}), '[^A-Z]', '', 'g') in ('D', 'DEF', 'DST')`
    );
  } else if (query.position) {
    conditions.push(eq(players.position, query.position));
  }
  if (query.categories?.length) {
    conditions.push(inArray(newsRecords.newsType, [...query.categories]));
  }
  if (query.freshness) conditions.push(eq(newsRecords.dataFreshness, query.freshness));
  if (query.team) {
    conditions.push(
      sql`${newsRecords.relatedTeams} @> ${JSON.stringify([
        { abbreviation: query.team.toUpperCase() }
      ])}::jsonb`
    );
  }

  const rows = await database
    .selectDistinct({
      id: newsRecords.id,
      deduplicationKey: newsRecords.deduplicationKey,
      headline: newsRecords.title,
      sourceId: dataSources.sourceIdentifier,
      sourceName: dataSources.name,
      feedUrl: dataSources.sourceUrl,
      usageNote: dataSources.licenseOrUsageNote,
      originalArticleUrl: newsRecords.sourceUrl,
      publicationTime: newsRecords.publishedAt,
      retrievedTime: newsRecords.retrievedAt,
      permittedExcerpt: newsRecords.summary,
      reportedFacts: newsRecords.reportedFacts,
      relatedTeams: newsRecords.relatedTeams,
      category: newsRecords.newsType,
      injuryInformation: newsRecords.injuryInformation,
      fantasyRelevance: newsRecords.fantasyRelevance,
      interpretationReasoning: newsRecords.interpretationReasoning,
      entityMatchConfidence: newsRecords.entityMatchConfidence,
      dataFreshness: newsRecords.dataFreshness
    })
    .from(newsRecords)
    .innerJoin(datasetVersions, eq(newsRecords.datasetVersionId, datasetVersions.id))
    .innerJoin(dataSources, eq(datasetVersions.dataSourceId, dataSources.id))
    .leftJoin(playerNews, eq(newsRecords.id, playerNews.newsRecordId))
    .leftJoin(players, eq(playerNews.playerId, players.id))
    .where(and(...conditions))
    .orderBy(desc(newsRecords.publishedAt), desc(newsRecords.retrievedAt))
    .limit(Math.min(Math.max(query.limit ?? 100, 1), 500));
  if (!rows.length) return [];

  const relationships = await database
    .select({
      newsRecordId: playerNews.newsRecordId,
      id: players.id,
      fullName: players.fullName,
      position: players.position,
      currentTeam: nflTeams.abbreviation,
      relevance: playerNews.relevance,
      matchedText: playerNews.matchedText
    })
    .from(playerNews)
    .innerJoin(players, eq(playerNews.playerId, players.id))
    .leftJoin(nflTeams, eq(players.teamId, nflTeams.id))
    .where(
      inArray(
        playerNews.newsRecordId,
        rows.map((row) => row.id)
      )
    );
  const playersByRecord = new Map<string, NewsRecord["relatedPlayers"][number][]>();
  for (const relationship of relationships) {
    const related = playersByRecord.get(relationship.newsRecordId) ?? [];
    related.push({
      id: relationship.id,
      fullName: relationship.fullName,
      position: newsPosition(relationship.position),
      ...(relationship.currentTeam ? { currentTeam: relationship.currentTeam } : {}),
      confidence: Number(relationship.relevance ?? 0),
      matchedText: relationship.matchedText
    });
    playersByRecord.set(relationship.newsRecordId, related);
  }

  return rows.map((row) => ({
    id: row.id,
    deduplicationKey: row.deduplicationKey,
    headline: row.headline,
    source: {
      id: row.sourceId,
      name: row.sourceName,
      feedUrl: row.feedUrl,
      usageNote: row.usageNote
    },
    originalArticleUrl: row.originalArticleUrl,
    publicationTime: row.publicationTime,
    retrievedTime: row.retrievedTime,
    permittedExcerpt: row.permittedExcerpt,
    reportedFacts: stringArray(row.reportedFacts, "news reported facts"),
    relatedPlayers: playersByRecord.get(row.id) ?? [],
    relatedTeams: relatedNewsTeams(row.relatedTeams),
    category: row.category,
    ...(row.injuryInformation
      ? { injuryInformation: newsInjuryInformation(row.injuryInformation) }
      : {}),
    fantasyRelevance: {
      text: row.fantasyRelevance,
      reasoning: stringArray(row.interpretationReasoning, "news interpretation reasoning"),
      applicationGenerated: true
    },
    entityMatchConfidence: Number(row.entityMatchConfidence),
    dataFreshness: row.dataFreshness
  }));
}

function newsPosition(value: string): NewsRecord["relatedPlayers"][number]["position"] {
  const normalized = value.toUpperCase().replace(/[^A-Z]/g, "");
  if (normalized === "DST" || normalized === "D") return "DEF";
  if (!["QB", "RB", "WR", "TE", "K", "DEF"].includes(normalized)) {
    throw new Error(`News relationship has unsupported player position "${value}".`);
  }
  return normalized as NewsRecord["relatedPlayers"][number]["position"];
}

function newsInjuryInformation(value: unknown): NonNullable<NewsRecord["injuryInformation"]> {
  const injury = unknownRecord(value, "News injury information");
  if (typeof injury.reportedText !== "string") {
    throw new Error("News injury information requires reported text.");
  }
  const designations = [
    "questionable",
    "doubtful",
    "out",
    "injured-reserve",
    "pup",
    "suspended"
  ] as const;
  if (
    injury.designation !== undefined &&
    !designations.includes(injury.designation as (typeof designations)[number])
  ) {
    throw new Error("News injury information contains an unsupported designation.");
  }
  return {
    reportedText: injury.reportedText,
    ...(injury.designation
      ? { designation: injury.designation as (typeof designations)[number] }
      : {})
  };
}

function relatedNewsTeams(value: unknown): NewsRecord["relatedTeams"] {
  if (!Array.isArray(value)) throw new Error("News related teams must be a JSON array.");
  return value.map((entry) => {
    const team = unknownRecord(entry, "related team");
    if (
      typeof team.abbreviation !== "string" ||
      typeof team.name !== "string" ||
      typeof team.confidence !== "number" ||
      (team.basis !== "explicit-mention" && team.basis !== "current-player-team")
    ) {
      throw new Error("News related team has an invalid normalized shape.");
    }
    return {
      abbreviation: team.abbreviation,
      name: team.name,
      confidence: team.confidence,
      basis: team.basis
    };
  });
}

function numericStatisticValues(values: unknown): Record<string, number> {
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    throw new Error("Historical statistic values must be a JSON object.");
  }
  const normalized: Record<string, number> = {};
  for (const [field, value] of Object.entries(values)) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`Historical statistic ${field} must be a finite number.`);
    }
    normalized[field] = value;
  }
  return normalized;
}

async function ensureSeason(
  database: Pick<Database, "insert" | "select">,
  seasonYear: number
): Promise<{ id: string }> {
  const [inserted] = await database
    .insert(seasons)
    .values({ year: seasonYear, kind: "regular" })
    .onConflictDoNothing({ target: [seasons.year, seasons.kind] })
    .returning({ id: seasons.id });
  if (inserted) return inserted;
  const [existing] = await database
    .select({ id: seasons.id })
    .from(seasons)
    .where(and(eq(seasons.year, seasonYear), eq(seasons.kind, "regular")))
    .limit(1);
  if (!existing) throw new Error(`Season ${seasonYear} could not be resolved.`);
  return existing;
}

async function listExpertImportRows(
  database: Pick<Database, "select">,
  importId: string
): Promise<NewExpertImportRowRecord[]> {
  const rows = await database
    .select({
      rowNumber: expertImportRows.rowNumber,
      resolution: expertImportRows.resolution,
      playerId: expertImportRows.playerId,
      candidatePlayerIds: expertImportRows.candidatePlayerIds,
      sourceIdentity: expertImportRows.sourceIdentity,
      normalizedProjection: expertImportRows.normalizedProjection,
      normalizedRanking: expertImportRows.normalizedRanking,
      errors: expertImportRows.errors
    })
    .from(expertImportRows)
    .where(eq(expertImportRows.importId, importId))
    .orderBy(asc(expertImportRows.rowNumber));
  return rows.map((row) => ({
    rowNumber: row.rowNumber,
    resolution: row.resolution,
    ...(row.playerId ? { playerId: row.playerId } : {}),
    candidatePlayerIds: stringArray(row.candidatePlayerIds, "candidate player IDs"),
    sourceIdentity: stringRecord(row.sourceIdentity, "source identity"),
    ...(row.normalizedProjection
      ? {
          normalizedProjection: unknownRecord(row.normalizedProjection, "normalized projection")
        }
      : {}),
    ...(row.normalizedRanking
      ? { normalizedRanking: unknownRecord(row.normalizedRanking, "normalized ranking") }
      : {}),
    errors: stringArray(row.errors, "import errors")
  }));
}

function summarizeImportRows(rows: readonly NewExpertImportRowRecord[]) {
  const count = (resolution: NewExpertImportRowRecord["resolution"]) =>
    rows.filter((row) => row.resolution === resolution).length;
  return {
    totalRows: rows.length,
    matchedRows: count("matched"),
    ambiguousRows: count("ambiguous"),
    missingRows: count("missing"),
    invalidRows: count("invalid")
  };
}

function normalizedProjectionValues(value: Readonly<Record<string, unknown>>): {
  statistics: Record<string, number>;
  projectedGames?: number;
  projectedPoints?: number;
  projectedPointsPerGame?: number;
  floorPoints?: number;
  medianPoints?: number;
  ceilingPoints?: number;
  confidence?: number;
} {
  return {
    statistics: numericStatisticValues(value.statistics ?? {}),
    ...optionalFiniteNumber(value, "projectedGames"),
    ...optionalFiniteNumber(value, "projectedPoints"),
    ...optionalFiniteNumber(value, "projectedPointsPerGame"),
    ...optionalFiniteNumber(value, "floorPoints"),
    ...optionalFiniteNumber(value, "medianPoints"),
    ...optionalFiniteNumber(value, "ceilingPoints"),
    ...optionalFiniteNumber(value, "confidence")
  };
}

function normalizedRankingValues(value: Readonly<Record<string, unknown>>): {
  overallRank: number;
  positionRank?: number;
} {
  const overallRank = value.overallRank;
  if (typeof overallRank !== "number" || !Number.isInteger(overallRank) || overallRank < 1) {
    throw new Error("Normalized expert overall rank must be a positive integer.");
  }
  const result: { overallRank: number; positionRank?: number } = { overallRank };
  const positionRank = value.positionRank;
  if (positionRank !== undefined) {
    if (typeof positionRank !== "number" || !Number.isInteger(positionRank) || positionRank < 1) {
      throw new Error("Normalized expert position rank must be a positive integer.");
    }
    result.positionRank = positionRank;
  }
  return result;
}

function optionalFiniteNumber<Key extends string>(
  value: Readonly<Record<string, unknown>>,
  key: Key
): Partial<Record<Key, number>> {
  const candidate = value[key];
  if (candidate === undefined) return {};
  if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
    throw new Error(`Normalized expert ${key} must be a finite number.`);
  }
  return { [key]: candidate } as Record<Key, number>;
}

function optionalDecimal<Key extends string>(
  key: Key,
  value: number | undefined
): Partial<Record<Key, string>> {
  return value === undefined ? {} : ({ [key]: String(value) } as Record<Key, string>);
}

function assertUniqueImportedRanks(rows: readonly NewExpertImportRowRecord[]): void {
  const ranks = new Set<number>();
  for (const row of rows) {
    if (!row.normalizedRanking) continue;
    const rank = normalizedRankingValues(row.normalizedRanking).overallRank;
    if (ranks.has(rank)) {
      throw new Error(`Expert import contains duplicate overall rank ${rank}.`);
    }
    ranks.add(rank);
  }
}

function unknownRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function stringRecord(value: unknown, label: string): Record<string, string> {
  const record = unknownRecord(value, label);
  if (Object.values(record).some((entry) => typeof entry !== "string")) {
    throw new Error(`${label} values must be strings.`);
  }
  return record as Record<string, string>;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${label} must be a string array.`);
  }
  return value;
}

export type DatabasePlayer = InferSelectModel<typeof players>;
