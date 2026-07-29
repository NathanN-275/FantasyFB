import { describe, expect, it } from "vitest";
import type { AuthProvider } from "@fantasyfb/authentication";
import { AuthenticationRequiredError, AuthorizationDeniedError } from "./private-access";
import { readPrivateAccount, readPrivateWorkspaceIdentity } from "./private-resources";

function providerFor(
  state: Awaited<ReturnType<AuthProvider["getAuthenticationState"]>>
): AuthProvider {
  return {
    getAuthenticationState: async () => state,
    getAuthorizedUser: async () => (state.status === "authorized" ? state.user : null)
  };
}

describe("protected server resources", () => {
  it("rejects a signed-out server action", async () => {
    await expect(
      readPrivateWorkspaceIdentity(providerFor({ status: "signed-out" }))
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
  });

  it("rejects an unauthorized private API operation", async () => {
    await expect(
      readPrivateAccount(providerFor({ status: "unauthorized", providerAccountId: "99999" }))
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });

  it("returns account data only for an authorized caller", async () => {
    await expect(
      readPrivateAccount(
        providerFor({
          status: "authorized",
          user: {
            id: "user-id" as never,
            providerAccountId: "12345",
            displayName: "Nathan",
            email: "nathan@example.com"
          }
        })
      )
    ).resolves.toEqual({
      providerAccountId: "12345",
      displayName: "Nathan",
      email: "nathan@example.com"
    });
  });
});
