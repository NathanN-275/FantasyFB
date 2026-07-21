import { describe, expect, it } from "vitest";
import { isAuthorizedGitHubUser, parseGitHubUserIdAllowlist } from "./index.js";

describe("GitHub account authorization", () => {
  it("accepts only immutable provider account IDs listed in configuration", () => {
    const allowlist = parseGitHubUserIdAllowlist("12345, 67890");

    expect(isAuthorizedGitHubUser("12345", allowlist)).toBe(true);
    expect(isAuthorizedGitHubUser("octocat", allowlist)).toBe(false);
    expect(isAuthorizedGitHubUser(null, allowlist)).toBe(false);
  });
});
