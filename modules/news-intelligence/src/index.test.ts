import { describe, expect, it } from "vitest";
import {
  createNewsIntelligence,
  type NewsFeedSnapshot,
  type NewsPlayerCandidate,
  type NewsTeamCandidate,
  type PermittedNewsSource
} from "./index.js";

const NOW = new Date("2026-07-28T16:00:00.000Z");

const source: PermittedNewsSource = {
  id: "licensed-fixture",
  name: "Licensed Fixture Wire",
  feedUrl: "https://news.example.test/feed.json",
  format: "json-feed",
  usagePermission: "licensed-feed",
  usageNote: "Fixture license permits normalized metadata and short excerpts.",
  excerptPolicy: "summary-only",
  maximumExcerptCharacters: 180,
  staleAfterMinutes: 180,
  staleStoryAfterHours: 48
};

const teams: NewsTeamCandidate[] = [
  {
    abbreviation: "BUF",
    name: "Buffalo Bills",
    aliases: ["Bills", "Buffalo"]
  },
  {
    abbreviation: "JAX",
    name: "Jacksonville Jaguars",
    aliases: ["Jaguars", "Jacksonville"]
  },
  {
    abbreviation: "NYJ",
    name: "New York Jets",
    aliases: ["Jets"]
  }
];

const players: NewsPlayerCandidate[] = [
  {
    id: "josh-allen-qb",
    fullName: "Josh Allen",
    position: "QB",
    currentTeam: "BUF"
  },
  {
    id: "travis-etienne",
    fullName: "Travis Etienne",
    position: "RB",
    currentTeam: "JAX",
    aliases: ["Travis Etienne Jr."]
  },
  {
    id: "aaron-glenn",
    fullName: "Aaron Glenn",
    position: "DEF",
    currentTeam: "NYJ"
  }
];

function jsonFeed(items: unknown[]) {
  return { version: "https://jsonfeed.org/version/1.1", title: "Fixture wire", items };
}

function successfulFetch(body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/feed+json" }
    })) as typeof fetch;
}

function request(
  overrides?: Partial<Parameters<ReturnType<typeof createNewsIntelligence>["aggregate"]>[0]>
) {
  return {
    source,
    players,
    teams,
    ...overrides
  };
}

