import { z } from "zod";

export type ExpertRecordKind = "projection" | "ranking" | "combined";
export type PlayerResolution = "matched" | "ambiguous" | "missing" | "invalid";

export interface ExpertProviderStatus {
  readonly provider: string;
  readonly enabled: boolean;
  readonly reason?: string;
}

export interface ExpertProjection {
  readonly providerPlayerId?: string | undefined;
  readonly fullName: string;
  readonly team?: string | undefined;
  readonly position?: string | undefined;
  readonly projectedGames?: number | undefined;
  readonly projectedPoints?: number | undefined;
  readonly projectedPointsPerGame?: number | undefined;
  readonly floorPoints?: number | undefined;
  readonly medianPoints?: number | undefined;
  readonly ceilingPoints?: number | undefined;
  readonly confidence?: number | undefined;
  readonly statistics: Readonly<Record<string, number>>;
}

export interface ExpertRanking {
  readonly providerPlayerId?: string | undefined;
  readonly fullName: string;
  readonly team?: string | undefined;
  readonly position?: string | undefined;
  readonly overallRank: number;
  readonly positionRank?: number | undefined;
}

export interface ExpertDataset {
  readonly provider: string;
  readonly season: number;
  readonly retrievedAt: Date;
  readonly projections: readonly ExpertProjection[];
  readonly rankings: readonly ExpertRanking[];
  readonly unavailableReason?: string;
}

export interface ExpertDataProvider {
  status(): ExpertProviderStatus;
  load(input: { readonly season: number }): Promise<ExpertDataset>;
}

export interface AuthorizedExpertApiConfiguration {
  readonly providerName: string;
  readonly endpoint?: string;
  readonly token?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly clock?: () => Date;
}

const optionalFiniteNumber = z.number().finite().optional();
const expertApiProjectionSchema = z
  .object({
    providerPlayerId: z.string().min(1).optional(),
    fullName: z.string().min(1),
    team: z.string().min(1).optional(),
    position: z.string().min(1).optional(),
    projectedGames: optionalFiniteNumber,
    projectedPoints: optionalFiniteNumber,
    projectedPointsPerGame: optionalFiniteNumber,
    floorPoints: optionalFiniteNumber,
    medianPoints: optionalFiniteNumber,
    ceilingPoints: optionalFiniteNumber,
    confidence: optionalFiniteNumber,
    statistics: z.record(z.string().min(1), z.number().finite()).default({})
  })
  .strict();
const expertApiRankingSchema = z
  .object({
    providerPlayerId: z.string().min(1).optional(),
    fullName: z.string().min(1),
    team: z.string().min(1).optional(),
    position: z.string().min(1).optional(),
    overallRank: z.number().int().positive(),
    positionRank: z.number().int().positive().optional()
  })
  .strict();
const expertApiResponseSchema = z
  .object({
    projections: z.array(expertApiProjectionSchema).default([]),
    rankings: z.array(expertApiRankingSchema).default([])
  })
  .strict();

/**
 * Adapter for an explicitly licensed expert API. It is inert unless both an
 * HTTPS endpoint and a credential are configured.
 */
export class AuthorizedExpertApiProvider implements ExpertDataProvider {
  private readonly fetchImplementation: typeof globalThis.fetch;
  private readonly clock: () => Date;

  constructor(private readonly configuration: AuthorizedExpertApiConfiguration) {
    this.fetchImplementation = configuration.fetch ?? globalThis.fetch;
    this.clock = configuration.clock ?? (() => new Date());
  }

  status(): ExpertProviderStatus {
    const endpoint = parseAuthorizedEndpoint(this.configuration.endpoint);
    if (!endpoint || !this.configuration.token?.trim()) {
      return {
        provider: this.configuration.providerName,
        enabled: false,
        reason: "Authorized expert API credentials are not configured."
      };
    }
    return { provider: this.configuration.providerName, enabled: true };
  }

