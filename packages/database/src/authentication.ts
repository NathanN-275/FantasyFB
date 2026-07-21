import { and, eq } from "drizzle-orm";
import { authorizedUserIdentities } from "./schema.js";
import type { Database } from "./types.js";

/**
 * Returns the immutable external account ID associated with an authenticated internal user.
 * The value is intentionally kept separate from email, display name, and provider username.
 */
export async function findProviderAccountId(
  database: Database,
  userId: string,
  provider: string
): Promise<string | null> {
  const [identity] = await database
    .select({ providerAccountId: authorizedUserIdentities.providerAccountId })
    .from(authorizedUserIdentities)
    .where(
      and(
        eq(authorizedUserIdentities.userId, userId),
        eq(authorizedUserIdentities.provider, provider)
      )
    )
    .limit(1);

  return identity?.providerAccountId ?? null;
}