describe("news intelligence aggregation", () => {
  it("deduplicates repeated article URLs even when tracking parameters differ", async () => {
    const engine = createNewsIntelligence({
      now: () => NOW,
      fetchImplementation: successfulFetch(
        jsonFeed([
          {
            id: "one",
            url: "https://news.example.test/story?utm_source=first",
            title: "Josh Allen leads Buffalo Bills practice",
            summary: "Josh Allen worked with the Buffalo Bills first-team offense.",
            date_published: "2026-07-28T15:00:00Z"
          },
          {
            id: "two",
            url: "https://news.example.test/story?utm_source=second",
            title: "Updated: Josh Allen leads Buffalo Bills practice",
            summary: "Josh Allen worked with the Buffalo Bills first-team offense.",
            date_published: "2026-07-28T15:05:00Z"
          }
        ])
      )
    });

    const result = await engine.aggregate(request());

    expect(result.status).toBe("updated");
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.originalArticleUrl).toBe("https://news.example.test/story");
    expect(result.warnings.join(" ")).toContain("duplicate or syndicated");
  });

  it("collapses syndicated stories with the same attributable headline and publication day", async () => {
    const engine = createNewsIntelligence({
      now: () => NOW,
      fetchImplementation: successfulFetch(
        jsonFeed([
          {
            url: "https://news.example.test/original",
            title: "Travis Etienne named starter on Jaguars depth chart",
            summary: "The Jacksonville Jaguars listed Travis Etienne with the first team.",
            date_published: "2026-07-28T12:00:00Z"
          },
          {
            url: "https://affiliate.example.test/syndicated",
            title: "Travis Etienne named starter on Jaguars depth chart",
            summary:
              "The Jacksonville Jaguars listed Travis Etienne with the first team in Tuesday work.",
            date_published: "2026-07-28T12:30:00Z"
          }
        ])
      )
    });

    const result = await engine.aggregate(request());

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.permittedExcerpt).toContain("Tuesday work");
    expect(result.records[0]?.category).toBe("depth_chart");
  });

  it("does not guess when a player name is ambiguous", async () => {
    const engine = createNewsIntelligence({
      now: () => NOW,
      fetchImplementation: successfulFetch(
        jsonFeed([
          {
            url: "https://news.example.test/josh-allen",
            title: "Josh Allen returns to practice",
            summary: "Josh Allen was present for the open portion.",
            date_published: "2026-07-28T15:00:00Z"
          }
        ])
      )
    });

    const result = await engine.aggregate(
      request({
        players: [
          players[0]!,
          {
            id: "josh-allen-edge",
            fullName: "Josh Allen",
            position: "DEF",
            currentTeam: "JAX"
          }
        ]
      })
    );

    expect(result.records[0]?.relatedPlayers).toEqual([]);
    expect(result.records[0]?.entityMatchConfidence).toBe(0);
    expect(result.warnings.join(" ")).toContain("ambiguous");
  });

  it("matches a traded player independently of team and retains explicit old-team context", async () => {
    const engine = createNewsIntelligence({
      now: () => NOW,
      fetchImplementation: successfulFetch(
        jsonFeed([
          {
            url: "https://news.example.test/trade",
            title: "Jets trade Travis Etienne after Jaguars tenure",
            summary: "Travis Etienne is moving from the Jacksonville Jaguars to the New York Jets.",
            date_published: "2026-07-28T14:00:00Z",
            tags: ["transaction"]
          }
        ])
      )
    });

    const result = await engine.aggregate(
      request({
        players: [{ ...players[1]!, currentTeam: "NYJ" }]
      })
    );

    expect(result.records[0]?.relatedPlayers.map((player) => player.id)).toEqual([
      "travis-etienne"
    ]);
    expect(result.records[0]?.relatedTeams.map((team) => team.abbreviation).sort()).toEqual([
      "JAX",
      "NYJ"
    ]);
    expect(result.records[0]?.category).toBe("transaction");
  });

  it("preserves the last valid snapshot when the feed is malformed", async () => {
    const previous = previousSnapshot();
    const engine = createNewsIntelligence({
      now: () => NOW,
      fetchImplementation: successfulFetch({ title: "Missing items" })
    });

    const result = await engine.aggregate(request({ previousSnapshot: previous }));

    expect(result.status).toBe("preserved");
    expect(result.datasetVersion).toBe(previous.datasetVersion);
    expect(result.records).toEqual(previous.records);
    expect(result.warnings.join(" ")).toContain("preserved the last valid feed");
  });

  it("keeps missing timestamps explicit instead of inventing publication time", async () => {
    const engine = createNewsIntelligence({
      now: () => NOW,
      fetchImplementation: successfulFetch(
        jsonFeed([
          {
            url: "https://news.example.test/no-time",
            title: "Josh Allen works with the first team",
            summary: "The Buffalo Bills quarterback took the opening reps."
          }
        ])
      )
    });

    const result = await engine.aggregate(request());

    expect(result.records[0]?.publicationTime).toBeNull();
    expect(result.records[0]?.dataFreshness).toBe("unknown");
    expect(result.warnings.join(" ")).toContain("timestamp is missing");
    expect(result.warnings.join(" ")).toContain("Feed freshness is unknown");
  });

  it("preserves the last valid snapshot during a provider outage", async () => {
    const previous = previousSnapshot();
    const engine = createNewsIntelligence({
      now: () => NOW,
      fetchImplementation: (async () =>
        new Response("Unavailable", { status: 503 })) as typeof fetch
    });

    const result = await engine.aggregate(request({ previousSnapshot: previous }));

    expect(result.status).toBe("preserved");
    expect(result.records).toHaveLength(1);
    expect(result.warnings.join(" ")).toContain("HTTP 503");
  });

  it("marks old stories and a lagging feed as stale", async () => {
    const engine = createNewsIntelligence({
      now: () => NOW,
      fetchImplementation: successfulFetch(
        jsonFeed([
          {
            url: "https://news.example.test/stale",
            title: "Josh Allen attended Buffalo Bills practice",
            summary: "An archived note recorded his attendance.",
            date_published: "2026-07-20T12:00:00Z"
          }
        ])
      )
    });

    const result = await engine.aggregate(request());

    expect(result.records[0]?.dataFreshness).toBe("stale");
    expect(result.warnings.join(" ")).toContain("Feed is stale");
  });

  it("separates reported text from generated interpretation and never infers a designation", async () => {
    const engine = createNewsIntelligence({
      now: () => NOW,
      fetchImplementation: successfulFetch(
        jsonFeed([
          {
            url: "https://news.example.test/injury",
            title: "Travis Etienne leaves practice with injury",
            summary: "The Jaguars said Travis Etienne left practice after medical attention.",
            date_published: "2026-07-28T15:00:00Z"
          }
        ])
      )
    });

    const result = await engine.aggregate(request());
    const record = result.records[0]!;

    expect(record.category).toBe("injury");
    expect(record.reportedFacts).toEqual([record.headline, record.permittedExcerpt]);
    expect(record.injuryInformation?.designation).toBeUndefined();
    expect(record.fantasyRelevance.applicationGenerated).toBe(true);
    expect(record.fantasyRelevance.reasoning.join(" ")).toContain(
      "No official injury designation was inferred"
    );
    expect(record.source.usageNote).toBe(source.usageNote);
    expect(record.originalArticleUrl).toBe("https://news.example.test/injury");
  });

  it("supports team, position, player, category, and freshness filters", async () => {
    const engine = createNewsIntelligence({
      now: () => NOW,
      fetchImplementation: successfulFetch(
        jsonFeed([
          {
            url: "https://news.example.test/qb",
            title: "Josh Allen signs contract extension with Buffalo Bills",
            summary: "Josh Allen and the Buffalo Bills agreed to a contract extension.",
            date_published: "2026-07-28T15:00:00Z"
          },
          {
            url: "https://news.example.test/rb",
            title: "Travis Etienne remains Jaguars starter",
            summary: "The Jacksonville Jaguars kept Travis Etienne atop the depth chart.",
            date_published: "2026-07-28T14:00:00Z"
          }
        ])
      )
    });
    const result = await engine.aggregate(request());

    expect(engine.filter(result.records, { team: "BUF" })).toHaveLength(1);
    expect(engine.filter(result.records, { position: "RB" })).toHaveLength(1);
    expect(engine.filter(result.records, { playerId: "josh-allen-qb" })).toHaveLength(1);
    expect(engine.filter(result.records, { categories: ["contract"] })).toHaveLength(1);
    expect(engine.filter(result.records, { freshness: "current" })).toHaveLength(2);
  });

  it("rejects a source without an explicit permitted-use declaration before fetching", () => {
    const engine = createNewsIntelligence();

    expect(() =>
      engine.validateSource({
        ...source,
        usagePermission: undefined,
        usageNote: "short"
      })
    ).toThrow();
  });

  it("does not expose complete feed content under a summary-only policy", async () => {
    const engine = createNewsIntelligence({
      now: () => NOW,
      fetchImplementation: successfulFetch(
        jsonFeed([
          {
            url: "https://news.example.test/body",
            title: "Josh Allen practice update",
            summary: "Permitted short summary.",
            content_text: "A complete article body that must not be republished.",
            date_published: "2026-07-28T15:00:00Z"
          }
        ])
      )
    });

    const result = await engine.aggregate(request());

    expect(result.records[0]?.permittedExcerpt).toBe("Permitted short summary.");
    expect(JSON.stringify(result.records[0])).not.toContain("complete article body");
  });
});

function previousSnapshot(): NewsFeedSnapshot {
  return {
    sourceId: source.id,
    sourceName: source.name,
    datasetVersion: "licensed-fixture-previous",
    retrievedAt: new Date("2026-07-28T12:00:00Z"),
    records: [
      {
        id: "previous-story",
        deduplicationKey: "previous-key",
        headline: "Previous valid story",
        source: {
          id: source.id,
          name: source.name,
          feedUrl: source.feedUrl,
          usagePermission: source.usagePermission,
          usageNote: source.usageNote
        },
        originalArticleUrl: "https://news.example.test/previous",
        publicationTime: new Date("2026-07-28T11:00:00Z"),
        retrievedTime: new Date("2026-07-28T12:00:00Z"),
        permittedExcerpt: "Previously retrieved permitted excerpt.",
        reportedFacts: ["Previous valid story", "Previously retrieved permitted excerpt."],
        relatedPlayers: [],
        relatedTeams: [],
        category: "general",
        fantasyRelevance: {
          text: "This report is contextual; no specific role or availability change is asserted.",
          reasoning: ["Fixture reasoning."],
          applicationGenerated: true
        },
        entityMatchConfidence: 0,
        dataFreshness: "current"
      }
    ]
  };
}
