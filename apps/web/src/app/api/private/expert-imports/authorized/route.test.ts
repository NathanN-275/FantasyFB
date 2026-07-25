import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthenticationRequiredError,
  authorizePrivateAccess
} from "../../../../../server/auth/private-access";
import { stageAuthorizedExpertImport } from "../../../../../server/expert-data";
import { POST } from "./route";

vi.mock("../../../../../server/auth/private-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../../server/auth/private-access")>();
  return { ...actual, authorizePrivateAccess: vi.fn() };
});

vi.mock("../../../../../server/expert-data", () => ({
  stageAuthorizedExpertImport: vi.fn()
}));

const authorize = vi.mocked(authorizePrivateAccess);
const stage = vi.mocked(stageAuthorizedExpertImport);

describe("authorized expert API import route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("requires private workspace authentication", async () => {
    authorize.mockRejectedValue(new AuthenticationRequiredError());
    const response = await POST(
      new Request("http://localhost/api/private/expert-imports/authorized", {
        method: "POST",
        body: JSON.stringify({ seasonYear: 2026 })
      })
    );
    expect(response.status).toBe(401);
    expect(stage).not.toHaveBeenCalled();
  });

  it("stages validated API data for explicit confirmation", async () => {
    const user = {
      id: "user-id" as never,
      providerAccountId: "12345",
      displayName: null,
      email: null
    };
    authorize.mockResolvedValue(user);
    stage.mockResolvedValue({
      id: "import-id",
      fileName: "provider-2026.json",
      status: "awaiting_confirmation",
      seasonYear: 2026,
      providerName: "provider",
      importKind: "combined",
      totalRows: 1,
      matchedRows: 1,
      ambiguousRows: 0,
      missingRows: 0,
      invalidRows: 0,
      rows: []
    });
    const response = await POST(
      new Request("http://localhost/api/private/expert-imports/authorized", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seasonYear: 2026 })
      })
    );
    expect(response.status).toBe(201);
    expect(stage).toHaveBeenCalledWith({ user, seasonYear: 2026 });
  });
});
