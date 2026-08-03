# Fixtures

Only synthetic or legally reusable, clearly labeled public sample fixtures belong here. Never add private league data, private imports, licensed ranking files, or secrets.

The web demo loads fixture metadata only through `apps/web/src/fixtures/public-demo.ts`. That
loader validates the fixture contract and requires `visibility: "sample"` plus
`synthetic: true`. Run `pnpm fixtures:validate` before publishing fixture changes.

Database fixtures use the separate `pnpm db:seed` process and write only sample-visible dataset
versions. Neither process accepts an authenticated user ID or writes production user records.
