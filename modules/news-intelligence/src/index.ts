import { z } from "zod";

export const NEWS_CATEGORIES = [
  "injury",
  "transaction",
  "depth_chart",
  "contract",
  "suspension",
  "game",
  "general"
] as const;
const PLAYER_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"] as const;
const USAGE_PERMISSIONS = ["authorized-api", "licensed-feed", "terms-permit-use"] as const;
const EXCERPT_POLICIES = ["none", "summary-only", "feed-content-permitted"] as const;

export type NewsCategory = (typeof NEWS_CATEGORIES)[number];
export type NewsPosition = (typeof PLAYER_POSITIONS)[number];
export type NewsUsagePermission = (typeof USAGE_PERMISSIONS)[number];
export type NewsExcerptPolicy = (typeof EXCERPT_POLICIES)[number];
export type NewsDataFreshness = "current" | "stale" | "unknown";

export interface NewsPlayerCandidate {
  readonly id: string;
  readonly fullName: string;
  readonly position: NewsPosition;
  readonly currentTeam?: string;
  readonly aliases?: readonly string[];
}

export interface NewsTeamCandidate {
  readonly abbreviation: string;
  readonly name: string;
  readonly aliases?: readonly string[];
}

export interface PermittedNewsSource {
  readonly id: string;
  readonly name: string;
  readonly feedUrl: string;
  readonly format: "json-feed";
  readonly usagePermission: NewsUsagePermission;
  readonly usageNote: string;
  readonly excerptPolicy: NewsExcerptPolicy;
  readonly maximumExcerptCharacters: number;
  readonly staleAfterMinutes: number;
  readonly staleStoryAfterHours: number;
}

export interface RelatedNewsPlayer {
  readonly id: string;
  readonly fullName: string;
  readonly position: NewsPosition;
  readonly currentTeam?: string;
  readonly confidence: number;
  readonly matchedText: string;
}

export interface RelatedNewsTeam {
  readonly abbreviation: string;
  readonly name: string;
  readonly confidence: number;
  readonly basis: "explicit-mention" | "current-player-team";
}

export interface ReportedInjuryInformation {
  readonly reportedText: string;
  readonly designation?:
    "questionable" | "doubtful" | "out" | "injured-reserve" | "pup" | "suspended";
}

export interface FantasyNewsInterpretation {
  readonly text: string;
  readonly reasoning: readonly string[];
  readonly applicationGenerated: true;
}

export interface NormalizedNewsRecord {
  readonly id: string;
  readonly deduplicationKey: string;
  readonly headline: string;
  readonly source: {
    readonly id: string;
    readonly name: string;
    readonly feedUrl: string;
    readonly usagePermission: NewsUsagePermission;
    readonly usageNote: string;
  };
  readonly originalArticleUrl: string;
  readonly publicationTime: Date | null;
  readonly retrievedTime: Date;
  readonly permittedExcerpt: string | null;
  readonly reportedFacts: readonly string[];
  readonly relatedPlayers: readonly RelatedNewsPlayer[];
  readonly relatedTeams: readonly RelatedNewsTeam[];
  readonly category: NewsCategory;
  readonly injuryInformation?: ReportedInjuryInformation;
  readonly fantasyRelevance: FantasyNewsInterpretation;
  readonly entityMatchConfidence: number;
  readonly dataFreshness: NewsDataFreshness;
}

export interface NewsFeedSnapshot {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly datasetVersion: string;
  readonly retrievedAt: Date;
  readonly records: readonly NormalizedNewsRecord[];
}

export interface NewsAggregationResult extends NewsFeedSnapshot {
  readonly status: "updated" | "preserved" | "unavailable";
  readonly warnings: readonly string[];
}

