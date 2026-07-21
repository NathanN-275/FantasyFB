/**
 * Provider-neutral persistence boundaries. Domain modules depend on these types,
 * never on Drizzle, SQL, or a database client.
 */
export interface AuthorizationContext {
  readonly userId: string;
}

export interface PlayerRepository {
  findById(playerId: string): Promise<PlayerRecord | undefined>;
  findByExternalId(provider: string, externalId: string): Promise<PlayerRecord | undefined>;
  upsert(player: NewPlayerRecord): Promise<PlayerRecord>;
}

export interface StatsRepository {
  upsertWeekly(record: WeeklyStatisticRecord): Promise<void>;
  upsertSeason(record: SeasonStatisticRecord): Promise<void>;
}

export interface ProjectionRepository {
  listForSeason(input: VisibleSeasonQuery): Promise<ProjectionRecord[]>;
}

export interface RankingRepository {
  listForSeason(input: VisibleSeasonQuery): Promise<RankingRecord[]>;
}

export interface LeagueRepository {
  list(context: AuthorizationContext): Promise<LeagueRecord[]>;
  findById(context: AuthorizationContext, leagueId: string): Promise<LeagueRecord | undefined>;
}

export interface DraftRepository {
  listEvents(context: AuthorizationContext, draftId: string): Promise<DraftEventRecord[]>;
  appendEvent(context: AuthorizationContext, event: NewDraftEventRecord): Promise<DraftEventRecord>;
}

export interface TradeRepository {
  list(context: AuthorizationContext): Promise<TradeEvaluationRecord[]>;
}

export interface NewsRepository {
  listForPlayer(input: VisiblePlayerQuery): Promise<NewsRecord[]>;
}

export interface ImportRepository {
  list(context: AuthorizationContext): Promise<PrivateImportRecord[]>;
}

export interface PlayerRecord {
  readonly id: string;
  readonly fullName: string;
  readonly position: string;
  readonly teamId: string | null;
}

export interface NewPlayerRecord extends PlayerRecord {
  readonly availability?: string;
  readonly injuryStatus?: string;
  readonly externalIds: readonly { provider: string; externalId: string; sourceUrl?: string }[];
}

export interface WeeklyStatisticRecord {
  readonly playerId: string;
  readonly teamId: string;
  readonly seasonId: string;
  readonly week: number;
  readonly datasetVersionId: string;
  readonly values: Record<string, number>;
}

export interface SeasonStatisticRecord {
  readonly playerId: string;
  readonly teamId: string;
  readonly seasonId: string;
  readonly datasetVersionId: string;
  readonly values: Record<string, number>;
}

export interface VisibleSeasonQuery {
  readonly seasonId: string;
  readonly visibility: "public" | "sample" | "private";
  readonly authorization?: AuthorizationContext;
}

export interface VisiblePlayerQuery extends VisibleSeasonQuery {
  readonly playerId: string;
}

export interface ProjectionRecord {
  readonly playerId: string;
  readonly projectedPoints: string | null;
  readonly projectionKind: "model" | "expert" | "hybrid";
}

export interface RankingRecord {
  readonly playerId: string;
  readonly rank: number;
  readonly rankingKind: "model" | "expert" | "hybrid";
}

export interface LeagueRecord {
  readonly id: string;
  readonly name: string;
  readonly teamCount: number;
}

export interface NewDraftEventRecord {
  readonly draftId: string;
  readonly sequence: number;
  readonly eventType: string;
  readonly idempotencyKey: string;
  readonly payload: Record<string, unknown>;
  readonly providerEventId?: string;
  readonly providerTimestamp?: Date;
}

export interface DraftEventRecord extends NewDraftEventRecord {
  readonly id: string;
  readonly receivedAt: Date;
}

export interface TradeEvaluationRecord {
  readonly id: string;
  readonly status: "draft" | "evaluated" | "archived";
  readonly sideA: unknown;
  readonly sideB: unknown;
}

export interface NewsRecord {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly publishedAt: Date;
}

export interface PrivateImportRecord {
  readonly id: string;
  readonly fileName: string;
  readonly status: "pending" | "processing" | "completed" | "failed" | "quarantined";
}
