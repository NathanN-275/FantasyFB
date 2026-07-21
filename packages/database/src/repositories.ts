import { and, asc, eq, sql, type InferSelectModel, type SQL } from "drizzle-orm";
import type {
  AuthorizationContext,
  DraftEventRecord,
  DraftRepository,
  ImportRepository,
  LeagueRepository,
  NewsRepository,
  PlayerRepository,
  PlayerRecord,
  ProjectionRepository,
  RankingRepository,
  StatsRepository,
  TradeRepository,
  VisiblePlayerQuery,
  VisibleSeasonQuery
} from "@fantasyfb/contracts";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  dataVisibility,
  datasetVersions,
  draftEvents,
  drafts,
  leagueConfigurations,
  newsRecords,
  playerExternalIds,
  playerNews,
  playerProjections,
  playerRankings,
  players,
  privateDataImports,
  projectionRuns,
  rankingRuns,
  seasonStatistics,
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

export function createRepositories(database: Database): {
  playerRepository: PlayerRepository;
  statsRepository: StatsRepository;
  projectionRepository: ProjectionRepository;
  rankingRepository: RankingRepository;
  leagueRepository: LeagueRepository;
  draftRepository: DraftRepository;
  tradeRepository: TradeRepository;
  newsRepository: NewsRepository;
  importRepository: ImportRepository;
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

  const projectionRepository: ProjectionRepository = {
    async listForSeason(query) {
      const visibility = visibleDatasetCondition(query, projectionRuns);
      return database
        .select({
          playerId: playerProjections.playerId,
          projectedPoints: playerProjections.projectedPoints,
          projectionKind: projectionRuns.projectionKind
        })
        .from(playerProjections)
        .innerJoin(projectionRuns, eq(playerProjections.projectionRunId, projectionRuns.id))
        .where(and(eq(projectionRuns.seasonId, query.seasonId), visibility));
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
          sideA: tradeEvaluations.sideA,
          sideB: tradeEvaluations.sideB
        })
        .from(tradeEvaluations)
        .where(eq(tradeEvaluations.ownerUserId, context.userId));
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
    }
  };

  return {
    playerRepository,
    statsRepository,
    projectionRepository,
    rankingRepository,
    leagueRepository,
    draftRepository,
    tradeRepository,
    newsRepository,
    importRepository
  };
}

export type DatabasePlayer = InferSelectModel<typeof players>;
