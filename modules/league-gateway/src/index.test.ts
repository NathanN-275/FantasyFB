import { describe, expect, it, vi } from "vitest";
import { createLeagueGateway, type ManualLeagueInput } from "./index.js";

const leaguePayload = {
  league_id: "league-1",
  name: "Deep League",
  season: "2026",
  total_rosters: 4,
  status: "pre_draft",
  scoring_settings: {
    pass_yd: 0.04,
    pass_td: 6,
    rec: 0.5,
    bonus_pass_yd_300: 3,
    unsupported_sleeper_stat: 2
  },
  roster_positions: ["QB", "RB", "RB", "WR", "WR", "FLEX", "BN", "BN", "IR"]
};

const usersPayload = [
  {
    user_id: "user-1",
    username: "alpha",
    display_name: "Alpha",
    metadata: { team_name: "Alpha Squad" },
    is_owner: true
  },
  { user_id: "user-2", username: "bravo", display_name: "Bravo" }
];

const rostersPayload = [
  {
    roster_id: 1,
    owner_id: "user-1",
    players: ["player-a", "player-b"],
    starters: ["player-a"],
    reserve: ["player-b"]
  },
  {
    roster_id: 2,
    owner_id: "user-2",
    players: ["player-c"],
    starters: ["player-c"],
    reserve: []
  }
];

const draftsPayload = [
  {
    draft_id: "draft-1",
    status: "pre_draft",
    type: "snake",
    draft_order: { "user-1": 1, "user-2": 2 },
    slot_to_roster_id: { "1": 1, "2": 2 }
  }
];

function response(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers }
  });
}

function sleeperFetch(overrides: Readonly<Record<string, Response>> = {}) {
  return vi.fn(async (input: string | URL | Request) => {
    const path = new URL(String(input)).pathname;
    if (overrides[path]) return overrides[path];
    if (path === "/v1/user/nathan") {
      return response({ user_id: "user-1", username: "nathan", display_name: "Nathan" });
    }
    if (path === "/v1/user/user-1/leagues/nfl/2026") return response([leaguePayload]);
    if (path === "/v1/league/league-1") return response(leaguePayload);
    if (path === "/v1/league/league-1/users") return response(usersPayload);
    if (path === "/v1/league/league-1/rosters") return response(rostersPayload);
    if (path === "/v1/league/league-1/drafts") return response(draftsPayload);
    return response({ error: "missing fixture" }, 404);
  });
}

const manualLeague: ManualLeagueInput = {
  provider: "manual",
  name: "Four Team Test",
  season: 2026,
  teamCount: 4,
  scoringRules: {
    name: "Custom",
    statPoints: { passingTouchdowns: 6, receptions: 0.75 },
    customPointValues: {},
    thresholdBonuses: [],
    longPlayBonuses: [],
    defensePointsAllowedTiers: [],
    defenseYardsAllowedTiers: []
  },
  rosterSlots: [
    { label: "QB", eligiblePositions: ["QB"], count: 1, kind: "starter" },
    { label: "FLEX", eligiblePositions: ["RB", "WR", "TE"], count: 2, kind: "starter" },
    {
      label: "BN",
      eligiblePositions: ["QB", "RB", "WR", "TE", "K", "DEF"],
      count: 4,
      kind: "bench"
    }
  ],
  managers: [],
  teams: []
};

