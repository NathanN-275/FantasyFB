import "server-only";
import { createHash } from "node:crypto";
import { createRepositories } from "@fantasyfb/database";
import {
  AuthorizedExpertApiProvider,
  createExpertDisplayState,
  FantasyFootballCalculatorAdpProvider,
  NoExpertDataProvider,
  PrivateCsvExpertProvider,
  resolvePlayerIdentity,
  type CsvImportProfile,
  type ExpertDataProvider
} from "@fantasyfb/expert-data";
import type { AuthorizedUser } from "@fantasyfb/authentication";
import { getDatabase } from "./database";

export function getExpertProvider(): ExpertDataProvider {
  const endpoint = process.env.EXPERT_API_URL;
  const token = process.env.EXPERT_API_TOKEN;
  if (!endpoint || !token) return new NoExpertDataProvider();
  return new AuthorizedExpertApiProvider({
    providerName: process.env.EXPERT_API_PROVIDER_NAME?.trim() || "authorized-expert-api",
    endpoint,
    token
  });
}

export async function getExpertDataStatus(season: number) {
  const provider = getExpertProvider();
  const status = provider.status();
  try {
    return {
      provider: status.provider,
      expertApiEnabled: status.enabled,
      ...createExpertDisplayState(await provider.load({ season }))
    };
  } catch (error) {
    return {
      provider: status.provider,
      expertApiEnabled: status.enabled,
      showModelRank: true as const,
      showModelProjection: true as const,
      showExpertRank: false,
      showExpertProjection: false,
      explanation:
        error instanceof Error
          ? `Expert provider unavailable: ${error.message}`
          : "Expert provider unavailable."
    };
  }
}

export async function stageAuthorizedExpertImport(input: {
  readonly user: AuthorizedUser;
  readonly seasonYear: number;
}) {
  const provider = getExpertProvider();
  const status = provider.status();
  if (!status.enabled) {
    throw new Error(status.reason ?? "Authorized expert API is disabled.");
  }
  const repositories = createRepositories(getDatabase());
  const [dataset, players] = await Promise.all([
    provider.load({ season: input.seasonYear }),
    repositories.playerRepository.listResolutionCandidates()
  ]);
  const combined = new Map<
    string,
    {
      sourceIdentity: Record<string, string>;
      projection?: (typeof dataset.projections)[number];
      ranking?: (typeof dataset.rankings)[number];
    }
  >();
  for (const projection of dataset.projections) {
    const key = expertIdentityKey(projection);
    const existing = combined.get(key);
    if (existing?.projection) throw new Error(`Expert API returned duplicate player ${key}.`);
    combined.set(key, {
      sourceIdentity: expertSourceIdentity(projection),
      ...existing,
      projection
    });
  }
  for (const ranking of dataset.rankings) {
    const key = expertIdentityKey(ranking);
    const existing = combined.get(key);
    if (existing?.ranking) throw new Error(`Expert API returned duplicate player ${key}.`);
    combined.set(key, {
      sourceIdentity: expertSourceIdentity(ranking),
      ...existing,
      ranking
    });
  }
  if (!combined.size) throw new Error("Authorized expert API returned no records.");
  const rows = [...combined.values()].map((record, index) => {
    const candidates = resolvePlayerIdentity(
      {
        fullName: record.sourceIdentity.fullName!,
        ...(record.sourceIdentity.team ? { team: record.sourceIdentity.team } : {}),
        ...(record.sourceIdentity.position ? { position: record.sourceIdentity.position } : {}),
        ...(record.sourceIdentity.externalId
          ? {
              externalId: record.sourceIdentity.externalId,
              externalIdProvider: dataset.provider
            }
          : {})
      },
      players
    );
    const resolution =
      candidates.length === 1 ? "matched" : candidates.length > 1 ? "ambiguous" : "missing";
    return {
      rowNumber: index + 1,
      resolution,
      ...(resolution === "matched" ? { playerId: candidates[0]!.id } : {}),
      candidatePlayerIds: candidates.map((candidate) => candidate.id),
      sourceIdentity: record.sourceIdentity,
      ...(record.projection
        ? { normalizedProjection: record.projection as unknown as Record<string, unknown> }
        : {}),
      ...(record.ranking
        ? { normalizedRanking: record.ranking as unknown as Record<string, unknown> }
        : {}),
      errors: []
    } as const;
  });
  const matchedPlayerIds = new Set<string>();
  const overallRanks = new Set<number>();
  for (const row of rows) {
    if (row.playerId) {
      if (matchedPlayerIds.has(row.playerId)) {
        throw new Error(`Expert API resolved multiple records to player ${row.playerId}.`);
      }
      matchedPlayerIds.add(row.playerId);
    }
    const rank = row.normalizedRanking?.overallRank;
    if (rank !== undefined) {
      if (typeof rank !== "number") {
        throw new Error("Expert API returned a non-numeric overall rank.");
      }
      if (overallRanks.has(rank)) {
        throw new Error(`Expert API returned duplicate overall rank ${rank}.`);
      }
      overallRanks.add(rank);
    }
  }
  const serialized = JSON.stringify({
    provider: dataset.provider,
    season: dataset.season,
    projections: dataset.projections,
    rankings: dataset.rankings
  });
  const importKind =
    dataset.projections.length && dataset.rankings.length
      ? "combined"
      : dataset.projections.length
        ? "projection"
        : "ranking";
  return repositories.importRepository.stageExpertImport(
    { userId: input.user.id },
    {
      seasonYear: dataset.season,
      providerName: dataset.provider,
      fileName: `${dataset.provider}-${dataset.season}-${dataset.retrievedAt.toISOString()}.json`,
      contentType: "application/json",
      checksum: createHash("sha256").update(serialized).digest("hex"),
      importKind,
      importProfile: { source: "authorized-api", kind: importKind },
      preserveOriginal: false,
      rows
    }
  );
}

