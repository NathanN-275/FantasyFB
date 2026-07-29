import { describe, expect, it } from "vitest";
import type { OperationalHealthSnapshot } from "@fantasyfb/database";
import { summarizeOperationalHealth } from "./data-health";

const healthy: OperationalHealthSnapshot = {
  checkedAt: new Date("2026-07-29T12:00:00.000Z"),
  databaseLatencyMs: 12,
  datasets: [
    {
      id: "dataset-1",
      sourceName: "Reviewed source",
      version: "v1",
      visibility: "public",
      validationStatus: "valid",
      freshnessStatus: "valid",
      recordCount: 100,
      retrievedAt: new Date("2026-07-29T11:00:00.000Z")
    }
  ],
  projectionRuns: [],
  drafts: []
};

describe("data-health summary", () => {
  it("reports healthy validated data", () => {
    expect(summarizeOperationalHealth(healthy)).toMatchObject({
      status: "healthy",
      databaseLatencyMs: 12
    });
  });

  it("reports degraded state without removing the last valid dataset metadata", () => {
    const result = summarizeOperationalHealth({
      ...healthy,
      datasets: [{ ...healthy.datasets[0]!, freshnessStatus: "stale" }]
    });
    expect(result.status).toBe("degraded");
    expect(result.datasets).toHaveLength(1);
    expect(result.warning).toContain("stale");
  });
});
