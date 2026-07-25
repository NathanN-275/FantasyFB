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
  listResolutionCandidates(): Promise<PlayerResolutionCandidateRecord[]>;
  upsert(player: NewPlayerRecord): Promise<PlayerRecord>;
}

export interface StatsRepository {
  upsertWeekly(record: WeeklyStatisticRecord): Promise<void>;
  upsertSeason(record: SeasonStatisticRecord): Promise<void>;
}

/** Query boundary for already-normalized historical data and persisted aggregates. */
export interface HistoricalStatisticsRepository {
  listPlayerWeeks(
    input: HistoricalPlayerStatisticsQuery
  ): Promise<HistoricalWeeklyStatisticRecord[]>;
  listPlayerSeasons(
    input: HistoricalPlayerStatisticsQuery
  ): Promise<HistoricalSeasonStatisticRecord[]>;
  listTeamWeeks(input: HistoricalTeamStatisticsQuery): Promise<HistoricalWeeklyStatisticRecord[]>;
  listTeamSeasons(input: HistoricalTeamStatisticsQuery): Promise<HistoricalSeasonStatisticRecord[]>;
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
  stageExpertImport(
    context: AuthorizationContext,
    input: NewExpertImportRecord
  ): Promise<ExpertImportPreviewRecord>;
  findExpertImport(
    context: AuthorizationContext,
    importId: string
  ): Promise<ExpertImportPreviewRecord | undefined>;
  confirmExpertImport(
    context: AuthorizationContext,
    importId: string
  ): Promise<ConfirmedExpertImportRecord>;
}

export interface AdpRepository {
  findLatestSnapshot(input: AdpSnapshotContext): Promise<SavedAdpSnapshotRecord | undefined>;
  saveSnapshot(input: NewAdpSnapshotRecord): Promise<SavedAdpSnapshotRecord>;
  listSnapshots(input: AdpSnapshotQuery): Promise<AdpSnapshotRecord[]>;
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

export interface PlayerResolutionCandidateRecord {
  readonly id: string;
  readonly fullName: string;
  readonly position: string;
  readonly team?: string;
  readonly externalIds: readonly { readonly provider: string; readonly value: string }[];
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

export interface HistoricalPlayerStatisticsQuery extends VisiblePlayerQuery {
  readonly datasetVersionId: string;
}

export interface HistoricalTeamStatisticsQuery extends VisibleSeasonQuery {
  readonly teamId: string;
  readonly datasetVersionId: string;
}

export interface HistoricalWeeklyStatisticRecord {
  readonly teamId: string;
  readonly week: number;
  readonly values: Readonly<Record<string, number>>;
}

export interface HistoricalSeasonStatisticRecord {
  readonly teamId: string;
  readonly values: Readonly<Record<string, number>>;
}

export interface ProjectionRecord {
  readonly playerId: string;
  readonly seasonId: string;
  readonly projectedGames: string | null;
  readonly projectedStatistics: Readonly<Record<string, number>>;
  readonly projectedPoints: string | null;
  readonly projectedPointsPerGame: string | null;
  readonly floorPoints: string | null;
  readonly medianPoints: string | null;
  readonly ceilingPoints: string | null;
  readonly confidence: string | null;
  readonly projectionKind: "model" | "expert" | "hybrid";
  readonly modelVersion: string | null;
  readonly featureVersion: string | null;
  readonly scoringConfigurationIdentifier: string | null;
  readonly generatedAt: Date;
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
  readonly status:
    "pending" | "processing" | "awaiting_confirmation" | "completed" | "failed" | "quarantined";
}

export interface NewExpertImportRecord {
  readonly seasonYear: number;
  readonly providerName: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly checksum: string;
  readonly importKind: "projection" | "ranking" | "combined";
  readonly importProfile: Readonly<Record<string, unknown>>;
  readonly preserveOriginal: boolean;
  readonly originalContent?: string;
  readonly rows: readonly NewExpertImportRowRecord[];
}

export interface NewExpertImportRowRecord {
  readonly rowNumber: number;
  readonly resolution: "matched" | "ambiguous" | "missing" | "invalid";
  readonly playerId?: string;
  readonly candidatePlayerIds: readonly string[];
  readonly sourceIdentity: Readonly<Record<string, string>>;
  readonly normalizedProjection?: Readonly<Record<string, unknown>>;
  readonly normalizedRanking?: Readonly<Record<string, unknown>>;
  readonly errors: readonly string[];
}

export interface ExpertImportPreviewRecord extends PrivateImportRecord {
  readonly seasonYear: number;
  readonly providerName: string;
  readonly importKind: "projection" | "ranking" | "combined";
  readonly totalRows: number;
  readonly matchedRows: number;
  readonly ambiguousRows: number;
  readonly missingRows: number;
  readonly invalidRows: number;
  readonly rows: readonly NewExpertImportRowRecord[];
}

export interface ConfirmedExpertImportRecord extends PrivateImportRecord {
  readonly status: "completed";
  readonly persistedProjectionCount: number;
  readonly persistedRankingCount: number;
  readonly skippedRowCount: number;
}

export interface NewAdpSnapshotRecord {
  readonly provider: string;
  readonly seasonYear: number;
  readonly scoringFormat: string;
  readonly leagueSize: number;
  readonly retrievedAt: Date;
  readonly totalDrafts?: number;
  readonly records: readonly {
    readonly playerId: string;
    readonly overallAdp: number;
    readonly positionalAdp: number;
    readonly minimumPick?: number;
    readonly maximumPick?: number;
    readonly sampleSize?: number;
  }[];
}

export interface SavedAdpSnapshotRecord {
  readonly datasetVersionId: string;
  readonly persistedRecordCount: number;
  readonly retrievedAt: Date;
}

export interface AdpSnapshotContext {
  readonly provider: string;
  readonly seasonYear: number;
  readonly scoringFormat: string;
  readonly leagueSize: number;
}

export interface AdpSnapshotQuery {
  readonly seasonId: string;
  readonly provider?: string;
  readonly scoringFormat?: string;
  readonly leagueSize?: number;
}

export interface AdpSnapshotRecord {
  readonly datasetVersionId: string;
  readonly playerId: string;
  readonly provider: string;
  readonly scoringFormat: string;
  readonly leagueSize: number;
  readonly seasonId: string;
  readonly overallAdp: string;
  readonly positionalAdp: string;
  readonly minimumPick: string | null;
  readonly maximumPick: string | null;
  readonly sampleSize: number | null;
  readonly retrievedAt: Date;
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
