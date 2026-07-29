# Use Vercel for web deployment

FantasyFB uses Vercel for the Next.js application because it provides a straightforward deployment path for the public demo and private workspace while keeping deployment details outside the domain modules.

The repository root is the Vercel project root so pnpm workspace packages are available during the
build. Pull requests create Preview Deployments and `main` creates Production Deployments. Each
environment has independent server-only credentials and database branches. Database migrations are an
explicit pre-deploy operation rather than a build side effect.

Security headers are owned by the Next.js configuration so Preview and Production behave consistently.
See [production deployment](../operations/deployment.md).
