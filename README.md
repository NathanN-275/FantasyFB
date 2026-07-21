# FantasyFB

FantasyFB is a personal-first fantasy football analysis platform for the 2026 NFL season. It separates a public portfolio demo (using clearly labeled sample data) from an authenticated private workspace for league settings, imports, draft history, and preferences.

## Workspace

- `apps/web` — Next.js public demo and private workspace
- `apps/espn-companion` — documented placeholder for an optional, experimental browser companion
- `modules` — provider-independent football domain modules
- `packages` — shared contracts and infrastructure adapters
- `pipelines` — Python data and modeling pipelines

## Local setup

```bash
corepack enable
pnpm install
cp .env.example apps/web/.env.local
pnpm dev
```

`DATABASE_URL`, `AUTH_SECRET`, and GitHub OAuth settings are validated when their corresponding server-side capabilities are used. The public demo starts without optional provider credentials.

## Validation

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:python
pnpm build
pnpm db:validate
```

See [architecture documentation](./docs/architecture/overview.md) for boundaries and [decisions](./docs/decisions) for the foundational trade-offs.
