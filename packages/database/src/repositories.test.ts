import { describe, expect, it } from "vitest";
import { createRepositories } from "./repositories.js";
import type { Database } from "./types.js";

describe("repository authorization boundary", () => {
  const repositories = createRepositories({} as Database);

  it("rejects private projection queries without an authorization context", async () => {
    await expect(
      repositories.projectionRepository.listForSeason({ seasonId: "season", visibility: "private" })
    ).rejects.toThrow("Private data access requires authorization context.");
  });

  it("rejects private ranking and news queries without an authorization context", async () => {
    await expect(
      repositories.rankingRepository.listForSeason({ seasonId: "season", visibility: "private" })
    ).rejects.toThrow("Private data access requires authorization context.");
    await expect(
      repositories.newsRepository.listForPlayer({
        playerId: "player",
        seasonId: "season",
        visibility: "private"
      })
    ).rejects.toThrow("Private data access requires authorization context.");
    await expect(
      repositories.newsRepository.list({
        visibility: "private"
      })
    ).rejects.toThrow("Private data access requires authorization context.");
  });
});
