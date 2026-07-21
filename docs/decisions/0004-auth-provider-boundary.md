# Use Better Auth behind the AuthProvider boundary

## Decision

Use Better Auth with its Drizzle adapter, PostgreSQL-backed sessions, and GitHub OAuth for the initial private workspace. The web application exposes the integration only through the shared `AuthProvider` interface.

## Context

The private workspace needs a direct Next.js route handler, GitHub OAuth, Drizzle/PostgreSQL persistence, and server-side session validation. Access must be restricted to a configured set of immutable GitHub user IDs; email, display name, and GitHub username are deliberately not authorization inputs.

## Rationale

Better Auth provides a maintained Next.js handler and a first-party Drizzle adapter with database sessions. It fits the existing Neon/PostgreSQL and Drizzle foundation without putting provider APIs into product modules. The adapter maps its user and account records onto the existing `user_accounts` and `authorized_user_identities` ownership tables, while `auth_sessions` holds revocable server-side sessions.

## Consequences

- Every private page, server action, and private API handler resolves an `AuthProvider` state on the server.
- The provider retrieves the GitHub provider account ID and compares it to `AUTHORIZED_GITHUB_USER_IDS`; it never authorizes from mutable profile attributes.
- Better Auth tables and configuration are infrastructure details. Replacing the provider requires a new adapter, not changes to the private-workspace authorization contract.
- GitHub OAuth credentials, the session secret, database URL, and at least one authorized GitHub ID are required when a private route or auth handler is used.
