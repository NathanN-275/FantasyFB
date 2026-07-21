import { describe, expect, it, vi } from "vitest";
import { createHistoricalData } from "./index.js";

describe("HistoricalData", () => {
  it("returns persisted team-season aggregates without asking the UI to calculate them", async () => {
    const repository = {
      listPlayerWeeks: vi.fn(),
      listPlayerSeasons: vi.fn(),
      listTeamWeeks: vi.fn(),
      listTeamSeasons: vi.fn().mockResolvedValue([{ teamId: "team", values: { sacks: 41 } }])
    };
    const history = createHistoricalData(repository);

    await expect(
      history.teamSeason({
        teamId: "team",
        seasonId: "2025",
        datasetVersionId: "dataset",
        visibility: "public"
      })
    ).resolves.toEqual([{ teamId: "team", values: { sacks: 41 } }]);
    expect(repository.listTeamSeasons).toHaveBeenCalledOnce();
  });
});
