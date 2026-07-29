import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthenticationRequiredError,
  authorizePrivateAccess
} from "../../../../server/auth/private-access";
import { evaluateAndSaveTrade, listSavedTrades } from "../../../../server/trade-engine";
import { GET, POST } from "./route";

vi.mock("../../../../server/auth/private-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../server/auth/private-access")>();
  return { ...actual, authorizePrivateAccess: vi.fn() };
});

vi.mock("../../../../server/trade-engine", () => ({
  evaluateAndSaveTrade: vi.fn(),
  listSavedTrades: vi.fn()
}));

const authorize = vi.mocked(authorizePrivateAccess);
const saveTrade = vi.mocked(evaluateAndSaveTrade);
const listTrades = vi.mocked(listSavedTrades);
const user = {
  id: "user-id" as never,
  providerAccountId: "provider-user",
  displayName: "Nathan",
  email: null
};

describe("private trade evaluations route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("requires authorization before listing saved evaluations", async () => {
    authorize.mockRejectedValue(new AuthenticationRequiredError());

    const response = await GET();

    expect(response.status).toBe(401);
    expect(listTrades).not.toHaveBeenCalled();
  });

  it("lists only through the authorized repository context", async () => {
    authorize.mockResolvedValue(user);
    listTrades.mockResolvedValue([]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(listTrades).toHaveBeenCalledWith(user);
  });

  it("re-evaluates and saves normalized input server-side", async () => {
    authorize.mockResolvedValue(user);
    saveTrade.mockResolvedValue({
      id: "trade-1",
      status: "evaluated",
      leagueConfigurationId: null,
      sideA: {},
      sideB: {},
      result: {},
      createdAt: new Date("2026-07-28T12:00:00Z"),
      updatedAt: new Date("2026-07-28T12:00:00Z")
    });
    const body = { trade: { sideA: {}, sideB: {} } };

    const response = await POST(
      new Request("http://localhost/api/private/trades", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      })
    );

    expect(response.status).toBe(201);
    expect(saveTrade).toHaveBeenCalledWith(user, body);
  });
});
