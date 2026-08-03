# ESPN companion architecture boundary

This workspace reserves the boundary for an optional, experimental browser companion. It contains
no page observation, credential collection, cookie access, automated draft actions, installable
manifest, or distributed extension.

Prompt 18 defines only the reviewed boundary:

- [Architecture](../../docs/architecture/espn-companion.md)
- [Threat model](../../docs/security/espn-companion-threat-model.md)
- [Synthetic fixtures](../../fixtures/espn-companion)
- Strict pick and status contracts in `@fantasyfb/draft-room`

Live selectors, DOM observation, secure pairing endpoints, and browser UI remain behind the
implementation gate in the architecture document. Manual draft entry remains the fallback.
