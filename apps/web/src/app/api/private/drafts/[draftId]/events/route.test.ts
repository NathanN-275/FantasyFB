import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthenticationRequiredError,
  authorizePrivateAccess
} from "../../../../../../server/auth/private-access";
import { appendDraftEvent, readDraftState } from "../../../../../../server/draft-room";
import { GET, POST } from "./route";

vi.mock("../../../../../../server/auth/private-access", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../../../../server/auth/private-access")>();
  return { ...actual, authorizePrivateAccess: vi.fn() };
});

vi.mock("../../../../../../server/draft-room", () => ({
  appendDraftEvent: vi.fn(),
  readDraftState: vi.fn()
}));

const authorize = vi.mocked(authorizePrivateAccess);
const readState = vi.mocked(readDraftState);
const appendEvent = vi.mocked(appendDraftEvent);
const user = {
  id: "user-id" as never,
  providerAccountId: "provider-user",
  displayName: "Nathan",
  email: null
};
const context = { params: Promise.resolve({ draftId: "draft-1" }) };

describe("private draft event route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("requires authorization before reading history", async () => {
    authorize.mockRejectedValue(new AuthenticationRequiredError());

    const response = await GET(new Request("http://localhost"), context);

    expect(response.status).toBe(401);
    expect(readState).not.toHaveBeenCalled();
  });

  it("reads reduced state for an authorized draft", async () => {
    authorize.mockResolvedValue(user);
    readState.mockResolvedValue({
      draftId: "draft-1",
      status: "scheduled",
      picks: [],
      recentPicks: [],
      rosters: [],
      draftedPlayerIds: [],
      unresolvedPlayerExternalIds: [],
      eventCount: 0,
      lastSequence: 0,
      warnings: []
    });

    const response = await GET(new Request("http://localhost"), context);

    expect(response.status).toBe(200);
    expect(readState).toHaveBeenCalledWith(user, "draft-1");
  });

  it("forces the route draft identity when appending a manual event", async () => {
    authorize.mockResolvedValue(user);
    appendEvent.mockResolvedValue({
      event: {} as never,
      state: {} as never
    });
    const input = { eventId: "event-1", draftId: "wrong-draft", eventType: "draft_paused" };

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      }),
      context
    );

    expect(response.status).toBe(201);
    expect(appendEvent).toHaveBeenCalledWith(user, "draft-1", input);
  });
});
