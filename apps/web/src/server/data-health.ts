import "server-only";
import {
  createOperationalHealthRepository,
  type OperationalHealthSnapshot
} from "@fantasyfb/database";
import { createStructuredLogger } from "@fantasyfb/observability";
import type { AuthorizedUser } from "@fantasyfb/authentication";
import { getDatabase } from "./database";

export interface DataHealthView {
  readonly status: "healthy" | "degraded" | "unavailable";
  readonly checkedAt: Date;
  readonly databaseLatencyMs?: number;
  readonly datasets: OperationalHealthSnapshot["datasets"];
  readonly projectionRuns: OperationalHealthSnapshot["projectionRuns"];
  readonly drafts: OperationalHealthSnapshot["drafts"];
  readonly warning?: string;
}

const logger = createStructuredLogger({
  component: "data-health",
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development"
});

export async function getDataHealth(user: AuthorizedUser): Promise<DataHealthView> {
  try {
    const snapshot = await createOperationalHealthRepository(getDatabase()).inspect(user.id);
    const view = summarizeOperationalHealth(snapshot);
    logger.info("data-health.checked", {
      ownerUserId: user.id,
      status: view.status,
      databaseLatencyMs: snapshot.databaseLatencyMs,
      datasetCount: snapshot.datasets.length,
      projectionRunCount: snapshot.projectionRuns.length,
      draftCount: snapshot.drafts.length
    });
    return view;
  } catch (error) {
    logger.error("data-health.failed", {
      ownerUserId: user.id,
      error: error instanceof Error ? error : new Error("Unknown data-health failure")
    });
    return {
      status: "unavailable",
      checkedAt: new Date(),
      datasets: [],
      projectionRuns: [],
      drafts: [],
      warning: "Operational metadata is temporarily unavailable. Existing data was not modified."
    };
  }
}

export function summarizeOperationalHealth(snapshot: OperationalHealthSnapshot): DataHealthView {
  const staleOrInvalid = snapshot.datasets.some(
    (dataset) =>
      dataset.validationStatus !== "valid" ||
      dataset.freshnessStatus === "stale" ||
      dataset.freshnessStatus === "invalid" ||
      dataset.freshnessStatus === "quarantined"
  );
  return {
    status: staleOrInvalid ? "degraded" : "healthy",
    checkedAt: snapshot.checkedAt,
    databaseLatencyMs: snapshot.databaseLatencyMs,
    datasets: snapshot.datasets,
    projectionRuns: snapshot.projectionRuns,
    drafts: snapshot.drafts,
    ...(staleOrInvalid
      ? { warning: "One or more datasets are stale, invalid, or quarantined." }
      : {})
  };
}
