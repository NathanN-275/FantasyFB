# News pipeline

The scheduled TypeScript pipeline retrieves only explicitly reviewed JSON Feed sources, normalizes
them through `@fantasyfb/news-intelligence`, and persists attributable records through
`NewsRepository`.

No external source is enabled by default. Configure `NEWS_SOURCES_JSON` only after documenting the
source's reuse terms in `docs/data-sources/news-feeds.md`. Each source must declare:

- `usagePermission`: `authorized-api`, `licensed-feed`, or `terms-permit-use`
- a human-readable `usageNote`
- an `excerptPolicy`: `none`, `summary-only`, or `feed-content-permitted`
- excerpt and freshness limits
- an HTTPS JSON Feed URL

Optional bearer tokens live separately in `NEWS_SOURCE_TOKENS_JSON`, keyed by a source's
`bearerTokenKey`; token values must never be placed in source configuration or committed.

Run locally with:

```bash
pnpm news:ingest
```

GitHub Actions runs the same command hourly. Provider failures do not replace the last valid
snapshot. A report identifies updated, preserved, unavailable, stale, malformed, and undated data.