describe("LeagueGateway", () => {
  it("discovers custom-sized Sleeper leagues by username and season", async () => {
    const fetch = sleeperFetch();
    const gateway = createLeagueGateway({ fetch });

    await expect(
      gateway.discover({ provider: "sleeper", username: "nathan", season: 2026 })
    ).resolves.toEqual([
      {
        provider: "sleeper",
        providerLeagueId: "league-1",
        name: "Deep League",
        season: 2026,
        teamCount: 4,
        status: "pre_draft"
      }
    ]);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.sleeper.app/v1/user/nathan",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("normalizes Sleeper scoring, roster slots, managers, rosters, and draft order", async () => {
    const gateway = createLeagueGateway({
      fetch: sleeperFetch(),
      createId: () => "canonical-id"
    });

    const league = await gateway.normalize({ source: "sleeper", leagueId: "league-1" });

    expect(league).toMatchObject({
      identity: {
        id: "canonical-id",
        providerLeagueId: "league-1",
        name: "Deep League",
        season: 2026
      },
      provider: { kind: "sleeper" },
      teamCount: 4,
      scoring: {
        rules: {
          statPoints: { passingYards: 0.04, passingTouchdowns: 6, receptions: 0.5 },
          thresholdBonuses: [
            { name: "bonus_pass_yd_300", stat: "passingYards", atLeast: 300, points: 3 }
          ]
        },
        unsupportedFields: [{ field: "unsupported_sleeper_stat", value: 2 }]
      },
      rosterConfiguration: {
        slots: [
          { label: "QB", count: 1, kind: "starter" },
          { label: "RB", count: 2, kind: "starter" },
          { label: "WR", count: 2, kind: "starter" },
          { label: "FLEX", count: 1, kind: "starter" },
          { label: "BN", count: 2, kind: "bench" },
          { label: "IR", count: 1, kind: "injured-reserve" }
        ]
      },
      teams: [
        {
          id: "sleeper-team:1",
          name: "Alpha Squad",
          managerIds: ["sleeper-manager:user-1"],
          providerRosterId: "1",
          roster: {
            playerExternalIds: ["player-a", "player-b"],
            starterExternalIds: ["player-a"],
            injuredReserveExternalIds: ["player-b"]
          }
        },
        {
          id: "sleeper-team:2",
          name: "Bravo",
          managerIds: ["sleeper-manager:user-2"],
          providerRosterId: "2",
          roster: {
            playerExternalIds: ["player-c"],
            starterExternalIds: ["player-c"],
            injuredReserveExternalIds: []
          }
        }
      ],
      draft: {
        providerDraftId: "draft-1",
        status: "pre-draft",
        type: "snake",
        order: [
          {
            slot: 1,
            teamId: "sleeper-team:1",
            managerId: "sleeper-manager:user-1"
          },
          {
            slot: 2,
            teamId: "sleeper-team:2",
            managerId: "sleeper-manager:user-2"
          }
        ]
      }
    });
    expect(league.warnings).toContain(
      "1 Sleeper scoring field could not be normalized and require manual review."
    );
    expect(league.warnings).toContain("Sleeper reported 4 teams but returned 2 roster records.");
  });

  it("reports missing provider records without fabricating them", async () => {
    const fetch = sleeperFetch({
      "/v1/league/league-1/users": response([]),
      "/v1/league/league-1/rosters": response([]),
      "/v1/league/league-1/drafts": response([])
    });
    const league = await createLeagueGateway({ fetch }).normalize({
      source: "sleeper",
      leagueId: "league-1"
    });

    expect(league.managers).toEqual([]);
    expect(league.teams).toEqual([]);
    expect(league.draft).toBeUndefined();
    expect(league.warnings).toEqual(
      expect.arrayContaining([
        "Sleeper returned no manager records for this league.",
        "Sleeper returned no roster records for this league.",
        "Sleeper returned no draft information for this league."
      ])
    );
  });

  it("surfaces Sleeper rate limiting with retry information", async () => {
    const gateway = createLeagueGateway({
      fetch: vi.fn(async () => response({ error: "slow down" }, 429, { "retry-after": "12" }))
    });

    await expect(
      gateway.discover({ provider: "sleeper", username: "nathan", season: 2026 })
    ).rejects.toMatchObject({
      code: "rate-limited",
      retryAfterSeconds: 12
    });
  });

  it("reports provider failures while keeping manual fallback independent", async () => {
    const gateway = createLeagueGateway({
      fetch: vi.fn(async () => response({ error: "down" }, 503)),
      createId: () => "manual-id"
    });

    await expect(
      gateway.discover({ provider: "sleeper", username: "nathan", season: 2026 })
    ).rejects.toMatchObject({ code: "provider-failure" });
    await expect(
      gateway.normalize({ source: "manual", league: manualLeague })
    ).resolves.toMatchObject({
      identity: { id: "manual-id", name: "Four Team Test" },
      provider: { kind: "manual" },
      teamCount: 4
    });
  });

  it("treats malformed provider payloads as explicit provider failures", async () => {
    const fetch = sleeperFetch({
      "/v1/league/league-1/rosters": response({ unexpected: "object" })
    });

    await expect(
      createLeagueGateway({ fetch }).normalize({ source: "sleeper", leagueId: "league-1" })
    ).rejects.toMatchObject({
      code: "provider-failure",
      message: "Sleeper returned an invalid league rosters. Manual mode remains available."
    });
  });

  it("creates ESPN manual profiles with honest provider capabilities and no credentials", async () => {
    const gateway = createLeagueGateway({ createId: () => "espn-id" });
    const league = await gateway.normalize({
      source: "espn",
      league: { ...manualLeague, provider: "espn", name: "Nathan ESPN League" }
    });

    expect(league.provider.capabilities).toMatchObject({
      automaticLeagueImport: { state: "unavailable" },
      automaticDraftSynchronization: { state: "experimental" },
      manualMode: { state: "available" },
      portableImport: { state: "available" }
    });
    expect(league).not.toHaveProperty("credentials");
    expect(JSON.stringify(league)).not.toMatch(/password|espn_s2|SWID/i);
  });

  it("round-trips normalized leagues through portable JSON", async () => {
    const gateway = createLeagueGateway({ createId: () => "portable-id" });
    const original = await gateway.normalize({ source: "manual", league: manualLeague });
    const contents = gateway.exportPortable(original);
    const restored = await gateway.normalize({ source: "portable-json", contents });

    expect(restored).toEqual(original);
    expect(contents).toMatch(/"format": "fantasyfb-league"/);
  });

  it("rejects a manual payload whose source and provider disagree", async () => {
    await expect(
      createLeagueGateway().normalize({
        source: "manual",
        league: { ...manualLeague, provider: "espn" }
      })
    ).rejects.toMatchObject({
      code: "invalid-input",
      message: "The normalization source must match the configured league provider."
    });
  });

  it("rejects malformed portable imports and cross-record references", async () => {
    const gateway = createLeagueGateway();
    await expect(
      gateway.normalize({ source: "portable-json", contents: "{" })
    ).rejects.toMatchObject({ code: "invalid-input" });

    const invalid = {
      ...(await gateway.normalize({ source: "manual", league: manualLeague })),
      teams: [
        {
          id: "team-1",
          name: "Broken Team",
          managerIds: ["missing-manager"],
          roster: {
            playerExternalIds: [],
            starterExternalIds: [],
            injuredReserveExternalIds: []
          }
        }
      ]
    };
    await expect(
      gateway.normalize({
        source: "portable-json",
        contents: JSON.stringify(invalid)
      })
    ).rejects.toMatchObject({ code: "invalid-input" });
  });
});