export interface NewsFeedRequest {
  readonly source: PermittedNewsSource;
  readonly players: readonly NewsPlayerCandidate[];
  readonly teams: readonly NewsTeamCandidate[];
  readonly previousSnapshot?: NewsFeedSnapshot;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface NewsQuery {
  readonly team?: string;
  readonly position?: NewsPosition;
  readonly playerId?: string;
  readonly categories?: readonly NewsCategory[];
  readonly freshness?: NewsDataFreshness;
}

const permittedSourceSchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    feedUrl: z
      .string()
      .url()
      .refine((value) => new URL(value).protocol === "https:", {
        message: "Permitted news feeds must use HTTPS."
      }),
    format: z.literal("json-feed"),
    usagePermission: z.enum(USAGE_PERMISSIONS),
    usageNote: z.string().trim().min(12),
    excerptPolicy: z.enum(EXCERPT_POLICIES),
    maximumExcerptCharacters: z.number().int().min(0).max(2_000),
    staleAfterMinutes: z.number().int().positive(),
    staleStoryAfterHours: z.number().int().positive()
  })
  .strict()
  .superRefine((source, context) => {
    if (source.excerptPolicy === "none" && source.maximumExcerptCharacters !== 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maximumExcerptCharacters"],
        message: "Sources with no excerpt permission must set the maximum excerpt length to zero."
      });
    }
    if (source.excerptPolicy !== "none" && source.maximumExcerptCharacters === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maximumExcerptCharacters"],
        message: "Excerpt-enabled sources must allow at least one character."
      });
    }
  });

const jsonFeedItemSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    url: z.string().url(),
    title: z.string().trim().min(1),
    summary: z.string().optional(),
    content_text: z.string().optional(),
    date_published: z.string().optional(),
    tags: z.array(z.string()).optional()
  })
  .passthrough();

const jsonFeedSchema = z
  .object({
    version: z.string().optional(),
    title: z.string().optional(),
    items: z.array(z.unknown())
  })
  .passthrough();

const playerSchema = z
  .object({
    id: z.string().min(1),
    fullName: z.string().trim().min(2),
    position: z.enum(PLAYER_POSITIONS),
    currentTeam: z.string().trim().min(2).max(4).optional(),
    aliases: z.array(z.string().trim().min(2)).optional()
  })
  .strict();

const teamSchema = z
  .object({
    abbreviation: z.string().trim().min(2).max(4),
    name: z.string().trim().min(2),
    aliases: z.array(z.string().trim().min(2)).optional()
  })
  .strict();

/**
 * Provider-neutral news intelligence. External response objects are validated and
 * normalized here; callers only receive attributable domain records.
 */
