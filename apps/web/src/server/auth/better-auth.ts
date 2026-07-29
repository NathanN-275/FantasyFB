import "server-only";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import {
  authSessions,
  authorizedUserIdentities,
  createDatabase,
  findProviderAccountId,
  userAccounts
} from "@fantasyfb/database";
import {
  isAuthorizedGitHubUser,
  parseGitHubUserIdAllowlist,
  type AuthenticationState,
  type AuthProvider,
  type AuthorizedUser
} from "@fantasyfb/authentication";
import { betterAuth } from "better-auth";
import { headers } from "next/headers";
import {
  publicEnvironment,
  requireAuthenticationEnvironment,
  requireDatabaseEnvironment
} from "../env";

const githubProvider = "github";

interface SessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
}

interface BetterAuthDependencies {
  getSession(): Promise<{ user: SessionUser } | null>;
  findGitHubAccountId(userId: string): Promise<string | null>;
  allowedGitHubUserIds: ReadonlySet<string>;
}

/**
 * Adapter between Better Auth's session API and the application's provider-neutral
 * authorization boundary. GitHub account IDs, rather than mutable profile fields,
 * determine private-workspace access.
 */
export class BetterAuthProvider implements AuthProvider {
  constructor(private readonly dependencies: BetterAuthDependencies) {}

  async getAuthenticationState(): Promise<AuthenticationState> {
    const session = await this.dependencies.getSession();
    if (!session) return { status: "signed-out" };

    const providerAccountId = await this.dependencies.findGitHubAccountId(session.user.id);
    if (
      providerAccountId === null ||
      !isAuthorizedGitHubUser(providerAccountId, this.dependencies.allowedGitHubUserIds)
    ) {
      return { status: "unauthorized", providerAccountId };
    }

    return {
      status: "authorized",
      user: {
        id: session.user.id as AuthorizedUser["id"],
        providerAccountId,
        displayName: session.user.name ?? null,
        email: session.user.email ?? null
      }
    };
  }

  async getAuthorizedUser(): Promise<AuthorizedUser | null> {
    const state = await this.getAuthenticationState();
    return state.status === "authorized" ? state.user : null;
  }
}

function createBetterAuth() {
  const authenticationEnvironment = requireAuthenticationEnvironment();
  const databaseEnvironment = requireDatabaseEnvironment();
  const database = createDatabase(databaseEnvironment.DATABASE_URL);

  return betterAuth({
    baseURL: publicEnvironment.NEXT_PUBLIC_APP_URL,
    secret: authenticationEnvironment.AUTH_SECRET,
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: {
        user: userAccounts,
        account: authorizedUserIdentities,
        session: authSessions
      }
    }),
    socialProviders: {
      github: {
        clientId: authenticationEnvironment.AUTH_GITHUB_ID,
        clientSecret: authenticationEnvironment.AUTH_GITHUB_SECRET
      }
    },
    user: {
      fields: {
        name: "displayName"
      }
    },
    account: {
      fields: {
        accountId: "providerAccountId",
        providerId: "provider"
      }
    },
    advanced: {
      database: {
        generateId: "uuid"
      }
    }
  });
}

type BetterAuthInstance = ReturnType<typeof createBetterAuth>;
let authInstance: BetterAuthInstance | undefined;

export function getBetterAuth(): BetterAuthInstance {
  authInstance ??= createBetterAuth();
  return authInstance;
}

let authProvider: AuthProvider | undefined;

export function getAuthProvider(): AuthProvider {
  if (authProvider) return authProvider;

  const authenticationEnvironment = requireAuthenticationEnvironment();
  const databaseEnvironment = requireDatabaseEnvironment();
  const database = createDatabase(databaseEnvironment.DATABASE_URL);
  const auth = getBetterAuth();

  authProvider = new BetterAuthProvider({
    getSession: async () => {
      const session = await auth.api.getSession({ headers: await headers() });
      return session ? { user: session.user } : null;
    },
    findGitHubAccountId: (userId) => findProviderAccountId(database, userId, githubProvider),
    allowedGitHubUserIds: parseGitHubUserIdAllowlist(
      authenticationEnvironment.AUTHORIZED_GITHUB_USER_IDS
    )
  });

  return authProvider;
}
