# ESPN companion threat model

## Overview

This threat model covers the proposed boundary from an already-open ESPN fantasy draft page to the
private FantasyFB draft event API. It covers architecture and message contracts only. Live
observation, extension packaging, publication, and distribution are out of scope and remain
unimplemented.

### Security objectives

- Never read, store, export, or transmit ESPN passwords or session cookies.
- Never collect browsing history, unrelated URLs, unrelated page content, or non-draft form data.
- Never click draft controls, submit a selection, or perform any ESPN transaction.
- Accept events only for the authenticated user's paired and owned FantasyFB draft.
- Stop rather than guess when the page or player match is uncertain.
- Keep manual draft mode available after every companion failure.
- Make replay, duplicates, corrections, disable state, and compatibility decisions deterministic
  and auditable without logging sensitive values.

## Threat Model, Trust Boundaries, and Assumptions

### Assets

| Asset                               | Required protection                                                  |
| ----------------------------------- | -------------------------------------------------------------------- |
| ESPN authenticated browser session  | Must remain inaccessible to companion code and FantasyFB             |
| FantasyFB account and private draft | Only the authenticated owner may pair or append                      |
| Pairing code and token              | Short-lived, scoped, confidential, replay resistant, revocable       |
| Draft event integrity               | Correct draft, stable order, explicit corrections, no silent guesses |
| Player and league privacy           | Only minimum pick fields cross the page boundary                     |
| Manual availability                 | Companion failure must not block manual drafting                     |

### Inputs, adversaries, and control

Attacker-controlled inputs are ESPN DOM values, page-script behavior, all companion HTTP request
fields, replayed messages, and untrusted version identifiers. Operator-controlled inputs are the
emergency-disable flag, supported-observer allowlist, pairing expiry, rate limits, and deployed
FantasyFB origin. Developer-controlled inputs are manifest permissions, selector/page-signature
definitions, contract schemas, dependencies, build artifacts, and release signing.

Relevant adversaries and entry points are:

- malicious or compromised page script running in the ESPN page's main world
- malformed or unexpectedly changed ESPN DOM
- another extension or local process attempting to imitate the companion
- unauthenticated or differently authenticated caller targeting the private API
- a replaying network client with an old message or pairing code
- accidental overreach introduced by a future selector, permission, logging, or transport change
- compromised companion release or dependency

### Trust-boundary assumptions

- The browser preserves extension isolated-world and service-worker boundaries as documented.
- TLS validation, the FantasyFB authentication provider, and server-side draft ownership checks work
  correctly; none removes the need to validate companion input.
- The ESPN DOM and page scripts are never trusted, even when delivered from the expected origin.
- A stable ESPN identifier improves matching but is still provider-controlled input.
- The user is trusted to opt in and make confirmation choices, but not to supply an authoritative
  FantasyFB user or draft owner ID from the browser.
- Manual draft entry does not depend on the companion and remains usable during any companion
  outage.

## Attack Surface, Mitigations, and Attacker Stories

Realistic attacker stories include a page script shaping draft-like DOM to forge a pick, a caller
replaying a pairing code or message, a signed-in user targeting a draft they do not own, a future
selector serializing too much page content, and a compromised release broadening permissions.

An attacker who has already fully compromised the user's browser profile or operating system is out
of scope because they can directly read browser sessions and modify the extension. ESPN account
takeover unrelated to FantasyFB and attacks that require FantasyFB server or signing-key compromise
are also outside this component boundary, though deployment controls must address them separately.

### Threats and controls

| Threat                                 | Control                                                                                                                              | Verification required before implementation |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| Credential or cookie theft             | No `cookies`, `webRequest`, password-field, cookie, header, or storage access; content script has no transport token                 | Static permission test and data-flow review |
| Browsing surveillance                  | No `tabs`, `history`, `<all_urls>`, or unrelated host access; exact origin/path runtime check                                        | Manifest snapshot and wrong-site tests      |
| Arbitrary page exfiltration            | Strict schemas reject unknown keys; content script emits allowlisted scalar fields; status uses fixed vocabulary                     | Schema tests with HTML and arbitrary text   |
| Page script forges picks               | Isolated content-script world, recognized page signature, local structural validation, stable IDs, server anomaly checks             | Synthetic hostile-DOM tests                 |
| Cross-user or cross-draft write        | Authenticated code creation, token bound to immutable user and owned draft, server-supplied expected draft, browser user IDs ignored | Authorization matrix tests                  |
| Pairing-code interception or replay    | Single use, short expiry, HTTPS exchange, rate limit, hashed server storage, invalidation after exchange                             | Expiry and replay tests                     |
| Pairing-token theft                    | Session-only extension storage, never sent to content script or logs, scoped capabilities, expiry and revocation                     | Storage and log assertions                  |
| Cross-site request or origin confusion | Explicit API allowlist, HTTPS, POST JSON, origin/content-type checks, no query token                                                 | Transport integration tests                 |
| Duplicate picks after retry            | Stable message ID, bounded client dedupe, server idempotency, database idempotency key                                               | Concurrent duplicate tests                  |
| Silent wrong player                    | Only provider-ID, unique exact-name, or explicit manual confirmation can normalize; fuzzy/ambiguous stays uncertain                  | Collision and missing-player fixtures       |
| ESPN DOM changes                       | Versioned observer, recognized page signature, fail closed, unsupported UI, observer detaches                                        | Unknown-signature tests                     |
| Automated draft action                 | No click, input, form-submit, scripting, or transaction command exists in the contract                                               | Static API/permission scan                  |
| Emergency response failure             | Local disable detaches immediately; remote flag blocks pairing and ingestion; token revocation                                       | Kill-switch tests                           |
| Sensitive logs                         | Structured fixed fields, hashed identifiers, no tokens/cookies/HTML/full payloads                                                    | Logging allowlist test                      |
| Compromised update                     | No automatic distribution in this phase; future builds require pinned dependencies, review, signing, and explicit user install       | Release-process review                      |
| Resource exhaustion                    | Body-size limits, schema bounds, rate limits, bounded candidate and dedupe collections                                               | Oversize and rate-limit tests               |