export function createNewsIntelligence(options?: {
  readonly fetchImplementation?: typeof fetch;
  readonly now?: () => Date;
}) {
  const fetchImplementation = options?.fetchImplementation ?? globalThis.fetch;
  const now = options?.now ?? (() => new Date());

  return {
    async aggregate(request: NewsFeedRequest): Promise<NewsAggregationResult> {
      const retrievedAt = now();
      try {
        const source = permittedSourceSchema.parse(request.source);
        const players = z.array(playerSchema).parse(request.players);
        const teams = z.array(teamSchema).parse(request.teams);
        const response = await fetchImplementation(source.feedUrl, {
          headers: {
            accept: "application/feed+json, application/json",
            "user-agent": "FantasyFB-NewsIntelligence/1.0",
            ...request.headers
          },
          redirect: "follow"
        });
        if (!response.ok) {
          throw new Error(`News provider returned HTTP ${response.status}.`);
        }

        const raw: unknown = await response.json();
        const parsedFeed = jsonFeedSchema.parse(raw);
        const warnings: string[] = [];
        const records = parsedFeed.items.flatMap((item, index) => {
          const parsedItem = jsonFeedItemSchema.safeParse(item);
          if (!parsedItem.success) {
            warnings.push(`Skipped malformed item ${index + 1}.`);
            return [];
          }
          return [
            normalizeItem({
              item: parsedItem.data,
              source,
              players,
              teams,
              retrievedAt,
              warnings
            })
          ];
        });

        if (parsedFeed.items.length > 0 && records.length === 0) {
          throw new Error("Every news item was malformed.");
        }

        const deduplicated = deduplicateNews(records);
        if (deduplicated.length !== records.length) {
          warnings.push(
            `Removed ${records.length - deduplicated.length} duplicate or syndicated story record(s).`
          );
        }

        const latestPublicationTime = newestPublicationTime(deduplicated);
        if (
          !latestPublicationTime ||
          retrievedAt.getTime() - latestPublicationTime.getTime() >
            source.staleAfterMinutes * 60_000
        ) {
          warnings.push(
            latestPublicationTime
              ? `Feed is stale: its newest valid item is older than ${source.staleAfterMinutes} minutes.`
              : "Feed freshness is unknown because no item has a valid publication timestamp."
          );
        }

        return {
          sourceId: source.id,
          sourceName: source.name,
          datasetVersion: datasetVersion(source.id, retrievedAt, deduplicated),
          retrievedAt,
          records: deduplicated,
          status: "updated",
          warnings
        };
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Unknown provider failure.";
        if (request.previousSnapshot) {
          return {
            ...request.previousSnapshot,
            status: "preserved",
            warnings: [
              `Source update failed; preserved the last valid feed retrieved at ${request.previousSnapshot.retrievedAt.toISOString()}.`,
              reason
            ]
          };
        }
        return {
          sourceId: request.source.id,
          sourceName: request.source.name,
          datasetVersion: `unavailable-${retrievedAt.toISOString()}`,
          retrievedAt,
          records: [],
          status: "unavailable",
          warnings: [`Source update failed and no valid prior feed is available. ${reason}`]
        };
      }
    },

    filter(records: readonly NormalizedNewsRecord[], query: NewsQuery = {}) {
      const team = query.team?.toUpperCase();
      const categories = query.categories ? new Set(query.categories) : undefined;
      return records.filter(
        (record) =>
          (!team || record.relatedTeams.some((relatedTeam) => relatedTeam.abbreviation === team)) &&
          (!query.position ||
            record.relatedPlayers.some((player) => player.position === query.position)) &&
          (!query.playerId ||
            record.relatedPlayers.some((player) => player.id === query.playerId)) &&
          (!categories || categories.has(record.category)) &&
          (!query.freshness || record.dataFreshness === query.freshness)
      );
    },

    deduplicate: deduplicateNews,
    validateSource(source: unknown): PermittedNewsSource {
      return permittedSourceSchema.parse(source);
    }
  };
}

function normalizeItem(input: {
  readonly item: z.infer<typeof jsonFeedItemSchema>;
  readonly source: z.infer<typeof permittedSourceSchema>;
  readonly players: readonly z.infer<typeof playerSchema>[];
  readonly teams: readonly z.infer<typeof teamSchema>[];
  readonly retrievedAt: Date;
  readonly warnings: string[];
}): NormalizedNewsRecord {
  const articleUrl = canonicalizeUrl(input.item.url);
  const excerpt = permittedExcerpt(input.item, input.source);
  const searchText = [input.item.title, excerpt].filter(Boolean).join(" ");
  const publicationTime = parsePublicationTime(input.item.date_published);
  if (input.item.date_published && !publicationTime) {
    input.warnings.push(`Ignored an invalid publication timestamp for "${input.item.title}".`);
  } else if (!input.item.date_published) {
    input.warnings.push(`Publication timestamp is missing for "${input.item.title}".`);
  }

  const playerMatches = matchPlayers(searchText, input.players, input.warnings);
  const teamMatches = matchTeams(searchText, input.teams);
  const relatedTeams = mergeRelatedTeams(teamMatches, playerMatches, input.teams);
  const category = categorize(searchText, input.item.tags ?? []);
  const injuryInformation =
    category === "injury" || category === "suspension"
      ? explicitInjuryInformation(searchText)
      : undefined;
  const freshness = storyFreshness(
    publicationTime,
    input.retrievedAt,
    input.source.staleStoryAfterHours
  );
  const facts = [input.item.title, ...(excerpt ? [excerpt] : [])];
  const relevance = interpretFantasyRelevance(category, injuryInformation, playerMatches, facts);
  const entityMatchConfidence = entityConfidence(playerMatches, teamMatches);
  const storyKey = storyFingerprint(input.item.title, publicationTime);

  return {
    id: String(input.item.id ?? stableHash(`${input.source.id}:${articleUrl}`)),
    deduplicationKey: storyKey,
    headline: input.item.title,
    source: {
      id: input.source.id,
      name: input.source.name,
      feedUrl: input.source.feedUrl,
      usagePermission: input.source.usagePermission,
      usageNote: input.source.usageNote
    },
    originalArticleUrl: articleUrl,
    publicationTime,
    retrievedTime: input.retrievedAt,
    permittedExcerpt: excerpt,
    reportedFacts: facts,
    relatedPlayers: playerMatches,
    relatedTeams,
    category,
    ...(injuryInformation ? { injuryInformation } : {}),
    fantasyRelevance: relevance,
    entityMatchConfidence,
    dataFreshness: freshness
  };
}

