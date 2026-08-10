---
title: "Reliability"
description: "Understand hit deduplication, notification retries, worker mode, and bot parsing."
---

## Hit dedup

Each key has a `dedupe_window_seconds` (default **60**). Repeat hits to the same key within that window are still recorded (so forensics are intact), but they are marked `is_duplicate: true` and don't fire notifications. Set to `0` to disable.

## Trigger and Wallet flood guards

Public trigger requests are rate-limited per IP (when a trusted client IP exists) and then per key, at 120/minute, by an in-memory limiter. Over-cap requests still return the key's normal response but skip the record-and-notify path, so one flooded canary can't blind another or drown your notifications — and a missing client IP fails open per-IP rather than collapsing every canary into one shared bucket. Apple Wallet callbacks (pass fetch, registration) share the trigger dedupe window plus a per-key/IP 60/minute cap, because a `.pkpass` embeds a long-lived auth token any holder could loop into a notification flood. These two guards use the per-process in-memory limiter; the cross-instance Postgres-backed limiter is reserved for auth/login throttling (see [operational notes](/operational-notes)).

## Notification retry queue

On each hit, notifications are enqueued for that key's own destinations **plus** every instance-wide [global destination](/configuration#global-notification-destinations) (`key_id IS NULL`, configured at `/settings/notifications`). A destination that appears in both sets is sent once, de-duplicated on `(channel, target)` with the key's own row winning so its signing secret and activation history are used — a key with no destinations of its own still alerts if a global one exists.

Notifications are inserted into a `notifications` table on hit. A background worker claims pending rows (`FOR UPDATE SKIP LOCKED` — safe for multiple instances), attempts delivery with a 5s timeout, and on failure schedules the next attempt with exponential backoff. Status (`pending` / `in_flight` / `succeeded` / `failed` / `aborted`) is surfaced in the dashboard, CLI (`mantis hits <id>`), and API (`GET /api/keys/<id>/hits`).

**Worker mode** (default for non-Vercel deployments):
- `instrumentation.ts` starts the worker on boot. Disable with `RUN_NOTIFY_WORKER=0`.

**Cron mode** (Vercel and other serverless):
- Worker is skipped automatically when `VERCEL` env is set.
- Configure Vercel Cron (or external scheduler) to hit `POST /api/cron/notifications` every minute.
- Set `CRON_SECRET`; the endpoint requires `Authorization: Bearer $CRON_SECRET` and returns `401` when the secret is unset.

```json
// vercel.json
{
  "crons": [{ "path": "/api/cron/notifications", "schedule": "* * * * *" }]
}
```

Both worker mode and cron mode run the same retention sweep. If
`MANTIS_HIT_RETENTION_DAYS`, `MANTIS_NOTIFICATION_RETENTION_DAYS`,
`MANTIS_AUDIT_RETENTION_DAYS`, or `MANTIS_SESSION_RETENTION_DAYS` are set,
old rows are purged during the hourly worker loop or the cron invocation. The
sweep additionally deletes expired `rate_limits` rows (window older than 1 day)
on every run regardless of retention configuration, so the limiter table — whose
keys embed attacker-rotatable IPs — can't grow without bound.

## User-Agent + bot detection

Hits are enriched with parsed UA (`ua_browser`, `ua_browser_version`, `ua_os`, `ua_device`) via `ua-parser-js`, plus a `bot_label` for known crawlers and HTTP clients (googlebot, curl, python-requests, headless-chrome, etc.). Bots aren't suppressed — they're labeled so you can decide.
