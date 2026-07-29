# Use portable PostgreSQL on Neon

FantasyFB uses Neon as its managed PostgreSQL provider, but domain modules depend on repository interfaces and PostgreSQL semantics only so the database can move to another PostgreSQL host.

Vercel runtime traffic uses Neon's pooled URL. Migrations, logical backups, and restore validation use
a separate direct URL and least-privilege migration role. Production and Preview use isolated branches
and credentials; Preview never receives production private data. Recovery uses Neon restore/branching
plus portable logical backups, and all recovery is validated on a separate branch before promotion.

See [production deployment](../operations/deployment.md) and the
[recovery runbook](../operations/recovery.md).
