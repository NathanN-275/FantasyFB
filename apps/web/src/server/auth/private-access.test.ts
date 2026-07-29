import { describe, expect, it } from "vitest";
import type { AuthProvider } from "@fantasyfb/authentication";
import {
  AuthenticationRequiredError,
  AuthorizationDeniedError,
  authorizePrivateAccess
} from "./private-access";

function providerFor(
  state: Awaited<ReturnType<AuthProvider["getAuthenticationState"]>>
): AuthProvider {
  return {
    getAuthenticationState: async () => state,
    getAuthorizedUser: async () => (state.status === "authorized" ? state.user : null)
  };
}

describe("private access enforcement", () => {
  it("rejects signed-out private requests", async () => {
    await expect(
      authorizePrivateAccess(providerFor({ status: "signed-out" }))
    ).rejects.toBeInstanceOf(AuthenticationRequiredError);
  });

  it("rejects authenticated but unauthorized private requests", async () => {
    await expect(
      authorizePrivateAccess(providerFor({ status: "unauthorized", providerAccountId: "99999" }))
    ).rejects.toBeInstanceOf(AuthorizationDeniedError);
  });

  it("permits authorized private requests", async () => {
    await expect(
      authorizePrivateAccess(
        providerFor({
          status: "authorized",
          user: {
            id: "user-id" as never,
            providerAccountId: "12345",
            displayName: null,
            email: null
          }
        })
      )
    ).resolves.toMatchObject({ providerAccountId: "12345" });
  });
});
