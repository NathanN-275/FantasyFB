import "server-only";
import type { AuthProvider, AuthorizedUser } from "@fantasyfb/authentication";
import { redirect } from "next/navigation";
import { getAuthProvider } from "./better-auth";

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Authentication is required for this private resource.");
  }
}

export class AuthorizationDeniedError extends Error {
  constructor() {
    super("This GitHub account is not authorized for the private workspace.");
  }
}

export async function authorizePrivateAccess(
  provider: AuthProvider = getAuthProvider()
): Promise<AuthorizedUser> {
  const state = await provider.getAuthenticationState();
  if (state.status === "signed-out") throw new AuthenticationRequiredError();
  if (state.status === "unauthorized") throw new AuthorizationDeniedError();
  return state.user;
}

export async function requireAuthorizedUser(
  provider: AuthProvider = getAuthProvider()
): Promise<AuthorizedUser> {
  try {
    return await authorizePrivateAccess(provider);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) redirect("/sign-in");
    if (error instanceof AuthorizationDeniedError) redirect("/unauthorized");
    throw error;
  }
}
