import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthenticationRequiredError,
  authorizePrivateAccess
} from "../../../../server/auth/private-access";
import { stagePrivateExpertImport } from "../../../../server/expert-data";
import { POST } from "./route";

vi.mock("../../../../server/auth/private-access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../server/auth/private-access")>();
  return { ...actual, authorizePrivateAccess: vi.fn() };
});

vi.mock("../../../../server/expert-data", () => ({
  stagePrivateExpertImport: vi.fn()
}));

const authorize = vi.mocked(authorizePrivateAccess);
const stage = vi.mocked(stagePrivateExpertImport);

describe("private expert import route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects unauthenticated uploads before processing the file", async () => {
    authorize.mockRejectedValue(new AuthenticationRequiredError());
    const response = await POST(new Request("http://localhost/api/private/expert-imports"));
    expect(response.status).toBe(401);
    expect(stage).not.toHaveBeenCalled();
  });

  it("accepts an authorized CSV and returns a required confirmation preview", async () => {
    authorize.mockResolvedValue({
      id: "user-id" as never,
      providerAccountId: "12345",
      displayName: null,
      email: null
    });
    stage.mockResolvedValue({
      id: "import-id",
      fileName: "experts.csv",
      status: "awaiting_confirmation",
      seasonYear: 2026,
      providerName: "licensed-export",
      importKind: "ranking",
      totalRows: 1,
      matchedRows: 1,
      ambiguousRows: 0,
      missingRows: 0,
      invalidRows: 0,
      rows: []
    });
    const form = new FormData();
    form.set(
      "file",
      new File(["player_name,rank\nPlayer One,1"], "experts.csv", { type: "text/csv" })
    );
    form.set("seasonYear", "2026");
    form.set("providerName", "licensed-export");
    form.set(
      "profile",
      JSON.stringify({
        kind: "ranking",
        columns: { fullName: "player_name", overallRank: "rank" }
      })
    );
    const response = await POST(
      new Request("http://localhost/api/private/expert-imports", { method: "POST", body: form })
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      preview: { id: "import-id", status: "awaiting_confirmation" }
    });
    expect(stage).toHaveBeenCalledWith(
      expect.objectContaining({
        seasonYear: 2026,
        providerName: "licensed-export",
        preserveOriginal: false
      })
    );
  });
});
