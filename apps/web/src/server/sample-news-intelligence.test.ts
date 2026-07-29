import { describe, expect, it } from "vitest";
import { sampleNewsFeed } from "./sample-news-intelligence";

describe("synthetic news feed", () => {
  it("exposes attributable fixture records with separated interpretation", async () => {
    const feed = await sampleNewsFeed();

    expect(feed.records).toHaveLength(5);
    expect(feed.records.every((record) => record.source.id === "synthetic-news-fixture")).toBe(
      true
    );
    expect(feed.records.every((record) => record.reportedFacts.length > 0)).toBe(true);
    expect(feed.records.every((record) => record.fantasyRelevance.applicationGenerated)).toBe(true);
    expect(feed.records.find((record) => record.id === "fixture-transaction-1")?.category).toBe(
      "transaction"
    );
  });

  it("filters by team, position, player, category, and freshness", async () => {
    await expectRecordCount({ team: "SEA" }, 1);
    await expectRecordCount({ position: "QB" }, 2);
    await expectRecordCount({ playerId: "sample-marcus-vale" }, 1);
    await expectRecordCount({ categories: ["contract"] }, 1);
    await expectRecordCount({ freshness: "stale" }, 1);
  });
});

async function expectRecordCount(query: Parameters<typeof sampleNewsFeed>[0], expected: number) {
  const feed = await sampleNewsFeed(query);
  expect(feed.records).toHaveLength(expected);
}
