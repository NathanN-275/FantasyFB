# Treat the ESPN browser companion as experimental and separate

Status: Accepted for architecture; live observation remains unimplemented.

## Decision

An optional browser companion may later observe an ESPN draft page the user already opened and
emit normalized draft-pick events. It remains disabled by default, cannot perform draft actions,
and will not collect credentials, cookies, browsing history, or unrelated page content.

ESPN selector and DOM-observer logic may exist only in `apps/espn-companion`. The private API must
authenticate a short-lived, user- and draft-scoped pairing before accepting strict versioned
messages. Accepted messages enter the same `DraftEventSource`/`NewDraftEvent` boundary used by
Sleeper, manual entry, and fixtures. `DraftRoom` contains contract validation but no ESPN DOM logic.

Unrecognized page structure, incompatible versions, uncertain player matches, disable state, and
authorization failures all fail closed and preserve manual draft mode. An ambiguous player requires
explicit user confirmation.

## Consequences

- Browser permissions and transmitted fields remain narrowly reviewable.
- Draft replay and idempotency do not gain ESPN-specific behavior.
- ESPN markup changes may interrupt the companion; this is preferable to silently recording a
  wrong pick.
- Pairing endpoints, live observation, browser UI, packaging, and distribution require a separate
  approved implementation and security review.

See the [architecture](../architecture/espn-companion.md) and
[threat model](../security/espn-companion-threat-model.md).
