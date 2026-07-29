import {
  createNewsIntelligence,
  type NewsCategory,
  type NewsPosition,
  type NewsQuery
} from "@fantasyfb/news-intelligence";

const NOW = new Date("2026-07-28T16:00:00.000Z");

const players = [
  { id: "sample-marcus-vale", fullName: "Marcus Vale", position: "RB", currentTeam: "BAL" },
  { id: "sample-evan-cross", fullName: "Evan Cross", position: "QB", currentTeam: "BUF" },
  { id: "sample-rowan-price", fullName: "Rowan Price", position: "WR", currentTeam: "SEA" },
  { id: "sample-theo-grant", fullName: "Theo Grant", position: "QB", currentTeam: "PHI" },
  { id: "sample-devin-cole", fullName: "Devin Cole", position: "RB", currentTeam: "DET" }
] as const;

const teams = [
  { abbreviation: "BAL", name: "Baltimore Ravens", aliases: ["Baltimore", "Ravens"] },
  { abbreviation: "BUF", name: "Buffalo Bills", aliases: ["Buffalo", "Bills"] },
  { abbreviation: "SEA", name: "Seattle Seahawks", aliases: ["Seattle", "Seahawks"] },
  { abbreviation: "PHI", name: "Philadelphia Eagles", aliases: ["Philadelphia", "Eagles"] },
  { abbreviation: "DET", name: "Detroit Lions", aliases: ["Detroit", "Lions"] }
] as const;

const fixtureFeed = {
  version: "https://jsonfeed.org/version/1.1",
  title: "FantasyFB synthetic fixture wire",
  items: [
    {
      id: "fixture-role-1",
      url: "https://news.example.test/marcus-vale-role",
      title: "Marcus Vale remains atop Baltimore depth chart",
      summary:
        "The synthetic Baltimore fixture lists Marcus Vale with the first-team offense in its published practice note.",
      date_published: "2026-07-28T15:20:00Z",
      tags: ["depth chart"]
    },
    {
      id: "fixture-injury-1",
      url: "https://news.example.test/rowan-price-practice",
      title: "Rowan Price explicitly listed questionable in Seattle fixture",
      summary:
        "The synthetic Seattle practice report lists Rowan Price as questionable and says he was limited.",
      date_published: "2026-07-28T14:10:00Z",
      tags: ["injury"]
    },
    {
      id: "fixture-transaction-1",
      url: "https://news.example.test/evan-cross-roster-move",
      title: "Buffalo signs reserve quarterback behind Evan Cross",
      summary:
        "The synthetic Buffalo transaction note adds a reserve quarterback while Evan Cross remains on the roster.",
      date_published: "2026-07-28T13:40:00Z",
      tags: ["transaction"]
    },
    {
      id: "fixture-contract-1",
      url: "https://news.example.test/theo-grant-contract",
      title: "Theo Grant and Philadelphia agree to contract restructure",
      summary:
        "The synthetic Philadelphia fixture reports a contract restructure and makes no claim about playing status.",
      date_published: "2026-07-28T12:25:00Z",
      tags: ["contract"]
    },
    {
      id: "fixture-suspension-1",
      url: "https://news.example.test/devin-cole-suspension",
      title: "Detroit fixture reports Devin Cole suspended for one preseason game",
      summary:
        "The synthetic Detroit note explicitly uses the word suspended and identifies one preseason game.",
      date_published: "2026-07-25T12:00:00Z",
      tags: ["suspension"]
    }
  ]
};

const engine = createNewsIntelligence({
  now: () => NOW,
  fetchImplementation: (async () =>
    new Response(JSON.stringify(fixtureFeed), {
      status: 200,
      headers: { "content-type": "application/feed+json" }
    })) as typeof fetch
});

const resultPromise = engine.aggregate({
  source: {
    id: "synthetic-news-fixture",
    name: "FantasyFB synthetic fixture wire",
    feedUrl: "https://news.example.test/feed.json",
    format: "json-feed",
    usagePermission: "terms-permit-use",
    usageNote: "Synthetic FantasyFB-owned fixture content for public demonstration only.",
    excerptPolicy: "summary-only",
    maximumExcerptCharacters: 180,
    staleAfterMinutes: 10_080,
    staleStoryAfterHours: 48
  },
  players: [...players],
  teams: [...teams]
});

export async function sampleNewsFeed(query: NewsQuery = {}) {
  const result = await resultPromise;
  return {
    asOf: NOW,
    label: "PUBLIC DEMO · SYNTHETIC SAMPLE NEWS",
    records: engine.filter(result.records, query),
    warnings: result.warnings,
    filters: {
      teams: teams.map((team) => team.abbreviation),
      positions: [...new Set(players.map((player) => player.position))] as NewsPosition[],
      players: players.map((player) => ({ id: player.id, name: player.fullName })),
      categories: [
        "injury",
        "transaction",
        "depth_chart",
        "contract",
        "suspension",
        "game",
        "general"
      ] satisfies NewsCategory[]
    }
  };
}