### Boundary enforcement details

### ESPN page to content script

All DOM values are hostile input. The future observer may read only the recognized draft board
subtree. It must not run code supplied by the page, trust hidden fields, traverse password inputs,
or serialize nodes. A missing or duplicated coordinate invalidates the observation.

### Content script to service worker

Messages must use an internal allowlist distinct from the public wire contract. The worker validates
again, attaches its own known companion/observer version, and rejects messages from unpaired tabs
or frames. The content script never receives the pairing token.

### Service worker to private API

TLS protects transit. The short-lived pairing token is necessary but insufficient: the API also
enforces enabled state, contract compatibility, request size, rate limit, draft scope, ownership,
and idempotency. The token selects the server-side user/draft context; request fields never select a
different user.

### Private API to DraftRoom

The adapter calls `evaluateEspnCompanionPickMessage` with the token-bound expected draft and current
compatibility policy. Only `accepted` results reach the same `NewDraftEvent` append path used by
other sources. Confirmation-required, duplicate, disabled, malformed, incompatible, and
cross-draft results append nothing.

### Privacy data inventory

Allowed transient inputs are displayed player name, stable player/pick identifier when present,
overall pick, round, draft slot, fantasy team label/identifier, keeper flag, and timestamps. The
display name exists only for local resolution or confirmation and is omitted from the normalized
draft event.

Prohibited inputs include passwords, cookies, authentication headers, browser history, full URLs
outside the allowlist, page HTML, screenshots, chat, ads, profile data, other leagues, other tabs,
and arbitrary document text.

### Failure and incident response

On unknown DOM, compatibility failure, authorization failure, anomaly, or emergency disable, the
companion detaches its observer and emits no picks. The UI identifies the state without exposing
private content and directs the user to manual mode.

A response procedure must be able to disable new pairings, reject all companion ingestion, revoke
active tokens, mark affected observer versions unsupported, preserve the append-only log, and
review hashed correlation metadata. Existing events are corrected with new events rather than
deleted or overwritten.

### Residual risks

- A compromised extension release with broadened permissions could violate this design. Signing,
  reviewed distribution, and permission-diff checks are mandatory in any future release process.
- ESPN can change markup without notice. Version gating reduces silent corruption but can cause
  availability loss; manual mode is the deliberate fallback.
- A malicious page may imitate plausible draft markup. Stable provider IDs, structural checks, and
  anomaly detection reduce but cannot eliminate this risk.
- Users can manually confirm the wrong ambiguous player. The explicit confirmation record makes the
  decision visible and correctable but cannot guarantee human accuracy.

These residual risks are acceptable only for an opt-in experimental companion that is disabled by
default and never performs draft actions.

## Severity Calibration (Critical, High, Medium, Low)

### Critical

A flaw is critical when it enables broad compromise beyond draft observation without another major
precondition. Examples are a published companion update that extracts and exports ESPN session
cookies for all installed users, or remote code execution in the privileged extension context that
can access FantasyFB pairing tokens and arbitrary permitted origins.

### High

A flaw is high when a realistic attacker can cross an account or draft authorization boundary,
steal a live pairing capability, perform sustained unrelated-page collection, or silently corrupt a
private live draft at scale. Examples are accepting a browser-supplied user ID without ownership
checks, reusable unexpired pairing codes, or a permission/selector change that transmits full ESPN
page content.

### Medium

A flaw is medium when it requires a narrower precondition or has bounded integrity/privacy impact.
Examples are duplicate or wrong-player events in one paired draft that remain correctable through
append-only events, a token retained longer than the documented session lifetime without known
exposure, or logs containing unhashed draft identifiers but no credentials or page content.

### Low

A flaw is low when impact is limited to local availability, confusing status, or small metadata
exposure without authorization bypass. Examples are failing to show a disconnected indicator while
manual mode still works, accepting an unknown non-sensitive status reason, or retaining a bounded
dedupe identifier after disconnect. Pure ESPN markup breakage that fails closed is an expected
compatibility event, not a security vulnerability.
