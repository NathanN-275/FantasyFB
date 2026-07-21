import type {
  HistoricalPlayerStatisticsQuery,
  HistoricalSeasonStatisticRecord,
  HistoricalStatisticsRepository,
  HistoricalTeamStatisticsQuery,
  HistoricalWeeklyStatisticRecord
} from "@fantasyfb/contracts";

/**
 * The sole application-facing module for persisted, normalized NFL history.
 * Consumers choose a versioned dataset; they never receive provider rows or
 * construct weekly-to-season aggregates in the UI.
 */
export class HistoricalData {
  constructor(private readonly repository: HistoricalStatisticsRepository) {}

  playerWeeks(input: HistoricalPlayerStatisticsQuery): Promise<HistoricalWeeklyStatisticRecord[]> {
    return this.repository.listPlayerWeeks(input);
  }

  playerSeason(input: HistoricalPlayerStatisticsQuery): Promise<HistoricalSeasonStatisticRecord[]> {
    return this.repository.listPlayerSeasons(input);
  }

  teamWeeks(input: HistoricalTeamStatisticsQuery): Promise<HistoricalWeeklyStatisticRecord[]> {
    return this.repository.listTeamWeeks(input);
  }

  teamSeason(input: HistoricalTeamStatisticsQuery): Promise<HistoricalSeasonStatisticRecord[]> {
    return this.repository.listTeamSeasons(input);
  }
}

export function createHistoricalData(repository: HistoricalStatisticsRepository): HistoricalData {
  return new HistoricalData(repository);
}
