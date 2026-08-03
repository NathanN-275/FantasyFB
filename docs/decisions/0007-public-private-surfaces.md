# Separate public demo and private workspace

Public routes use explicitly labeled sample data, while private records are authorized server-side for the authenticated user. This protects private league and import data independently of client-side routing.

## Public surface

The public experience includes the landing and feature overview, a synthetic league, draft,
players, rankings, trade evaluation, architecture, projection methodology, data-source notes, and
repository link. Public fixture metadata enters the web application through one validated loader.
The route-boundary test rejects direct references from public pages to authentication, private APIs,
the database, or secret environment names.

## Private surface

The authenticated dashboard inventories leagues, scoring profiles, expert imports, rankings, draft
sessions, queues, trade evaluations, preferences, and private dataset freshness. Each repository
operation takes an authorization context derived from the server session. Preference updates accept
settings only; there is no browser-submitted owner field.

Private tables require an owner identifier directly or inherit ownership through an owned league or
draft relationship. Public sample fixtures never create user records.
