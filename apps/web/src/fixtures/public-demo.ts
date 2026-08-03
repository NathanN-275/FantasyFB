import { z } from "zod";

const publicDemoSchema = z.object({
  fixtureId: z.literal("fantasyfb-public-demo-v1"),
  visibility: z.literal("sample"),
  synthetic: z.literal(true),
  label: z.string().min(1),
  league: z.object({
    name: z.string().min(1),
    season: z.number().int(),
    provider: z.literal("fixture"),
    teamCount: z.number().int().positive(),
    scoring: z.string().min(1),
    roster: z.array(z.string().min(1)).min(1),
    teams: z
      .array(
        z.object({
          name: z.string().min(1),
          manager: z.string().min(1),
          record: z.string().min(1),
          points: z.number().nonnegative()
        })
      )
      .min(1)
  }),
  features: z.array(
    z.object({
      title: z.string().min(1),
      description: z.string().min(1),
      href: z.string().startsWith("/")
    })
  ),
  architecture: z.array(
    z.object({
      layer: z.string().min(1),
      responsibility: z.string().min(1)
    })
  ),
  methodology: z.array(z.string().min(1)),
  sources: z.array(
    z.object({
      name: z.string().min(1),
      usage: z.string().min(1),
      href: z.string().startsWith("https://")
    })
  )
});

const fixture = {
  fixtureId: "fantasyfb-public-demo-v1",
  visibility: "sample",
  synthetic: true,
  label: "PUBLIC DEMO · SYNTHETIC SAMPLE DATA ONLY",
  league: {
    name: "Harbor City Home League",
    season: 2026,
    provider: "fixture",
    teamCount: 10,
    scoring: "Full PPR · 4-point passing TD",
    roster: ["1 QB", "2 RB", "2 WR", "1 TE", "2 FLEX", "1 K", "1 DEF", "6 bench"],
    teams: [
      { name: "Fourth & Long", manager: "Sample Manager A", record: "8-3", points: 1438.6 },
      { name: "Sunday Signals", manager: "Sample Manager B", record: "7-4", points: 1394.2 },
      { name: "Goal Line Stand", manager: "Sample Manager C", record: "7-4", points: 1368.9 },
      { name: "Red Zone Radio", manager: "Sample Manager D", record: "6-5", points: 1312.4 },
      { name: "Waiver Weather", manager: "Sample Manager E", record: "5-6", points: 1289.1 }
    ]
  },
  features: [
    {
      title: "Sample league",
      description: "See scoring, roster construction, standings, and provider capability labels.",
      href: "/league-demo"
    },
    {
      title: "Sample rankings",
      description: "Compare model, expert, hybrid, ADP, risk, and confidence on one board.",
      href: "/rankings"
    },
    {
      title: "Sample draft",
      description: "Replay normalized draft events and inspect explained recommendations.",
      href: "/draft-demo"
    },
    {
      title: "Sample trade evaluation",
      description: "Measure lineup, bench, replacement, and risk effects for both sides.",
      href: "/trade-demo"
    },
    {
      title: "Player profiles",
      description: "Trace projections, ranks, history, news, freshness, and source evidence.",
      href: "/players"
    },
    {
      title: "Draft field manual",
      description: "Read a versioned guide generated from structured, traceable fixture inputs.",
      href: "/draft-guide"
    }
  ],
  architecture: [
    {
      layer: "Public demo",
      responsibility: "Reads only validated sample fixtures and public, reusable datasets."
    },
    {
      layer: "Private application",
      responsibility: "Authenticates every request and derives ownership from the server session."
    },
    {
      layer: "Domain modules",
      responsibility:
        "Keep scoring, ranking, drafting, trades, and provider normalization portable."
    },
    {
      layer: "Repository boundary",
      responsibility: "Applies visibility and authenticated owner filters to private records."
    }
  ],
  methodology: [
    "Normalize statistics and league rules before calculating fantasy points.",
    "Version projection features, model runs, rankings, tiers, and source snapshots.",
    "Compare model value with expert fixtures and ADP without treating market data as truth.",
    "Expose floor, median, ceiling, confidence, freshness, and known missing inputs.",
    "Keep public sample computations separate from authenticated user-owned records."
  ],
  sources: [
    {
      name: "nflverse historical player stats",
      usage: "Documented historical-stat ingestion with dataset versions and reuse notes.",
      href: "https://github.com/nflverse/nflverse-data"
    },
    {
      name: "Sleeper API",
      usage: "Read-only league discovery and normalization behind the private boundary.",
      href: "https://docs.sleeper.com/"
    },
    {
      name: "Fantasy Football Calculator ADP",
      usage: "Attributed market snapshots with retrieval time, format, and league size.",
      href: "https://fantasyfootballcalculator.com/api"
    }
  ]
} as const;

export type PublicDemoFixtures = z.infer<typeof publicDemoSchema>;

/** The only supported entry point for public fixture metadata. */
export function loadPublicDemoFixtures(): PublicDemoFixtures {
  return publicDemoSchema.parse(fixture);
}
