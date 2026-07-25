import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthorizationDeniedError,
  authorizePrivateAccess
} from "../../../../../server/auth/private-access";
import { normalizeLeague } from "../../../../../server/league-gateway";
import { POST } from "./route";

vi.mock("../../../../../server/auth/private-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../../server/auth/private-access")>();
  return { ...actual, authorizePrivateAccess: vi.fn() };
});

vi.mock("../../../../../server/league-gateway", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../../server/league-gateway")>();
  return { ...actual, normalizeLeague: vi.fn() };
});

const authorize = vi.mocked(authorizePrivateAccess);
const normalize = vi.mocked(normalizeLeague);

describe("private league normalization route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects unauthorized GitHub accounts before parsing league data", async () => {
    authorize.mockRejectedValue(new AuthorizationDeniedError());

    const response = await POST(
      new Request("http://localhost/api/private/leagues/normalize", {
        method: "POST",
        body: JSON.stringify({ source: "sleeper", leagueId: "league-1" })
      })
    );

    expect(response.status).toBe(403);
    expect(normalize).not.toHaveBeenCalled();
  });

  it("returns normalized output for an authorized request", async () => {
    authorize.mockResolvedValue({
      id: "user-id" as never,
      providerAccountId: "12345",
      displayName: null,
      email: null
    });
    normalize.mockResolvedValue({
      league: {
        format: "fantasyfb-league",
        version: 1,
        identity: { id: "league-id", name: "Test League", season: 2026 },
        provider: {
          kind: "manual",
          label: "Manual league",
          capabilities: {
            automaticLeagueImport: { state: "unavailable", detail: "Manual." },
            automaticDraftSynchronization: { state: "unavailable", detail: "Manual." },
            manualMode: { state: "available", detail: "Manual." },
            portableImport: { state: "available", detail: "Portable." }
          }
        },
        teamCount: 12,
        scoring: {
          rules: {
            name: "Test",
            statPoints: {},
            customPointValues: {},
            thresholdBonuses: [],
            longPlayBonuses: [],
            defensePointsAllowedTiers: [],
            defenseYardsAllowedTiers: []
          },
          unsupportedFields: []
        },
        rosterConfiguration: {
          slots: [{ label: "QB", eligiblePositions: ["QB"], count: 1, kind: "starter" }]
        },
        managers: [],
        teams: [],
        warnings: []
      },
      portableJson: '{"format":"fantasyfb-league"}\n'
    });
    const input = { source: "manual", league: { name: "Test League" } };

    const response = await POST(
      new Request("http://localhost/api/private/leagues/normalize", {
        method: "POST",
        body: JSON.stringify(input)
      })
    );

    expect(response.status).toBe(200);
    expect(normalize).toHaveBeenCalledWith(input);
    await expect(response.json()).resolves.toMatchObject({
      league: { identity: { id: "league-id" } }
    });
  });
});
