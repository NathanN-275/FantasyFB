import type { Brand, DataProvenance, DraftId, LeagueId, PlayerId } from "@fantasyfb/contracts";

export type NflTeamId = Brand<string, "NflTeamId">;
export type SeasonId = Brand<string, "SeasonId">;
export type DraftPickId = Brand<string, "DraftPickId">;
export type DraftEventId = Brand<string, "DraftEventId">;
export type TradePackageId = Brand<string, "TradePackageId">;
export type ProjectionRecordId = Brand<string, "ProjectionRecordId">;
export type RankingRecordId = Brand<string, "RankingRecordId">;
export type AdpRecordId = Brand<string, "AdpRecordId">;

export type NflPosition = "QB" | "RB" | "WR" | "TE" | "K" | "DEF";
export type PlayerAvailability =
  "available" | "questionable" | "doubtful" | "out" | "inactive" | "unknown";
export type InjuryStatus =
  | "healthy"
  | "questionable"
  | "doubtful"
  | "out"
  | "injured-reserve"
  | "pup"
  | "suspended"
  | "unknown";

export interface NflPlayer {
  id: PlayerId;
  fullName: string;
  position: NflPosition;
  teamId?: NflTeamId;
  availability: PlayerAvailability;
  injuryStatus: InjuryStatus;
  externalIds: readonly ExternalProviderIdentifier[];
  provenance: DataProvenance;
}

export interface NflTeam {
  id: NflTeamId;
  name: string;
  abbreviation: string;
  conference?: "AFC" | "NFC";
  division?: "East" | "North" | "South" | "West";
  externalIds: readonly ExternalProviderIdentifier[];
  provenance: DataProvenance;
}

export interface Season {
  id: SeasonId;
  year: number;
  kind: "preseason" | "regular" | "postseason";
}

export interface Week {
  seasonId: SeasonId;
  number: number;
  kind: Season["kind"];
}

export interface ExternalProviderIdentifier {
  provider: string;
  entityType: "player" | "team" | "league" | "draft";
  value: string;
  provenance: DataProvenance;
}

export interface RosterSlot {
  id: string;
  eligiblePositions: readonly NflPosition[];
  count: number;
  kind: "starter" | "bench" | "injured-reserve";
}

export interface LeagueSettings {
  id: LeagueId;
  name: string;
  teamCount: number;
  rosterSlots: readonly RosterSlot[];
  scoringProfileName?: string;
}

/** A normalized player stat record; source-specific names never enter this model. */
export interface FantasyStatisticLine {
  playerId: PlayerId;
  seasonId: SeasonId;
  week?: Week;
  values: Readonly<Record<string, number>>;
  provenance: DataProvenance;
}

export interface DraftPick {
  id: DraftPickId;
  draftId: DraftId;
  overallPick: number;
  round: number;
  draftSlot: number;
  playerId?: PlayerId;
  keeper: boolean;
}

export interface DraftEvent {
  id: DraftEventId;
  draftId: DraftId;
  eventType:
    | "pick-recorded"
    | "pick-corrected"
    | "pick-removed"
    | "draft-paused"
    | "draft-resumed"
    | "draft-completed"
    | "keeper-assigned"
    | "pick-traded"
    | "player-mapping-resolved";
  receivedAt: Date;
  providerTimestamp?: Date;
  provenance: DataProvenance;
}

export interface TradePackage {
  id: TradePackageId;
  playerIds: readonly PlayerId[];
  provenance?: DataProvenance;
}

export interface ProjectionRecord {
  id: ProjectionRecordId;
  playerId: PlayerId;
  seasonId: SeasonId;
  values: Readonly<Record<string, number>>;
  modelVersion?: string;
  provenance: DataProvenance;
}

export interface RankingRecord {
  id: RankingRecordId;
  playerId: PlayerId;
  seasonId: SeasonId;
  rank: number;
  rankingKind: "model" | "expert" | "hybrid";
  provenance: DataProvenance;
}

export interface AdpRecord {
  id: AdpRecordId;
  playerId: PlayerId;
  seasonId: SeasonId;
  averageDraftPosition: number;
  provenance: DataProvenance;
}
