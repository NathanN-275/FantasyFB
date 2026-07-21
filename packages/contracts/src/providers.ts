import type { DataProvenance } from "./index.js";

/** A provider result is canonical before it crosses this interface. */
export interface ProviderDataset<Record> {
  readonly records: readonly Record[];
  readonly provenance: DataProvenance;
}

export interface ProviderPlayerMetadata {
  readonly canonicalId: string;
  readonly externalIds: readonly ProviderExternalId[];
  readonly fullName: string;
  readonly position?: string;
  readonly teamAbbreviation?: string;
}

export interface ProviderHistoricalStatistic {
  readonly canonicalId: string;
  readonly playerExternalIds: readonly ProviderExternalId[];
  readonly season: number;
  readonly week?: number;
  readonly teamAbbreviation?: string;
  readonly position?: string;
  readonly values: Readonly<Record<string, number>>;
}

export interface ProviderSchedule {
  readonly canonicalId: string;
  readonly season: number;
  readonly week: number;
  readonly homeTeam: string;
  readonly awayTeam: string;
}

export interface ProviderRoster {
  readonly canonicalId: string;
  readonly playerExternalIds: readonly ProviderExternalId[];
  readonly teamAbbreviation: string;
  readonly season: number;
  readonly week?: number;
}

export interface ProviderAdp {
  readonly canonicalId: string;
  readonly playerExternalIds: readonly ProviderExternalId[];
  readonly averageDraftPosition: number;
  readonly season: number;
}

export interface ProviderProjection {
  readonly canonicalId: string;
  readonly playerExternalIds: readonly ProviderExternalId[];
  readonly season: number;
  readonly values: Readonly<Record<string, number>>;
}

export interface ProviderRanking {
  readonly canonicalId: string;
  readonly playerExternalIds: readonly ProviderExternalId[];
  readonly season: number;
  readonly rank: number;
}

export interface ProviderInjury {
  readonly canonicalId: string;
  readonly playerExternalIds: readonly ProviderExternalId[];
  readonly status: string;
  readonly reportedAt?: Date;
}

export interface ProviderNews {
  readonly canonicalId: string;
  readonly title: string;
  readonly url: string;
  readonly publishedAt: Date;
}

export interface ProviderLeague {
  readonly canonicalId: string;
  readonly externalIds: readonly ProviderExternalId[];
  readonly name: string;
}

export interface ProviderDraft {
  readonly canonicalId: string;
  readonly externalIds: readonly ProviderExternalId[];
  readonly leagueCanonicalId: string;
}

export interface ProviderExternalId {
  readonly provider: string;
  readonly value: string;
}

export interface HistoricalDataProvider {
  loadHistoricalStatistics(input: {
    readonly seasons: readonly number[];
  }): Promise<ProviderDataset<ProviderHistoricalStatistic>>;
}

export interface ProviderContracts {
  readonly playerMetadata?: ProviderDataset<ProviderPlayerMetadata>;
  readonly historicalStatistics?: ProviderDataset<ProviderHistoricalStatistic>;
  readonly schedules?: ProviderDataset<ProviderSchedule>;
  readonly rosters?: ProviderDataset<ProviderRoster>;
  readonly adp?: ProviderDataset<ProviderAdp>;
  readonly expertProjections?: ProviderDataset<ProviderProjection>;
  readonly expertRankings?: ProviderDataset<ProviderRanking>;
  readonly injuries?: ProviderDataset<ProviderInjury>;
  readonly news?: ProviderDataset<ProviderNews>;
  readonly fantasyLeagues?: ProviderDataset<ProviderLeague>;
  readonly fantasyDrafts?: ProviderDataset<ProviderDraft>;
}
