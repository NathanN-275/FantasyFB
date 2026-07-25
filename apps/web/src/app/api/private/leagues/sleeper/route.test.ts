import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthenticationRequiredError,
  authorizePrivateAccess
} from "../../../../../server/auth/private-access";
import { discoverSleeperLeagues } from "../../../../../server/league-gateway";
import { GET } from "./route";

vi.mock("../../../../../server/auth/private-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../../server/auth/private-access")>();
  return { ...actual, authorizePrivateAccess: vi.fn() };
});

vi.mock("../../../../../server/league-gateway", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../../server/league-gateway")>();
  return { ...actual, discoverSleeperLeagues: vi.fn() };
});

const authorize = vi.mocked(authorizePrivateAccess);
const discover = vi.mocked(discoverSleeperLeagues);

describe("private Sleeper league discovery route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects signed-out requests before calling Sleeper", async () => {
    authorize.mockRejectedValue(new AuthenticationRequiredError());

    const response = await GET(
      new Request("http://localhost/api/private/leagues/sleeper?username=nathan&season=2026")
    );

    expect(response.status).toBe(401);
    expect(discover).not.toHaveBeenCalled();
  });

  it("passes authorized discovery through the server gateway", async () => {
    authorize.mockResolvedValue({
      id: "user-id" as never,
      providerAccountId: "12345",
      displayName: null,
      email: null
    });
    discover.mockResolvedValue([
      {
        provider: "sleeper",
        providerLeagueId: "league-1",
        name: "Test League",
        season: 2026,
        teamCount: 14,
        status: "pre_draft"
      }
    ]);

    const response = await GET(
      new Request("http://localhost/api/private/leagues/sleeper?username=nathan&season=2026")
    );

    expect(response.status).toBe(200);
    expect(discover).toHaveBeenCalledWith({ username: "nathan", season: 2026 });
    await expect(response.json()).resolves.toMatchObject({
      leagues: [{ providerLeagueId: "league-1", teamCount: 14 }]
    });
  });
});
