# Production deployment

## Release shape

FantasyFB deploys one Next.js application from the repository root. Vercel runs the root
`pnpm build` command and serves `apps/web/.next`. The `main` branch is production; pull requests and
non-production branches are previews. Public routes remain signed-out safe, while `/workspace` and
every `/api/private/*` handler independently enforce GitHub authorization.

Vercel deployment does not apply database migrations. Migrations are an explicit release step so a
failed schema change cannot be hidden inside an application build.

## Vercel project setup

1. Import the GitHub repository and keep the Vercel Root Directory at the repository root.
2. Confirm Framework Preset is Next.js. `vercel.json` supplies install, build, and output settings.
3. Set the production branch to `main`.
4. Keep automatic Preview Deployments enabled for pull requests.
5. Add the production domain and update the GitHub OAuth callback to:
   `https://<production-domain>/api/auth/callback/github`.
6. Set `NEXT_PUBLIC_APP_URL` independently in Production and Preview. A preview OAuth application or
   branch-specific callback is recommended; never point a preview at the production OAuth callback.
7. After changing an environment variable, create a new deployment. Existing deployments do not
   receive the update.

### Environment matrix

| Variable                     | Development | Preview                                  | Production                  | Browser safe |
| ---------------------------- | ----------- | ---------------------------------------- | --------------------------- | ------------ |
| `NEXT_PUBLIC_APP_URL`        | Local URL   | Preview or branch-specific URL           | Production URL              | Yes          |
| `DATABASE_URL`               | Dev pooler  | Preview Neon branch pooled URL           | Production pooled URL       | No           |
| `DATABASE_DIRECT_URL`        | Dev direct  | Preview branch direct URL for migrations | Production direct admin URL | No           |
| `AUTH_SECRET`                | Dev value   | Preview-only value                       | Production-only value       | No           |
| `AUTH_GITHUB_ID/SECRET`      | Dev app     | Preview OAuth app                        | Production OAuth app        | No           |
| `AUTHORIZED_GITHUB_USER_IDS` | Test IDs    | Explicit preview allowlist               | Immutable production IDs    | No           |
| Expert/news provider values  | Optional    | Disabled unless reviewed                 | Explicitly configured only  | No           |

Only `NEXT_PUBLIC_APP_URL` may use the `NEXT_PUBLIC_` prefix. Never add a public alias for a database
URL, provider token, OAuth value, or allowlist.

Official references: [Vercel environments](https://vercel.com/docs/deployments/environments) and
[environment variables](https://vercel.com/docs/environment-variables).

## Neon production and preview strategy

Use one protected production branch and one isolated preview branch initially. The preview branch may
contain synthetic/test data only. It must never be a child copy containing production private data.
If the project later automates per-pull-request branches, create them from a sanitized development
branch, apply migrations, run browser tests, and expire them after the pull request closes.

- Runtime server functions use the pooled `DATABASE_URL` (`-pooler` endpoint).
- Migrations, `pg_dump`, and restore validation use direct `DATABASE_DIRECT_URL`.
- Production, preview, and local development must use different roles and credentials.
- Place the Neon project and Vercel functions in compatible regions before launch; record the chosen
  region in the release checklist.
- Set a restore window appropriate for the private workspace and test restoration before launch.

Neon documents that pooled connections use transaction-mode PgBouncer and recommends a direct
connection for migrations and `pg_dump`: [connection pooling](https://neon.com/docs/connect/connection-pooling).

### Least-privilege roles

Create credentials in Neon rather than committing passwords. Use a runtime role for the application
and a separate migration role for release operations. Adapt the schema name if it is not `public`.

```sql
-- Run as the Neon project owner after reviewing the target database.
create role fantasyfb_runtime login;
create role fantasyfb_migrator login;

grant connect on database neondb to fantasyfb_runtime, fantasyfb_migrator;
grant usage on schema public to fantasyfb_runtime;
grant select, insert, update, delete on all tables in schema public to fantasyfb_runtime;
grant usage, select on all sequences in schema public to fantasyfb_runtime;

grant usage, create on schema public to fantasyfb_migrator;
grant all privileges on all tables in schema public to fantasyfb_migrator;
grant all privileges on all sequences in schema public to fantasyfb_migrator;

alter default privileges for role fantasyfb_migrator in schema public
  grant select, insert, update, delete on tables to fantasyfb_runtime;
alter default privileges for role fantasyfb_migrator in schema public
  grant usage, select on sequences to fantasyfb_runtime;
```

Do not grant the runtime role role-management, database-creation, replication, or ownership privileges.
Because Drizzle migrations may alter existing objects, validate the migration role against a fresh
preview branch before using it in production.

## Migration and release workflow

1. Require green pull-request checks: formatting, boundaries, lint, types, TypeScript/Python tests,
   desktop/mobile Playwright, production build, migration metadata, dependency review, and secret scan.
   Set `ENABLE_CI_DATABASE_TESTS=true` and `CI_DATABASE_URL` to run migrations against an explicitly
   disposable CI Neon branch; never point that secret at Preview or Production.
2. Create or reset a sanitized preview Neon branch.
3. Set preview `DATABASE_DIRECT_URL`, then run:

   ```bash
   pnpm db:migrations:check
   pnpm db:migrate
   pnpm db:validate
   ```

4. Deploy the preview and complete `docs/operations/release-checklist.md`.
5. Confirm Neon restore coverage and create an additional logical backup when the change risk warrants
   it.
6. Apply migrations to production with production `DATABASE_DIRECT_URL`.
7. Deploy the exact reviewed commit to production.
8. Verify `/api/health`, signed-out public pages, authorization behavior, and the private Data Health
   page.
9. Retain the previous deployment for immediate application rollback. Do not reverse a database
   migration unless its explicit down/recovery plan has been tested.

## Scheduled jobs

GitHub Actions owns the heavy schedules:

- Historical statistics: weekly.
- ADP: daily, using the explicit `ADP_CONTEXTS_JSON` repository variable.
- News: hourly, only for reviewed feeds in secret-backed configuration.
- Projections: weekly, using explicit dataset-version and scoring-configuration repository variables.

All jobs preserve the last committed valid dataset when a provider or validation step fails. Job
configuration is deliberately explicit: a missing ADP context, projection dataset version, or scoring
configuration fails the job instead of selecting a hidden default.
