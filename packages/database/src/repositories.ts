import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql, type InferSelectModel, type SQL } from "drizzle-orm";
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
  PlayerRepository,
  PlayerRecord,
  ProjectionRepository,
  RankingRepository,
  NewExpertImportRowRecord,
  NewTradeEvaluationRecord,
  StatsRepository,
  TradeRepository,
  VisiblePlayerQuery,
  VisibleSeasonQuery
} from "@fantasyfb/contracts";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  adpSnapshots,
  dataSources,
  dataVisibility,
  datasetVersions,
  draftEvents,
  drafts,
  expertImportRows,
  leagueConfigurations,
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
    async listForPlayer(query: VisiblePlayerQuery) {
      const ownerUserId = requiredOwner(query.authorization, query.visibility);
      const conditions: SQL[] = [
        eq(playerNews.playerId, query.playerId),
        eq(datasetVersions.visibility, query.visibility)
      ];
      if (ownerUserId) conditions.push(eq(datasetVersions.ownerUserId, ownerUserId));
      return database
        .select({
          id: newsRecords.id,
          title: newsRecords.title,
          summary: newsRecords.summary,
          publishedAt: newsRecords.publishedAt
        })
        .from(playerNews)
        .innerJoin(newsRecords, eq(playerNews.newsRecordId, newsRecords.id))
        .innerJoin(datasetVersions, eq(newsRecords.datasetVersionId, datasetVersions.id))
        .where(and(...conditions))
        .orderBy(asc(newsRecords.publishedAt));
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
    adpRepository
  };
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
    throw new Error(`Expert import ${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function stringRecord(value: unknown, label: string): Record<string, string> {
  const record = unknownRecord(value, label);
  if (Object.values(record).some((entry) => typeof entry !== "string")) {
    throw new Error(`Expert import ${label} values must be strings.`);
  }
  return record as Record<string, string>;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`Expert import ${label} must be a string array.`);
  }
  return value;
}

export type DatabasePlayer = InferSelectModel<typeof players>;
