import type { AuthorizedUser } from "@fantasyfb/authentication";
import type {
  PrivateWorkspaceOverviewRecord,
  WorkspacePreferencesRecord,
  WorkspaceRepository
} from "@fantasyfb/contracts";
import { describe, expect, it, vi } from "vitest";
import { getPrivateWorkspaceOverview, savePrivateWorkspacePreferences } from "./private-workspace";

const user = {
  id: "authenticated-user-id",
  providerAccountId: "github-account-id",
  displayName: "Nathan",
  email: "nathan@example.com"
} as AuthorizedUser;

const preferences: WorkspacePreferencesRecord = {
  defaultScoringFormat: "ppr",
  timezone: "America/New_York",
  compactRankings: false,
  updatedAt: new Date("2026-07-29T00:00:00Z")
};

const overview: PrivateWorkspaceOverviewRecord = {
  leagues: [],
  scoringProfiles: [],
  expertImports: [],
  rankings: [],
  drafts: [],
  tradeEvaluations: [],
  dataRefreshes: [],
  preferences
};

describe("private workspace service", () => {
  it("derives overview ownership from the authenticated user", async () => {
    const getOverview = vi.fn(async () => overview);
    const repository = {
      getOverview,
      updatePreferences: vi.fn()
    } as unknown as WorkspaceRepository;

    await expect(getPrivateWorkspaceOverview(user, repository)).resolves.toBe(overview);
    expect(getOverview).toHaveBeenCalledWith({ userId: "authenticated-user-id" });
  });

  it("does not accept a browser-submitted owner identifier when saving preferences", async () => {
    const updatePreferences = vi.fn(async () => preferences);
    const repository = {
      getOverview: vi.fn(),
      updatePreferences
    } as unknown as WorkspaceRepository;
    const input = {
      defaultScoringFormat: "half-ppr" as const,
      timezone: "America/Chicago",
      compactRankings: true
    };

    await expect(savePrivateWorkspacePreferences(user, input, repository)).resolves.toBe(
      preferences
    );
    expect(updatePreferences).toHaveBeenCalledWith({ userId: "authenticated-user-id" }, input);
  });
});
