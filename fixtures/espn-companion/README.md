# ESPN companion architecture fixtures

These files are synthetic contract examples for architecture and security tests. They are not
captured ESPN pages, real player data, private league data, credentials, cookies, or an installable
browser extension.

- `accepted-pick.json` demonstrates a provider-ID match that may enter the shared draft source.
- `uncertain-pick.json` demonstrates a name collision that must pause for manual confirmation.
- `unsupported-status.json` demonstrates fail-closed behavior after an unknown page signature.
- `permissions.json` records the proposed minimum permission surface. The example application host
  is intentionally non-routable and must be replaced only during a separately approved
  implementation phase.

The `@fantasyfb/draft-room` tests load the message fixtures and verify strict schema validation,
compatibility checks, draft-session binding, duplicate handling, manual confirmation, and rejection
of arbitrary page content.
