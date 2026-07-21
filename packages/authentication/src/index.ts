import type { UserId } from "@fantasyfb/contracts";

export interface AuthorizedUser {
  id: UserId;
  providerAccountId: string;
  displayName: string | null;
  email: string | null;
}

export type AuthenticationState =
  | { status: "signed-out" }
  | { status: "unauthorized"; providerAccountId: string | null }
  | { status: "authorized"; user: AuthorizedUser };

/** Replaceable authentication boundary implemented by the selected OAuth/session adapter. */
export interface AuthProvider {
  getAuthenticationState(): Promise<AuthenticationState>;
  getAuthorizedUser(): Promise<AuthorizedUser | null>;
}

export function parseGitHubUserIdAllowlist(value: string): ReadonlySet<string> {
  return new Set(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
}

export function isAuthorizedGitHubUser(
  providerAccountId: string | null,
  allowedGitHubUserIds: ReadonlySet<string>
): boolean {
  return providerAccountId !== null && allowedGitHubUserIds.has(providerAccountId);
}
