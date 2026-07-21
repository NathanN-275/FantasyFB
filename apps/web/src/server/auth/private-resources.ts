import "server-only";
import type { AuthProvider } from "@fantasyfb/authentication";
import { getAuthProvider } from "./better-auth";
import { authorizePrivateAccess } from "./private-access";

/** Shared protected operation used by the workspace server action. */
export async function readPrivateWorkspaceIdentity(provider: AuthProvider = getAuthProvider()) {
  const user = await authorizePrivateAccess(provider);
  return { id: user.id, providerAccountId: user.providerAccountId };
}

/** Shared protected operation used by the private account API handler. */
export async function readPrivateAccount(provider: AuthProvider = getAuthProvider()) {
  const user = await authorizePrivateAccess(provider);
  return {
    providerAccountId: user.providerAccountId,
    displayName: user.displayName,
    email: user.email
  };
}