function permittedExcerpt(
  item: z.infer<typeof jsonFeedItemSchema>,
  source: z.infer<typeof permittedSourceSchema>
): string | null {
  if (source.excerptPolicy === "none") return null;
  const candidate =
    source.excerptPolicy === "summary-only" ? item.summary : (item.summary ?? item.content_text);
  if (!candidate) return null;
  const normalized = candidate.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (normalized.length <= source.maximumExcerptCharacters) return normalized;
  const clipped = normalized.slice(0, Math.max(0, source.maximumExcerptCharacters - 1)).trimEnd();
  return `${clipped}…`;
}

function matchPlayers(
  searchText: string,
  players: readonly z.infer<typeof playerSchema>[],
  warnings: string[]
): RelatedNewsPlayer[] {
  const candidates = players.flatMap((player) => {
    const names = [player.fullName, ...(player.aliases ?? [])];
    return names.flatMap((name, aliasIndex) =>
      containsPhrase(searchText, name)
        ? [{ player, matchedText: name, confidence: aliasIndex === 0 ? 1 : 0.86 }]
        : []
    );
  });

  const ambiguousNames = new Set<string>();
  const owners = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    const key = normalizedPhrase(candidate.matchedText);
    const ids = owners.get(key) ?? new Set<string>();
    ids.add(candidate.player.id);
    owners.set(key, ids);
    if (ids.size > 1) ambiguousNames.add(key);
  }
  for (const name of ambiguousNames) {
    warnings.push(`Player match "${name}" is ambiguous; no player relationship was assigned.`);
  }

  const matches = new Map<string, RelatedNewsPlayer>();
  for (const candidate of candidates) {
    if (ambiguousNames.has(normalizedPhrase(candidate.matchedText))) continue;
    const existing = matches.get(candidate.player.id);
    if (existing && existing.confidence >= candidate.confidence) continue;
    matches.set(candidate.player.id, {
      id: candidate.player.id,
      fullName: candidate.player.fullName,
      position: candidate.player.position,
      ...(candidate.player.currentTeam
        ? { currentTeam: candidate.player.currentTeam.toUpperCase() }
        : {}),
      confidence: candidate.confidence,
      matchedText: candidate.matchedText
    });
  }
  return [...matches.values()];
}

function matchTeams(
  searchText: string,
  teams: readonly z.infer<typeof teamSchema>[]
): RelatedNewsTeam[] {
  return teams.flatMap((team) => {
    const names = [team.name, team.abbreviation, ...(team.aliases ?? [])];
    const matched = names.find((name) => containsPhrase(searchText, name));
    return matched
      ? [
          {
            abbreviation: team.abbreviation.toUpperCase(),
            name: team.name,
            confidence:
              normalizedPhrase(matched) === normalizedPhrase(team.abbreviation) ? 0.82 : 1,
            basis: "explicit-mention" as const
          }
        ]
      : [];
  });
}

function mergeRelatedTeams(
  explicitTeams: readonly RelatedNewsTeam[],
  players: readonly RelatedNewsPlayer[],
  teams: readonly z.infer<typeof teamSchema>[]
): RelatedNewsTeam[] {
  const related = new Map(explicitTeams.map((team) => [team.abbreviation, team]));
  for (const player of players) {
    if (!player.currentTeam || related.has(player.currentTeam)) continue;
    const team = teams.find(
      (candidate) => candidate.abbreviation.toUpperCase() === player.currentTeam?.toUpperCase()
    );
    if (!team) continue;
    related.set(player.currentTeam, {
      abbreviation: player.currentTeam,
      name: team.name,
      confidence: 0.7,
      basis: "current-player-team"
    });
  }
  return [...related.values()];
}

