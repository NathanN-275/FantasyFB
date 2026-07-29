import { and, desc, eq, inArray, max, or } from "drizzle-orm";
import {
  dataSources,
  datasetVersions,
  draftEvents,
  drafts,
  leagueConfigurations,
  projectionRuns,
  seasons
} from "./schema.js";
import type { Database } from "./types.js";

export interface OperationalHealthSnapshot {
  readonly checkedAt: Date;
  readonly databaseLatencyMs: number;
  readonly datasets: readonly {
    readonly id: string;
    readonly sourceName: string;
    readonly version: string;
    readonly visibility: "public" | "sample" | "private";
    readonly validationStatus: string;
    readonly freshnessStatus: string;
    readonly recordCount: number;
    readonly retrievedAt: Date;
  }[];
  readonly projectionRuns: readonly {
    readonly id: string;
    readonly seasonYear: number;
    readonly kind: "model" | "expert" | "hybrid";
    readonly modelVersion: string | null;
    readonly featureVersion: string | null;
    readonly generatedAt: Date;
  }[];
  readonly drafts: readonly {
    readonly id: string;
    readonly provider: string | null;
    readonly status: "scheduled" | "in_progress" | "paused" | "completed" | "cancelled";
    readonly updatedAt: Date;
    readonly lastEventReceivedAt: Date | null;
  }[];
}

export interface OperationalHealthRepository {
  inspect(ownerUserId: string): Promise<OperationalHealthSnapshot>;
}

/**
 * Read-only operational projection. Public/sample metadata and the authorized
 * user's private metadata are visible; another user's records cannot enter it.
 */
export function createOperationalHealthRepository(database: Database): OperationalHealthRepository {
  return {
    async inspect(ownerUserId) {
      const startedAt = Date.now();
      await database.execute("select 1");
      const databaseLatencyMs = Date.now() - startedAt;
      const visibleData = or(
        inArray(datasetVersions.visibility, ["public", "sample"]),
        and(eq(datasetVersions.visibility, "private"), eq(datasetVersions.ownerUserId, ownerUserId))
      );
      const visibleProjections = or(
        inArray(projectionRuns.visibility, ["public", "sample"]),
        and(eq(projectionRuns.visibility, "private"), eq(projectionRuns.ownerUserId, ownerUserId))
      );

      const [datasets, projections, draftRows] = await Promise.all([
        database
          .select({
            id: datasetVersions.id,
            sourceName: dataSources.name,
            version: datasetVersions.version,
            visibility: datasetVersions.visibility,
            validationStatus: datasetVersions.validationStatus,
            freshnessStatus: datasetVersions.freshnessStatus,
            recordCount: datasetVersions.recordCount,
            retrievedAt: datasetVersions.retrievedAt
          })
          .from(datasetVersions)
          .innerJoin(dataSources, eq(datasetVersions.dataSourceId, dataSources.id))
          .where(visibleData)
          .orderBy(desc(datasetVersions.retrievedAt))
          .limit(25),
        database
          .select({
            id: projectionRuns.id,
            seasonYear: seasons.year,
            kind: projectionRuns.projectionKind,
            modelVersion: projectionRuns.modelVersion,
            featureVersion: projectionRuns.featureVersion,
            generatedAt: projectionRuns.generatedAt
          })
          .from(projectionRuns)
          .innerJoin(seasons, eq(projectionRuns.seasonId, seasons.id))
          .where(visibleProjections)
          .orderBy(desc(projectionRuns.generatedAt))
          .limit(10),
        database
          .select({
            id: drafts.id,
            provider: drafts.provider,
            status: drafts.status,
            updatedAt: drafts.updatedAt,
            lastEventReceivedAt: max(draftEvents.receivedAt)
          })
          .from(drafts)
          .innerJoin(
            leagueConfigurations,
            eq(drafts.leagueConfigurationId, leagueConfigurations.id)
          )
          .leftJoin(draftEvents, eq(draftEvents.draftId, drafts.id))
          .where(eq(leagueConfigurations.ownerUserId, ownerUserId))
          .groupBy(drafts.id, drafts.provider, drafts.status, drafts.updatedAt)
          .orderBy(desc(drafts.updatedAt))
          .limit(10)
      ]);

      return {
        checkedAt: new Date(),
        databaseLatencyMs,
        datasets,
        projectionRuns: projections,
        drafts: draftRows
      };
    }
  };
}
