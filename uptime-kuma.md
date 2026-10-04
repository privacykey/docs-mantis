---
title: "Uptime Kuma integration"
description: "Use Mantis status URLs with Uptime Kuma notification channels."
sidebarTitle: "Uptime Kuma"
---

Uptime Kuma integration lets you piggyback on [Uptime Kuma](https://github.com/louislam/uptime-kuma)'s 80+ notification integrations when you prefer status-monitor fan-out over mantis's built-in notification destinations.

The mechanic: every monitored key has a *status URL*, `/status/<public_id>.<tag>`, that flips between OK (HTTP 200) and tripped (HTTP 503) when the mantis fires. Point a Uptime Kuma HTTP(s) monitor at that URL — Kuma detects the status code or body change and fires its configured notifications.

Copy the status URL from the key's monitor card in the dashboard, from `mantis monitor`, or from `monitor_status_url` in the API. The tag is derived from a server secret, so the status URL cannot be worked out from a trigger URL: someone who finds the bait cannot use it to check whether it has been noticed.

## Modes

| `monitor_mode` | When tripped | When does it clear? |
|---|---|---|
| `off` (default) | never (status URL returns 404) | — |
| `latch` | once *any* hit recorded | manual reset via `POST /api/keys/<id>/reset` |
| `window` | any hit within `monitor_window_seconds` (default 300) | automatically when the newest hit ages out |

## Setup walkthrough

```bash
# 1. Pick a key and enable monitoring
mantis monitor <key-id> --mode latch
#   → status URL: http://mantis.example.com/status/<public_id>.<tag>
#   → current:    ok

# 2. In Uptime Kuma → Add new monitor:
#      Monitor type:        HTTP(s)
#      URL:                 the status URL printed in step 1
#      Heartbeat Interval:  30s (or longer; Kuma minimum 20s)
#      Status code accepted: 200
#      → Save and attach your preferred notifications

# 3. Test it: trigger the mantis URL
curl http://mantis.example.com/c/<public_id>

# Within 30s, Uptime Kuma sees the status URL flip 200 → 503,
# and fires its configured Discord/Slack/Teams/whatever notifications.

# 4. When you've acknowledged the alert:
mantis reset <key-id>   # in latch mode; window mode auto-resets
```

## Status endpoint behavior

| Request | Response |
|---|---|
| Status URL of an active key, no trip | `200` `{"status":"ok"}` |
| Status URL of an active key, tripped | `503` `{"status":"tripped"}` |
| Anything else under `/status/` — no tag or a wrong one, a key that doesn't exist, `monitor_mode = off`, a disabled or expired key | `404` with an empty body |

Every "nothing to read here" case gets the same empty 404, so the endpoint neither confirms that a key exists nor keeps Uptime Kuma alerting on a key you've shut down. All responses include `Cache-Control: no-store`. The status endpoint **does not record a hit** — Uptime Kuma can poll it forever without filling your hits log.

When and how a key tripped (`tripped_at`, mode, window) is not on the public URL. Read it with `mantis status <key-id>` or the owner-only `GET /api/keys/<id>/monitor`.

## Notes

- Same key still records hits and dispatches configured notification destinations on `/c/<public_id>` — the status URL is a separate read-only reflection of state.
- **Upgrading from before 0.3.0:** status URLs used to be `/status/<public_id>`. That form now returns 404, so re-point each monitor at the key's new status URL. Rotating `MANTIS_API_KEY_PEPPER` changes every status URL.
- Uptime Kuma is optional. The status URL is plain HTTP(s); any monitor that watches for status-code or body changes (e.g., Pingdom, BetterUptime, healthchecks.io, your own cron) works.
- In `latch` mode, switching to `off` then back to `latch` does not lose trip state — it's derived from `hits` filtered by `monitor_reset_at`.