function categorize(text: string, tags: readonly string[]): NewsCategory {
  const value = normalizedPhrase(`${text} ${tags.join(" ")}`);
  const groups: readonly [NewsCategory, readonly string[]][] = [
    ["suspension", ["suspend", "suspension", "discipline", "banned"]],
    [
      "injury",
      [
        "injury",
        "injured",
        "questionable",
        "doubtful",
        "ruled out",
        "injured reserve",
        "pup list",
        "limited practice",
        "did not practice"
      ]
    ],
    [
      "transaction",
      [
        "transaction",
        "traded",
        "trade",
        "waived",
        "released",
        "claimed",
        "signed by",
        "activated",
        "roster move"
      ]
    ],
    [
      "depth_chart",
      ["depth chart", "starter", "first team", "backup", "demoted", "promoted", "named the no"]
    ],
    ["contract", ["contract", "extension", "restructured", "holdout", "hold in", "franchise tag"]],
    ["game", ["game recap", "box score", "touchdown", "yards in", "week "]]
  ];
  return (
    groups.find(([, keywords]) => keywords.some((keyword) => value.includes(keyword)))?.[0] ??
    "general"
  );
}

function explicitInjuryInformation(text: string): ReportedInjuryInformation | undefined {
  const normalized = normalizedPhrase(text);
  const designations: readonly [ReportedInjuryInformation["designation"], RegExp][] = [
    ["questionable", /\bquestionable\b/],
    ["doubtful", /\bdoubtful\b/],
    ["out", /\b(?:ruled\s+out|designated\s+out)\b/],
    ["injured-reserve", /\b(?:injured\s+reserve|placed\s+on\s+ir)\b/],
    ["pup", /\b(?:pup\s+list|physically\s+unable\s+to\s+perform)\b/],
    ["suspended", /\b(?:suspended|suspension)\b/]
  ];
  const designation = designations.find(([, expression]) => expression.test(normalized))?.[0];
  const injuryLanguage =
    designation !== undefined ||
    /\b(?:injury|injured|limited practice|did not practice|left practice|medical)\b/.test(
      normalized
    );
  if (!injuryLanguage) return undefined;
  return {
    reportedText: text,
    ...(designation ? { designation } : {})
  };
}

function interpretFantasyRelevance(
  category: NewsCategory,
  injury: ReportedInjuryInformation | undefined,
  players: readonly RelatedNewsPlayer[],
  facts: readonly string[]
): FantasyNewsInterpretation {
  const subject =
    players.length === 1
      ? players[0]!.fullName
      : players.length > 1
        ? "The matched players"
        : "This";
  const categoryText: Record<NewsCategory, string> = {
    injury: `${subject} report may affect near-term availability; verify practice reports and an official game designation before changing a lineup.`,
    transaction: `${subject} transaction may change roster opportunity or team context.`,
    depth_chart: `${subject} depth-chart report may change expected snaps or role, but a reported practice role is not a guaranteed game role.`,
    contract: `${subject} contract report is relevant when it changes participation or team availability.`,
    suspension: `${subject} suspension report may change game availability; use the explicitly reported term and official duration.`,
    game: `${subject} game report is backward-looking context and should not replace projection inputs.`,
    general: `${subject} report is contextual; no specific role or availability change is asserted.`
  };
  const reasoning = [
    `Category "${category}" was assigned from explicit words in the headline, permitted excerpt, or source tags.`,
    players.length
      ? `Fantasy relevance is scoped to ${players.map((player) => player.fullName).join(", ")} because those entities matched explicit text.`
      : "No player entity was matched, so the interpretation remains general.",
    ...(injury?.designation
      ? [`The designation "${injury.designation}" appears explicitly in the reported text.`]
      : category === "injury"
        ? ["No official injury designation was inferred from tone or sentiment."]
        : []),
    `Reported basis: ${facts.length} attributable feed field(s).`
  ];
  return { text: categoryText[category], reasoning, applicationGenerated: true };
}

