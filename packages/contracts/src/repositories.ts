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

/**
 * Persistence boundary for provenance and ingestion health. Provider adapters and
 * pipelines use this instead of depending on a particular database client.
 */
export interface DataCatalogRepository {
  upsertDataset(record: DatasetCatalogRecord): Promise<DatasetCatalogRecord>;
  findLastValid(input: DatasetIdentity): Promise<DatasetCatalogRecord | undefined>;
  recordIngestionRun(run: IngestionRunRecord): Promise<void>;
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

export interface DatasetIdentity {
  readonly source: string;
  readonly sourceIdentifier: string;
  readonly season?: number;
  readonly week?: number;
}

export interface DatasetCatalogRecord extends DatasetIdentity {
  readonly datasetId: string;
  readonly retrievedAt: Date;
  readonly effectiveAt?: Date;
  readonly datasetVersion: string;
  readonly licenseOrUsageNote: string;
  readonly recordCount: number;
  readonly validationStatus: "valid" | "invalid" | "quarantined";
  readonly freshnessStatus: "fresh" | "stale" | "unknown";
  readonly importStatus: "completed" | "failed" | "quarantined";
  readonly errorStatus?: string;
  readonly lastKnownSuccessfulUpdate?: Date;
}

export interface IngestionRunRecord {
  readonly idempotencyKey: string;
  readonly source: string;
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly status: "completed" | "failed" | "quarantined";
  readonly report: Readonly<Record<string, unknown>>;
}