export async function stagePrivateExpertImport(input: {
  readonly user: AuthorizedUser;
  readonly file: File;
  readonly seasonYear: number;
  readonly providerName: string;
  readonly profile: CsvImportProfile;
  readonly preserveOriginal: boolean;
}) {
  if (input.file.size > PrivateCsvExpertProvider.maximumBytes) {
    throw new Error("CSV exceeds the 1 MB upload limit.");
  }
  const contents = await input.file.text();
  const repositories = createRepositories(getDatabase());
  const players = await repositories.playerRepository.listResolutionCandidates();
  const preview = new PrivateCsvExpertProvider().preview({
    fileName: input.file.name,
    contentType: input.file.type || "text/csv",
    contents,
    profile: input.profile,
    players
  });
  return repositories.importRepository.stageExpertImport(
    { userId: input.user.id },
    {
      seasonYear: input.seasonYear,
      providerName: input.providerName,
      fileName: input.file.name,
      contentType: input.file.type || "text/csv",
      checksum: createHash("sha256").update(contents).digest("hex"),
      importKind: input.profile.kind,
      importProfile: input.profile as unknown as Record<string, unknown>,
      preserveOriginal: input.preserveOriginal,
      ...(input.preserveOriginal ? { originalContent: contents } : {}),
      rows: preview.rows.map((row) => ({
        rowNumber: row.rowNumber,
        resolution: row.resolution,
        ...(row.playerId ? { playerId: row.playerId } : {}),
        candidatePlayerIds: row.candidatePlayerIds,
        sourceIdentity: row.sourceIdentity,
        ...(row.projection
          ? { normalizedProjection: row.projection as unknown as Record<string, unknown> }
          : {}),
        ...(row.ranking
          ? { normalizedRanking: row.ranking as unknown as Record<string, unknown> }
          : {}),
        errors: row.errors
      }))
    }
  );
}

export async function confirmPrivateExpertImport(user: AuthorizedUser, importId: string) {
  return createRepositories(getDatabase()).importRepository.confirmExpertImport(
    { userId: user.id },
    importId
  );
}

export async function refreshAdpSnapshot(input: {
  readonly seasonYear: number;
  readonly scoringFormat: "standard" | "half-ppr" | "ppr" | "2qb" | "dynasty" | "rookie";
  readonly leagueSize: number;
}) {
  const repositories = createRepositories(getDatabase());
  const providerName = "fantasy-football-calculator";
  const latest = await repositories.adpRepository.findLatestSnapshot({
    provider: providerName,
    seasonYear: input.seasonYear,
    scoringFormat: input.scoringFormat,
    leagueSize: input.leagueSize
  });
  if (latest && Date.now() - latest.retrievedAt.getTime() < 86_400_000) {
    return {
      ...latest,
      reused: true,
      providerRecordCount: latest.persistedRecordCount,
      unresolvedRecordCount: 0
    };
  }
  const [dataset, players] = await Promise.all([
    new FantasyFootballCalculatorAdpProvider().load({
      season: input.seasonYear,
      scoringFormat: input.scoringFormat,
      leagueSize: input.leagueSize
    }),
    repositories.playerRepository.listResolutionCandidates()
  ]);
  const resolved = dataset.records.flatMap((record) => {
    const candidates = resolvePlayerIdentity(
      {
        fullName: record.fullName,
        ...(record.team ? { team: record.team } : {}),
        position: record.position,
        externalId: record.providerPlayerId,
        externalIdProvider: dataset.provider
      },
      players
    );
    if (candidates.length !== 1) return [];
    return [
      {
        playerId: candidates[0]!.id,
        overallAdp: record.overallAdp,
        positionalAdp: record.positionalAdp,
        ...(record.minimumPick === undefined ? {} : { minimumPick: record.minimumPick }),
        ...(record.maximumPick === undefined ? {} : { maximumPick: record.maximumPick }),
        ...(record.sampleSize === undefined ? {} : { sampleSize: record.sampleSize })
      }
    ];
  });
  if (!resolved.length) {
    throw new Error("No ADP provider players could be resolved to canonical players.");
  }
  if (new Set(resolved.map((record) => record.playerId)).size !== resolved.length) {
    throw new Error("ADP provider records resolved to duplicate canonical players.");
  }
  const saved = await repositories.adpRepository.saveSnapshot({
    provider: dataset.provider,
    seasonYear: dataset.season,
    scoringFormat: dataset.scoringFormat,
    leagueSize: dataset.leagueSize,
    retrievedAt: dataset.retrievedAt,
    ...(dataset.totalDrafts === undefined ? {} : { totalDrafts: dataset.totalDrafts }),
    records: resolved
  });
  return {
    ...saved,
    reused: false,
    providerRecordCount: dataset.records.length,
    unresolvedRecordCount: dataset.records.length - resolved.length
  };
}

function expertIdentityKey(input: {
  readonly providerPlayerId?: string | undefined;
  readonly fullName: string;
  readonly team?: string | undefined;
  readonly position?: string | undefined;
}): string {
  return input.providerPlayerId
    ? `id:${input.providerPlayerId}`
    : `name:${input.fullName.toLowerCase()}|${input.team ?? ""}|${input.position ?? ""}`;
}

function expertSourceIdentity(input: {
  readonly providerPlayerId?: string | undefined;
  readonly fullName: string;
  readonly team?: string | undefined;
  readonly position?: string | undefined;
}): Record<string, string> {
  return {
    fullName: input.fullName,
    ...(input.team ? { team: input.team } : {}),
    ...(input.position ? { position: input.position } : {}),
    ...(input.providerPlayerId ? { externalId: input.providerPlayerId } : {})
  };
}