function deduplicateNews(records: readonly NormalizedNewsRecord[]): NormalizedNewsRecord[] {
  const selected = new Map<string, NormalizedNewsRecord>();
  const urls = new Map<string, string>();
  for (const record of [...records].sort(comparePublicationDescending)) {
    const canonicalUrl = canonicalizeUrl(record.originalArticleUrl);
    const existingKey = urls.get(canonicalUrl);
    const key = existingKey ?? record.deduplicationKey;
    const existing = selected.get(key);
    selected.set(key, existing ? richerRecord(existing, record) : record);
    urls.set(canonicalUrl, key);
  }
  return [...selected.values()].sort(comparePublicationDescending);
}

function richerRecord(
  first: NormalizedNewsRecord,
  second: NormalizedNewsRecord
): NormalizedNewsRecord {
  const primary =
    (second.permittedExcerpt?.length ?? 0) > (first.permittedExcerpt?.length ?? 0) ? second : first;
  const secondary = primary === first ? second : first;
  return {
    ...primary,
    relatedPlayers: uniqueBy(
      [...primary.relatedPlayers, ...secondary.relatedPlayers],
      (player) => player.id
    ),
    relatedTeams: uniqueBy(
      [...primary.relatedTeams, ...secondary.relatedTeams],
      (team) => team.abbreviation
    ),
    entityMatchConfidence: Math.max(primary.entityMatchConfidence, secondary.entityMatchConfidence)
  };
}

function uniqueBy<Value>(values: readonly Value[], key: (value: Value) => string): Value[] {
  return [...new Map(values.map((value) => [key(value), value])).values()];
}

function comparePublicationDescending(a: NormalizedNewsRecord, b: NormalizedNewsRecord) {
  return (b.publicationTime?.getTime() ?? 0) - (a.publicationTime?.getTime() ?? 0);
}

function entityConfidence(
  players: readonly RelatedNewsPlayer[],
  teams: readonly RelatedNewsTeam[]
): number {
  const values = [
    ...players.map((player) => player.confidence),
    ...teams.map((team) => team.confidence)
  ];
  return values.length ? Math.max(...values) : 0;
}

function storyFreshness(
  publicationTime: Date | null,
  retrievedAt: Date,
  staleStoryAfterHours: number
): NewsDataFreshness {
  if (!publicationTime) return "unknown";
  return retrievedAt.getTime() - publicationTime.getTime() > staleStoryAfterHours * 60 * 60 * 1_000
    ? "stale"
    : "current";
}

function newestPublicationTime(records: readonly NormalizedNewsRecord[]): Date | undefined {
  const times = records.flatMap((record) =>
    record.publicationTime ? [record.publicationTime] : []
  );
  return times.sort((a, b) => b.getTime() - a.getTime())[0];
}

function parsePublicationTime(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function storyFingerprint(headline: string, publishedAt: Date | null): string {
  const day = publishedAt?.toISOString().slice(0, 10) ?? "undated";
  return stableHash(`${normalizedPhrase(headline)}:${day}`);
}

function datasetVersion(
  sourceId: string,
  retrievedAt: Date,
  records: readonly NormalizedNewsRecord[]
): string {
  return `${sourceId}-${retrievedAt.toISOString()}-${stableHash(
    records
      .map((record) => record.deduplicationKey)
      .sort()
      .join(":")
  )}`;
}

function canonicalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_|fbclid$|gclid$|ref$)/i.test(key)) url.searchParams.delete(key);
  }
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

function containsPhrase(haystack: string, needle: string): boolean {
  const words = normalizedPhrase(needle).split(" ").filter(Boolean).map(escapeRegularExpression);
  if (!words.length) return false;
  return new RegExp(`(?:^|\\b)${words.join("\\s+")}(?:\\b|$)`, "i").test(
    normalizedPhrase(haystack)
  );
}

function normalizedPhrase(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
