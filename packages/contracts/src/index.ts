/** Stable identifier brands prevent accidental mixing of domain identities. */
export type Brand<Value, Name extends string> = Value & { readonly __brand: Name };

export type UserId = Brand<string, "UserId">;
export type PlayerId = Brand<string, "PlayerId">;
export type LeagueId = Brand<string, "LeagueId">;
export type DraftId = Brand<string, "DraftId">;

/** Metadata that must accompany externally sourced or generated records. */
export interface DataProvenance {
  sourceName: string;
  sourceIdentifier?: string;
  sourceUrl?: string;
  season?: number;
  week?: number;
  retrievedAt: Date;
  effectiveAt?: Date;
  datasetVersion: string;
  licenseOrUsageNote?: string;
}
