import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthenticationRequiredError,
  authorizePrivateAccess
} from "../../../../../server/auth/private-access";
import { refreshAdpSnapshot } from "../../../../../server/expert-data";
import { POST } from "./route";

vi.mock("../../../../../server/auth/private-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../../server/auth/private-access")>();
  return { ...actual, authorizePrivateAccess: vi.fn() };
});

vi.mock("../../../../../server/expert-data", () => ({
  refreshAdpSnapshot: vi.fn()
}));

const authorize = vi.mocked(authorizePrivateAccess);
const refresh = vi.mocked(refreshAdpSnapshot);

describe("private ADP snapshot route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("requires private workspace authentication", async () => {
    authorize.mockRejectedValue(new AuthenticationRequiredError());
    const response = await POST(
      new Request("http://localhost/api/private/adp/snapshots", {
        method: "POST",
        body: JSON.stringify({ seasonYear: 2026, scoringFormat: "ppr", leagueSize: 12 })
      })
    );
    expect(response.status).toBe(401);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("validates and captures an authorized snapshot", async () => {
    authorize.mockResolvedValue({
      id: "user-id" as never,
      providerAccountId: "12345",
      displayName: null,
      email: null
    });
    refresh.mockResolvedValue({
      datasetVersionId: "dataset",
      persistedRecordCount: 100,
      retrievedAt: new Date("2026-07-25T12:00:00Z"),
      reused: false,
      providerRecordCount: 110,
      unresolvedRecordCount: 10
    });
    const response = await POST(
      new Request("http://localhost/api/private/adp/snapshots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seasonYear: 2026, scoringFormat: "ppr", leagueSize: 12 })
      })
    );
    expect(response.status).toBe(201);
    expect(refresh).toHaveBeenCalledWith({
      seasonYear: 2026,
      scoringFormat: "ppr",
      leagueSize: 12
    });
  });
});
