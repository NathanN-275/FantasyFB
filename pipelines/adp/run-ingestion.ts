import { createDatabase, createRepositories } from "@fantasyfb/database";
import { FantasyFootballCalculatorAdpProvider, resolveAdpDataset } from "@fantasyfb/expert-data";
import { createStructuredLogger, resolveCorrelationId } from "@fantasyfb/observability";
import { z } from "zod";

const contextSchema = z
  .object({
    scoringFormat: z.enum(["standard", "half-ppr", "ppr", "2qb", "dynasty", "rookie"]),
    leagueSize: z.number().int().min(2).max(32)
  })
  .strict();
const environmentSchema = z.object({
  DATABASE_URL: z.string().url(),
  TARGET_SEASON: z.coerce.number().int().min(2007).max(2100),
  ADP_CONTEXTS_JSON: z.string().min(2),
  CORRELATION_ID: z.string().optional()
});
const environment = environmentSchema.parse(process.env);
const contexts = z.array(contextSchema).min(1).parse(JSON.parse(environment.ADP_CONTEXTS_JSON));
const correlationId = resolveCorrelationId(environment.CORRELATION_ID);
const logger = createStructuredLogger({
  component: "adp-ingestion",
  environment: process.env.GITHUB_ACTIONS ? "github-actions" : "local",
  baseFields: { correlationId, targetSeason: environment.TARGET_SEASON }
});
const repositories = createRepositories(createDatabase(environment.DATABASE_URL));
const players = await repositories.playerRepository.listResolutionCandidates();
const provider = new FantasyFootballCalculatorAdpProvider();
let failures = 0;

for (const context of contexts) {
  const fields = { scoringFormat: context.scoringFormat, leagueSize: context.leagueSize };
  try {
    const latest = await repositories.adpRepository.findLatestSnapshot({
      provider: provider.status().provider,
      seasonYear: environment.TARGET_SEASON,
      ...context
    });
    if (latest && Date.now() - latest.retrievedAt.getTime() < 86_400_000) {
      logger.info("adp.snapshot.reused", {
        ...fields,
        datasetVersionId: latest.datasetVersionId,
        recordCount: latest.persistedRecordCount,
        retrievedAt: latest.retrievedAt
      });
      continue;
    }

    const dataset = await provider.load({ season: environment.TARGET_SEASON, ...context });
    const resolved = resolveAdpDataset(dataset, players);
    if (!resolved.records.length) {
      throw new Error("No provider records resolved to canonical players.");
    }
    const saved = await repositories.adpRepository.saveSnapshot({
      provider: dataset.provider,
      seasonYear: dataset.season,
      scoringFormat: dataset.scoringFormat,
      leagueSize: dataset.leagueSize,
      retrievedAt: dataset.retrievedAt,
      ...(dataset.totalDrafts === undefined ? {} : { totalDrafts: dataset.totalDrafts }),
      records: resolved.records
    });
    logger.info("adp.snapshot.completed", {
      ...fields,
      datasetVersionId: saved.datasetVersionId,
      providerRecordCount: dataset.records.length,
      persistedRecordCount: saved.persistedRecordCount,
      unresolvedRecordCount: resolved.unresolved.length
    });
  } catch (error) {
    failures += 1;
    logger.error("adp.provider.failed", {
      ...fields,
      error: error instanceof Error ? error : new Error("Unknown ADP ingestion failure")
    });
  }
}

logger.info("adp.ingestion.finished", {
  contextCount: contexts.length,
  failureCount: failures,
  status: failures ? "degraded" : "completed"
});
if (failures) process.exitCode = 1;
