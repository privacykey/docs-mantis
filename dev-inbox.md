---
title: "Dev inbox"
description: "Use the built-in local webhook capture while developing Mantis."
---

A built-in webhook capture, only enabled with `ENABLE_DEV_INBOX=1`:

- `ANY http://localhost:3000/inbox/<any-path>` — captures the request into a 100-entry in-memory ring buffer; request bodies over 1 MiB return `413 payload_too_large`, and stored/displayed bodies are truncated after 64 KiB
- `GET /inbox` — live-updating viewer (polls every 1s, pretty-prints JSON bodies)
- `GET /api/inbox` — same data as JSON; supports `?slug=foo&since=<id>`. Requires an API key or dashboard session.
- `DELETE /api/inbox` — clear the buffer. Requires an API key or dashboard session.

The `/inbox/<slug>` capture endpoint is unauthenticated by design so it can receive webhooks, but reading or clearing the captured buffer requires operator auth.

Credential headers on a captured request — `Cookie`, `Authorization`, API-key and token headers — are stored as `[redacted]`. The inbox shares the dashboard's origin, so a browser landing on it would otherwise leave the operator's session cookie in the buffer.

Use it as your webhook target while developing, instead of webhook.site. State is in-memory only — it resets when the server restarts. Do not expose it in production.
