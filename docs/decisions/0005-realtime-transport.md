# Avoid database-level realtime in version one

Live Sleeper drafts will initially poll documented draft endpoints and append normalized events. The draft domain will not depend on polling, WebSockets, Server-Sent Events, or a database realtime vendor.
