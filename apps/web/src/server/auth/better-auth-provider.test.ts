import { describe, expect, it } from "vitest";
import { BetterAuthProvider } from "./better-auth";

describe("Better Auth provider authorization", () => {
  it("permits an authenticated GitHub account whose immutable ID is allowlisted", async () => {
    const provider = new BetterAuthProvider({
      getSession: async () => ({ user: { id: "user-id", name: "Nathan", email: "nathan@example.com" } }),
      findGitHubAccountId: async () => "12345",
      allowedGitHubUserIds: new Set(["12345"])
    });

    await expect(provider.getAuthenticationState()).resolves.toMatchObject({
      status: "authorized",
      user: { id: "user-id", providerAccountId: "12345" }
    });
  });

  it("rejects an authenticated GitHub account outside the allowlist", async () => {
    const provider = new BetterAuthProvider({
      getSession: async () => ({ user: { id: "user-id" } }),
      findGitHubAccountId: async () => "99999",
      allowedGitHubUserIds: new Set(["12345"])
    });

    await expect(provider.getAuthenticationState()).resolves.toEqual({
      status: "unauthorized",
      providerAccountId: "99999"
    });
  });

  it("treats an expired or absent session as signed out", async () => {
    const provider = new BetterAuthProvider({
      getSession: async () => null,
      findGitHubAccountId: async () => "12345",
      allowedGitHubUserIds: new Set(["12345"])
    });

    await expect(provider.getAuthenticationState()).resolves.toEqual({ status: "signed-out" });
  });
});
