# Security policy

## Reporting

Do not open a public issue containing credentials, private league data, private imports, OAuth/session
material, or unpublished vulnerability details. Contact the repository owner privately and include only
the minimum reproduction metadata and a correlation ID.

## Secret handling

- Vercel and GitHub environment stores own runtime/job secrets.
- Only `NEXT_PUBLIC_APP_URL` is browser-safe.
- Production, Preview, and Development use separate credentials.
- Gitleaks scans full Git history and GitHub dependency review blocks newly introduced high-severity
  dependency vulnerabilities.
- Logs must follow `docs/operations/observability.md`.

If a credential is exposed, rotate it before investigating convenience fixes. Follow
`docs/operations/recovery.md`; rewriting published Git history is a separate destructive action that
requires explicit owner approval.
