# Release-candidate checklist

Record the commit SHA, Vercel deployment URL, Neon branch, migration journal version, operator, and
timestamp with each completed run.

## Automated validation

- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm format:check`
- [ ] `pnpm lint`
- [ ] `pnpm boundaries`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm test:python`
- [ ] `pnpm db:migrations:check`
- [ ] `pnpm build`
- [ ] `pnpm test:e2e` (desktop and mobile Chromium)
- [ ] GitHub dependency review passes
- [ ] Gitleaks scans complete Git history

## Preview/production environment

- [ ] Production and Preview use separate Vercel variable sets
- [ ] `DATABASE_URL` is pooled, server-only, and environment-specific
- [ ] `DATABASE_DIRECT_URL` is direct, server-only, and used only for operations
- [ ] GitHub OAuth callbacks match the exact environment URLs
- [ ] Immutable GitHub IDs form the allowlist
- [ ] No optional provider is enabled without documented permission and credentials
- [ ] Neon restore window, protected production branch, roles, and region are recorded
- [ ] Migrations apply successfully to a clean/sanitized preview branch
- [ ] `/api/health` returns `ok` with no-store and correlation headers
- [ ] Private Data Health reports Neon connectivity and expected dataset versions

## Privacy and authorization

- [ ] Public demo works signed out and labels every sample/fixture
- [ ] Signed-out private page redirects to sign-in
- [ ] Signed-out private APIs return 401
- [ ] Unauthorized GitHub account is rejected
- [ ] Authorized account can access private features
- [ ] Public response-boundary tests contain no private markers
- [ ] Private operations derive the owner from the server session, not browser input
- [ ] OAuth tokens, cookies, database URLs, provider tokens, private imports, and full league payloads
      are absent from logs

## Data and draft recovery

- [ ] Historical, ADP, news, and projection schedules use explicit validated inputs
- [ ] A simulated provider failure preserves the latest valid dataset
- [ ] Model-run logs contain dataset/model/feature versions and counts
- [ ] Draft event replay tests are deterministic
- [ ] An in-progress draft is usable in the mobile Chromium project
- [ ] Manual draft entry remains available when provider synchronization is interrupted
- [ ] Database restore is tested on a separate Neon branch
- [ ] Credential-rotation owners and provider-disable steps are known

## Honest capability labels

- [ ] Expert Rank remains hidden when no authorized expert source exists
- [ ] ECR is never shown without authorized aggregated expert rankings
- [ ] ESPN automation remains unofficial, experimental, disabled, and not distributed
- [ ] Missing provider data is unavailable/stale, never fabricated
- [ ] Production launch notes list every skipped external verification
