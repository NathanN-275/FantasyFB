# Use portable PostgreSQL on Neon

FantasyFB uses Neon as its managed PostgreSQL provider, but domain modules depend on repository interfaces and PostgreSQL semantics only so the database can move to another PostgreSQL host.
