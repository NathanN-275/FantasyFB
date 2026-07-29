# Permitted news feeds

## Enablement status

No third-party news source is enabled in the repository. Production aggregation is configuration
driven and remains disabled until a source review records the legal or contractual basis for the
intended use.

## Required source review

Before adding a source to `NEWS_SOURCES_JSON`, record:

- source owner, product name, feed/API URL, and stable identifier
- `authorized-api`, `licensed-feed`, or `terms-permit-use` basis
- the exact terms, agreement, or written authorization reviewed and its review date
- whether headline, article URL, publication time, source attribution, and an excerpt may be stored
- whether only a supplied summary or other feed content may be used as the excerpt
- maximum excerpt length, attribution wording, retention limits, and required link behavior
- authentication method, request limits, refresh cadence, and stale threshold
- a named reviewer and re-review date

The pipeline fetches declared feed responses only. It does not fetch or scrape linked article
bodies. Full articles are never persisted or republished.

## Supported boundary

Version one accepts JSON Feed-shaped HTTPS responses. This narrow boundary keeps unreviewed HTML and
provider response details outside the domain. A provider-specific API adapter may be added only
after its source review; it must emit the same validated feed boundary.

Public demo records are synthetic fixtures with non-routable example URLs. They demonstrate the
interface and must not be represented as current NFL reporting.