  async load(input: { readonly season: number }): Promise<ExpertDataset> {
    const status = this.status();
    const endpoint = parseAuthorizedEndpoint(this.configuration.endpoint);
    if (!status.enabled || !endpoint) {
      return unavailableExpertDataset(
        this.configuration.providerName,
        input.season,
        status.reason ?? "Authorized expert API is disabled.",
        this.clock()
      );
    }

    endpoint.searchParams.set("season", String(input.season));
    const response = await this.fetchImplementation(endpoint, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${this.configuration.token}`
      },
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) {
      throw new Error(`Authorized expert API returned HTTP ${response.status}.`);
    }
    const parsed = expertApiResponseSchema.parse(await response.json());
    return {
      provider: this.configuration.providerName,
      season: input.season,
      retrievedAt: this.clock(),
      projections: parsed.projections,
      rankings: parsed.rankings
    };
  }
}

export class NoExpertDataProvider implements ExpertDataProvider {
  status(): ExpertProviderStatus {
    return {
      provider: "none",
      enabled: false,
      reason: "No authorized expert data provider is configured."
    };
  }

  async load(input: { readonly season: number }): Promise<ExpertDataset> {
    return unavailableExpertDataset("none", input.season, this.status().reason!, new Date());
  }
}

export interface CsvImportProfile {
  readonly kind: ExpertRecordKind;
  readonly externalIdProvider?: string;
  readonly columns: {
    readonly fullName: string;
    readonly externalId?: string;
    readonly team?: string;
    readonly position?: string;
    readonly overallRank?: string;
    readonly positionRank?: string;
    readonly projectedGames?: string;
    readonly projectedPoints?: string;
    readonly projectedPointsPerGame?: string;
    readonly floorPoints?: string;
    readonly medianPoints?: string;
    readonly ceilingPoints?: string;
    readonly confidence?: string;
    readonly statistics?: Readonly<Record<string, string>>;
  };
}

export interface PlayerResolutionCandidate {
  readonly id: string;
  readonly fullName: string;
  readonly team?: string;
  readonly position?: string;
  readonly externalIds: readonly { readonly provider: string; readonly value: string }[];
}

export interface ProviderPlayerIdentity {
  readonly fullName: string;
  readonly team?: string;
  readonly position?: string;
  readonly externalId?: string;
  readonly externalIdProvider?: string;
}

/** Resolve an external player deterministically, preferring provider IDs over names. */
export function resolvePlayerIdentity(
  identity: ProviderPlayerIdentity,
  players: readonly PlayerResolutionCandidate[]
): readonly PlayerResolutionCandidate[] {
  if (identity.externalId && identity.externalIdProvider) {
    const byExternalId = players.filter((player) =>
      player.externalIds.some(
        (externalId) =>
          normalize(externalId.provider) === normalize(identity.externalIdProvider) &&
          externalId.value === identity.externalId
      )
    );
    if (byExternalId.length) return byExternalId;
  }
  return players.filter(
    (player) =>
      normalize(player.fullName) === normalize(identity.fullName) &&
      (!identity.team || normalize(player.team) === normalize(identity.team)) &&
      (!identity.position || normalize(player.position) === normalize(identity.position))
  );
}

export interface ExpertImportPreviewRow {
  readonly rowNumber: number;
  readonly resolution: PlayerResolution;
  readonly playerId?: string;
  readonly candidatePlayerIds: readonly string[];
  readonly sourceIdentity: {
    readonly fullName: string;
    readonly team?: string;
    readonly position?: string;
    readonly externalId?: string;
  };
  readonly projection?: ExpertProjection;
  readonly ranking?: ExpertRanking;
  readonly errors: readonly string[];
}

export interface ExpertImportPreview {
  readonly totalRows: number;
  readonly matchedRows: number;
  readonly ambiguousRows: number;
  readonly missingRows: number;
  readonly invalidRows: number;
  readonly rows: readonly ExpertImportPreviewRow[];
}

export class PrivateCsvExpertProvider {
  static readonly maximumBytes = 1_000_000;
  static readonly supportedContentTypes = new Set([
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel"
  ]);

  status(): ExpertProviderStatus {
    return { provider: "private-csv", enabled: true };
  }

  preview(input: {
    readonly fileName: string;
    readonly contentType: string;
    readonly contents: string;
    readonly profile: CsvImportProfile;
    readonly players: readonly PlayerResolutionCandidate[];
  }): ExpertImportPreview {
    validateCsvFile(input.fileName, input.contentType, input.contents);
    validateImportProfile(input.profile);
    const records = parseCsv(input.contents);
    if (records.length < 2) throw new Error("CSV must include a header and at least one data row.");

    const headers = records[0]!;
    const headerIndexes = new Map(headers.map((header, index) => [header.trim(), index]));
    const requiredHeaders = profileHeaders(input.profile);
    const missingHeaders = requiredHeaders.filter((header) => !headerIndexes.has(header));
    if (missingHeaders.length) {
      throw new Error(`CSV is missing configured columns: ${missingHeaders.join(", ")}.`);
    }

    const parsedRows = records
      .slice(1)
      .filter((record) => record.some((value) => value.trim().length > 0))
      .map((record, index) =>
        previewCsvRow(record, index + 2, headerIndexes, input.profile, input.players)
      );
    const rows = invalidateDuplicateRows(parsedRows);
    if (!rows.length) throw new Error("CSV does not contain any data rows.");
    return {
      totalRows: rows.length,
      matchedRows: countResolution(rows, "matched"),
      ambiguousRows: countResolution(rows, "ambiguous"),
      missingRows: countResolution(rows, "missing"),
      invalidRows: countResolution(rows, "invalid"),
      rows
    };
  }
}

export interface AdpRequest {
  readonly season: number;
  readonly scoringFormat: "standard" | "half-ppr" | "ppr" | "2qb" | "dynasty" | "rookie";
  readonly leagueSize: number;
}

export interface AdpProviderRecord {
  readonly providerPlayerId: string;
  readonly fullName: string;
  readonly team?: string;
  readonly position: string;
  readonly overallAdp: number;
  readonly positionalAdp: number;
  readonly minimumPick?: number;
  readonly maximumPick?: number;
  readonly sampleSize?: number;
}

export interface AdpDataset extends AdpRequest {
  readonly provider: string;
  readonly retrievedAt: Date;
  readonly totalDrafts?: number;
  readonly records: readonly AdpProviderRecord[];
  readonly unavailableReason?: string | undefined;
}

export interface AdpProvider {
  status(): ExpertProviderStatus;
  load(input: AdpRequest): Promise<AdpDataset>;
}

const fantasyFootballCalculatorResponseSchema = z
  .object({
    status: z.literal("Success"),
    meta: z
      .object({
        total_drafts: z.number().int().nonnegative().optional()
      })
      .passthrough(),
    players: z.array(
      z
        .object({
          player_id: z.union([z.string(), z.number()]),
          name: z.string().min(1),
          position: z.string().min(1),
          team: z.string().optional(),
          adp: z.number().finite().positive(),
          times_drafted: z.number().int().nonnegative().optional(),
          high: z.number().finite().positive().optional(),
          low: z.number().finite().positive().optional()
        })
        .passthrough()
    )
  })
  .passthrough();

export class FantasyFootballCalculatorAdpProvider implements AdpProvider {
  private readonly fetchImplementation: typeof globalThis.fetch;
  private readonly clock: () => Date;

  constructor(
    options: {
      readonly fetch?: typeof globalThis.fetch;
      readonly clock?: () => Date;
      readonly endpoint?: string;
    } = {}
  ) {
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
    this.clock = options.clock ?? (() => new Date());
    this.endpoint = options.endpoint ?? "https://fantasyfootballcalculator.com/api/v1/adp";
  }

  private readonly endpoint: string;

  status(): ExpertProviderStatus {
    return { provider: "fantasy-football-calculator", enabled: true };
  }

  async load(input: AdpRequest): Promise<AdpDataset> {
    validateAdpRequest(input);
    const url = new URL(`${this.endpoint}/${input.scoringFormat}`);
    url.searchParams.set("teams", String(input.leagueSize));
    url.searchParams.set("year", String(input.season));
    const response = await this.fetchImplementation(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15_000)
    });
    if (!response.ok) {
      throw new Error(`Fantasy Football Calculator ADP API returned HTTP ${response.status}.`);
    }
    const payload = fantasyFootballCalculatorResponseSchema.parse(await response.json());
    const positionCounts = new Map<string, number>();
    const records = [...payload.players]
      .sort((left, right) => left.adp - right.adp)
      .map((player) => {
        const positionalAdp = (positionCounts.get(player.position) ?? 0) + 1;
        positionCounts.set(player.position, positionalAdp);
        return {
          providerPlayerId: String(player.player_id),
          fullName: player.name,
          ...(player.team ? { team: player.team } : {}),
          position: player.position,
          overallAdp: player.adp,
          positionalAdp,
          ...(player.high === undefined ? {} : { minimumPick: player.high }),
          ...(player.low === undefined ? {} : { maximumPick: player.low }),
          ...(player.times_drafted === undefined ? {} : { sampleSize: player.times_drafted })
        };
      });
    return {
      ...input,
      provider: "fantasy-football-calculator",
      retrievedAt: this.clock(),
      ...(payload.meta.total_drafts === undefined
        ? {}
        : { totalDrafts: payload.meta.total_drafts }),
      records
    };
  }
}

export class NoAdpProvider implements AdpProvider {
  status(): ExpertProviderStatus {
    return { provider: "none", enabled: false, reason: "No permitted ADP provider is configured." };
  }

  async load(input: AdpRequest): Promise<AdpDataset> {
    return {
      ...input,
      provider: "none",
      retrievedAt: new Date(),
      records: [],
      unavailableReason: this.status().reason
    };
  }
}

export interface ExpertDisplayState {
  readonly showModelRank: true;
  readonly showModelProjection: true;
  readonly showExpertRank: boolean;
  readonly showExpertProjection: boolean;
  readonly explanation?: string;
}

export function createExpertDisplayState(dataset?: ExpertDataset): ExpertDisplayState {
  const showExpertRank = Boolean(dataset?.rankings.length);
  const showExpertProjection = Boolean(dataset?.projections.length);
  if (showExpertRank && showExpertProjection) {
    return {
      showModelRank: true,
      showModelProjection: true,
      showExpertRank,
      showExpertProjection
    };
  }
  if (showExpertRank || showExpertProjection) {
    return {
      showModelRank: true,
      showModelProjection: true,
      showExpertRank,
      showExpertProjection,
      explanation: showExpertRank
        ? "Expert projections are unavailable from the active provider."
        : "Expert rankings are unavailable from the active provider."
    };
  }
  return {
    showModelRank: true,
    showModelProjection: true,
    showExpertRank: false,
    showExpertProjection: false,
    explanation: dataset?.unavailableReason ?? "No expert data has been imported."
  };
}

function parseAuthorizedEndpoint(value: string | undefined): URL | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

function unavailableExpertDataset(
  provider: string,
  season: number,
  reason: string,
  retrievedAt: Date
): ExpertDataset {
  return {
    provider,
    season,
    retrievedAt,
    projections: [],
    rankings: [],
    unavailableReason: reason
  };
}

function validateCsvFile(fileName: string, contentType: string, contents: string): void {
  if (!fileName.toLowerCase().endsWith(".csv")) throw new Error("Only .csv files are supported.");
  if (!PrivateCsvExpertProvider.supportedContentTypes.has(contentType.toLowerCase())) {
    throw new Error(`Unsupported CSV content type: ${contentType}.`);
  }
  if (new TextEncoder().encode(contents).byteLength > PrivateCsvExpertProvider.maximumBytes) {
    throw new Error("CSV exceeds the 1 MB upload limit.");
  }
  if (contents.includes("\0")) throw new Error("CSV contains invalid binary content.");
}

function validateImportProfile(profile: CsvImportProfile): void {
  const columns = profile.columns;
  if (!columns.fullName.trim()) throw new Error("Import profile must map a player name column.");
  const hasRank = Boolean(columns.overallRank);
  const hasProjection = Boolean(
    columns.projectedPoints ||
    columns.projectedGames ||
    columns.projectedPointsPerGame ||
    columns.floorPoints ||
    columns.medianPoints ||
    columns.ceilingPoints ||
    columns.confidence ||
    Object.keys(columns.statistics ?? {}).length
  );
  if ((profile.kind === "ranking" || profile.kind === "combined") && !hasRank) {
    throw new Error("Ranking import profiles must map an overall rank column.");
  }
  if ((profile.kind === "projection" || profile.kind === "combined") && !hasProjection) {
    throw new Error("Projection import profiles must map at least one projection column.");
  }
  if (columns.externalId && !profile.externalIdProvider) {
    throw new Error("External ID mappings must identify their provider.");
  }
}

function profileHeaders(profile: CsvImportProfile): string[] {
  const { statistics, ...columns } = profile.columns;
  return [
    ...Object.values(columns).filter((value): value is string => Boolean(value)),
    ...Object.values(statistics ?? {})
  ];
}

function parseCsv(contents: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < contents.length; index += 1) {
    const character = contents[index]!;
    if (quoted) {
      if (character === '"' && contents[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      if (field.length) throw new Error("CSV contains an unexpected quote.");
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  if (field.length || row.length) {
    row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
    rows.push(row);
  }
  const width = rows[0]?.length;
  if (!width) throw new Error("CSV is empty.");
  if (rows.some((candidate) => candidate.length !== width)) {
    throw new Error("CSV rows do not match the header column count.");
  }
  return rows;
}

function previewCsvRow(
  record: readonly string[],
  rowNumber: number,
  headerIndexes: ReadonlyMap<string, number>,
  profile: CsvImportProfile,
  players: readonly PlayerResolutionCandidate[]
): ExpertImportPreviewRow {
  const value = (header?: string): string | undefined => {
    if (!header) return undefined;
    const index = headerIndexes.get(header);
    const result = index === undefined ? undefined : record[index]?.trim();
    return result || undefined;
  };
  const identity = {
    fullName: value(profile.columns.fullName) ?? "",
    ...(value(profile.columns.team) ? { team: value(profile.columns.team)! } : {}),
    ...(value(profile.columns.position) ? { position: value(profile.columns.position)! } : {}),
    ...(value(profile.columns.externalId) ? { externalId: value(profile.columns.externalId)! } : {})
  };
  const errors: string[] = [];
  if (!identity.fullName) errors.push("Player name is required.");

  const ranking =
    profile.kind === "ranking" || profile.kind === "combined"
      ? buildRanking(identity, profile, value, errors)
      : undefined;
  const projection =
    profile.kind === "projection" || profile.kind === "combined"
      ? buildProjection(identity, profile, value, errors)
      : undefined;
  const candidates = errors.length
    ? []
    : resolvePlayerIdentity(
        {
          ...identity,
          ...(profile.externalIdProvider ? { externalIdProvider: profile.externalIdProvider } : {})
        },
        players
      );
  const resolution: PlayerResolution = errors.length
    ? "invalid"
    : candidates.length === 1
      ? "matched"
      : candidates.length > 1
        ? "ambiguous"
        : "missing";
  return {
    rowNumber,
    resolution,
    ...(resolution === "matched" ? { playerId: candidates[0]!.id } : {}),
    candidatePlayerIds: candidates.map((candidate) => candidate.id),
    sourceIdentity: identity,
    ...(projection ? { projection } : {}),
    ...(ranking ? { ranking } : {}),
    errors
  };
}

function buildRanking(
  identity: ExpertImportPreviewRow["sourceIdentity"],
  profile: CsvImportProfile,
  value: (header?: string) => string | undefined,
  errors: string[]
): ExpertRanking | undefined {
  const overallRank = parsePositiveInteger(
    value(profile.columns.overallRank),
    "Overall rank",
    errors
  );
  const positionRank = profile.columns.positionRank
    ? parsePositiveInteger(value(profile.columns.positionRank), "Position rank", errors)
    : undefined;
  if (overallRank === undefined) return undefined;
  return {
    ...providerIdentity(identity),
    overallRank,
    ...(positionRank === undefined ? {} : { positionRank })
  };
}

function buildProjection(
  identity: ExpertImportPreviewRow["sourceIdentity"],
  profile: CsvImportProfile,
  value: (header?: string) => string | undefined,
  errors: string[]
): ExpertProjection {
  const number = (
    header: string | undefined,
    label: string,
    options = { minimum: 0, maximum: Infinity }
  ) => (header ? parseFiniteNumber(value(header), label, errors, options) : undefined);
  const statistics = Object.fromEntries(
    Object.entries(profile.columns.statistics ?? {}).flatMap(([field, header]) => {
      const parsed = number(header, field);
      return parsed === undefined ? [] : [[field, parsed]];
    })
  );
  return {
    ...providerIdentity(identity),
    ...(profile.columns.projectedGames
      ? {
          projectedGames: number(profile.columns.projectedGames, "Projected games", {
            minimum: 0,
            maximum: 18
          })
        }
      : {}),
    ...(profile.columns.projectedPoints
      ? { projectedPoints: number(profile.columns.projectedPoints, "Projected points") }
      : {}),
    ...(profile.columns.projectedPointsPerGame
      ? {
          projectedPointsPerGame: number(
            profile.columns.projectedPointsPerGame,
            "Projected points per game"
          )
        }
      : {}),
    ...(profile.columns.floorPoints
      ? { floorPoints: number(profile.columns.floorPoints, "Floor points") }
      : {}),
    ...(profile.columns.medianPoints
      ? { medianPoints: number(profile.columns.medianPoints, "Median points") }
      : {}),
    ...(profile.columns.ceilingPoints
      ? { ceilingPoints: number(profile.columns.ceilingPoints, "Ceiling points") }
      : {}),
    ...(profile.columns.confidence
      ? { confidence: number(profile.columns.confidence, "Confidence", { minimum: 0, maximum: 1 }) }
      : {}),
    statistics
  };
}

function providerIdentity(identity: ExpertImportPreviewRow["sourceIdentity"]) {
  return {
    ...(identity.externalId ? { providerPlayerId: identity.externalId } : {}),
    fullName: identity.fullName,
    ...(identity.team ? { team: identity.team } : {}),
    ...(identity.position ? { position: identity.position } : {})
  };
}

function parsePositiveInteger(
  raw: string | undefined,
  label: string,
  errors: string[]
): number | undefined {
  const parsed = parseFiniteNumber(raw, label, errors, { minimum: 1, maximum: Infinity });
  if (parsed !== undefined && !Number.isInteger(parsed)) {
    errors.push(`${label} must be an integer.`);
    return undefined;
  }
  return parsed;
}

function parseFiniteNumber(
  raw: string | undefined,
  label: string,
  errors: string[],
  options: { readonly minimum: number; readonly maximum: number }
): number | undefined {
  if (raw === undefined) {
    errors.push(`${label} is required.`);
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < options.minimum || parsed > options.maximum) {
    errors.push(`${label} must be between ${options.minimum} and ${options.maximum}.`);
    return undefined;
  }
  return parsed;
}

function normalize(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

function countResolution(
  rows: readonly ExpertImportPreviewRow[],
  resolution: PlayerResolution
): number {
  return rows.filter((row) => row.resolution === resolution).length;
}

function invalidateDuplicateRows(
  rows: readonly ExpertImportPreviewRow[]
): ExpertImportPreviewRow[] {
  const playerIds = new Set<string>();
  const overallRanks = new Set<number>();
  return rows.map((row) => {
    if (row.resolution !== "matched" || !row.playerId) return row;
    const errors: string[] = [];
    if (playerIds.has(row.playerId)) errors.push("Player appears more than once in the import.");
    if (row.ranking && overallRanks.has(row.ranking.overallRank)) {
      errors.push(`Overall rank ${row.ranking.overallRank} appears more than once.`);
    }
    playerIds.add(row.playerId);
    if (row.ranking) overallRanks.add(row.ranking.overallRank);
    if (!errors.length) return row;
    return {
      rowNumber: row.rowNumber,
      resolution: "invalid",
      candidatePlayerIds: row.candidatePlayerIds,
      sourceIdentity: row.sourceIdentity,
      ...(row.projection ? { projection: row.projection } : {}),
      ...(row.ranking ? { ranking: row.ranking } : {}),
      errors: [...row.errors, ...errors]
    };
  });
}

function validateAdpRequest(input: AdpRequest): void {
  if (!Number.isInteger(input.season) || input.season < 2007 || input.season > 2100) {
    throw new Error("ADP season must be between 2007 and 2100.");
  }
  if (!Number.isInteger(input.leagueSize) || input.leagueSize < 2 || input.leagueSize > 32) {
    throw new Error("ADP league size must be between 2 and 32.");
  }
}
