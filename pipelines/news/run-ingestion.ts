import { createDatabase, createRepositories } from "@fantasyfb/database";
import type { NewsSourceSnapshotRecord } from "@fantasyfb/contracts";
import {
  createNewsIntelligence,
  type NewsFeedSnapshot,
  type NewsPlayerCandidate,
  type NewsPosition,
  type NormalizedNewsRecord,
  type PermittedNewsSource
} from "@fantasyfb/news-intelligence";
import { z } from "zod";

const environmentSchema = z.object({
  DATABASE_URL: z.string().url(),
  NEWS_SOURCES_JSON: z.string().default("[]"),
  NEWS_SOURCE_TOKENS_JSON: z.string().default("{}")
});

const configuredSourceSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    feedUrl: z.string(),
    format: z.literal("json-feed"),
    usagePermission: z.enum(["authorized-api", "licensed-feed", "terms-permit-use"]),
    usageNote: z.string(),
    excerptPolicy: z.enum(["none", "summary-only", "feed-content-permitted"]),
    maximumExcerptCharacters: z.number(),
    staleAfterMinutes: z.number(),
    staleStoryAfterHours: z.number(),
    bearerTokenKey: z.string().min(1).optional()
  })
  .strict();

const environment = environmentSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  NEWS_SOURCES_JSON: process.env.NEWS_SOURCES_JSON || undefined,
  NEWS_SOURCE_TOKENS_JSON: process.env.NEWS_SOURCE_TOKENS_JSON || undefined
});
const rawSources: unknown = JSON.parse(environment.NEWS_SOURCES_JSON);
const sources = z.array(configuredSourceSchema).parse(rawSources);
const sourceTokens = z
  .record(z.string().min(1), z.string().min(1))
  .parse(JSON.parse(environment.NEWS_SOURCE_TOKENS_JSON));

if (!sources.length) {
  console.log(
    JSON.stringify({
      status: "disabled",
      message:
        "No permitted news sources are configured. Set NEWS_SOURCES_JSON only after source usage has been reviewed.",
      sources: []
    })
  );
  process.exit(0);
}

const repositories = createRepositories(createDatabase(environment.DATABASE_URL));
const catalog = await repositories.newsRepository.listEntityCatalog();
const players = catalog.players.flatMap((player) => {
  const position = normalizedPosition(player.position);
  return position
    ? [
        {
          id: player.id,
          fullName: player.fullName,
          position,
          ...(player.currentTeam ? { currentTeam: player.currentTeam } : {})
        } satisfies NewsPlayerCandidate
      ]
    : [];
});
const engine = createNewsIntelligence();
const report: {
  sourceId: string;
  status: "updated" | "preserved" | "unavailable";
  recordCount: number;
  warnings: readonly string[];
  datasetVersionId?: string;
}[] = [];

for (const configuredSource of sources) {
  const { bearerTokenKey, ...source } = configuredSource;
  let previous:
    Awaited<ReturnType<typeof repositories.newsRepository.findLatestSourceSnapshot>> | undefined;
  try {
    const validatedSource = engine.validateSource(source);
    previous = await repositories.newsRepository.findLatestSourceSnapshot(source.id);
    const result = await engine.aggregate({
      source: validatedSource,
      players,
      teams: catalog.teams,
      ...(previous ? { previousSnapshot: toDomainSnapshot(previous, validatedSource) } : {}),
      ...(bearerTokenKey ? { headers: bearerHeader(bearerTokenKey, sourceTokens) } : {})
    });

    let datasetVersionId: string | undefined;
    if (result.status === "updated") {
      const saved = await repositories.newsRepository.saveSnapshot({
        source: {
          name: source.name,
          sourceIdentifier: source.id,
          feedUrl: source.feedUrl,
          usageNote: source.usageNote
        },
        datasetVersion: result.datasetVersion,
        retrievedAt: result.retrievedAt,
        visibility: "public",
        records: result.records.map(withoutRecordSource)
      });
      datasetVersionId = saved.datasetVersionId;
    }

    report.push({
      sourceId: source.id,
      status: result.status,
      recordCount: result.records.length,
      warnings: result.warnings,
      ...(datasetVersionId ? { datasetVersionId } : {})
    });
  } catch (error) {
    report.push({
      sourceId: source.id,
      status: previous ? "preserved" : "unavailable",
      recordCount: previous?.records.length ?? 0,
      warnings: [
        previous
          ? `Source configuration failed; preserved the last valid feed retrieved at ${previous.retrievedAt.toISOString()}.`
          : "Source configuration failed and no valid prior feed is available.",
        error instanceof Error ? error.message : "Unknown source configuration failure."
      ]
    });
  }
}

console.log(
  JSON.stringify({
    status: report.some((source) => source.status === "unavailable") ? "degraded" : "completed",
    generatedAt: new Date().toISOString(),
    ignoredPlayersWithUnsupportedPositions: catalog.players.length - players.length,
    sources: report
  })
);

if (report.some((source) => source.status === "unavailable")) process.exitCode = 1;

function normalizedPosition(value: string): NewsPosition | undefined {
  const normalized = value.toUpperCase().replace(/[^A-Z]/g, "");
  if (normalized === "DST" || normalized === "D") return "DEF";
  return ["QB", "RB", "WR", "TE", "K", "DEF"].includes(normalized)
    ? (normalized as NewsPosition)
    : undefined;
}

function bearerHeader(
  tokenKey: string,
  tokens: Readonly<Record<string, string>>
): Readonly<Record<string, string>> {
  const token = tokens[tokenKey];
  if (!token) {
    throw new Error(
      `News source requires configured bearer token key ${tokenKey}, but it is not set.`
    );
  }
  return { authorization: `Bearer ${token}` };
}

function toDomainSnapshot(
  snapshot: NewsSourceSnapshotRecord,
  source: PermittedNewsSource
): NewsFeedSnapshot {
  return {
    sourceId: snapshot.sourceId,
    sourceName: snapshot.sourceName,
    datasetVersion: snapshot.datasetVersion,
    retrievedAt: snapshot.retrievedAt,
    records: snapshot.records.map((record) => ({
      ...record,
      source: {
        id: source.id,
        name: source.name,
        feedUrl: source.feedUrl,
        usagePermission: source.usagePermission,
        usageNote: source.usageNote
      }
    }))
  };
}

function withoutRecordSource(
  record: NormalizedNewsRecord
): Omit<NormalizedNewsRecord, "id" | "source"> {
  const { id, source, ...persistable } = record;
  void id;
  void source;
  return persistable;
}
