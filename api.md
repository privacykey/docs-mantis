---
title: "HTTP API"
description: "Reference for key management endpoints, trigger responses, and webhook payloads."
sidebarTitle: "HTTP API"
---

The CLI is the recommended interface, but everything it does is exposed over a plain JSON HTTP API. Useful for scripts in languages without a Mantis client, or for testing the trigger path with `curl`:

```bash
export MANTIS=http://localhost:3000
export KEY=mantis_live_...   # `mantis login` output, or read from the bootstrap log

# Mint a key
curl -sX POST $MANTIS/api/keys \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"memo":"first mantis","destinations":[{"channel":"webhook","target":"https://webhook.site/<your-id>"}]}'
# → { "id":"...", "public_id":"...", "url":"http://localhost:3000/c/...", ... }

# Trigger it
curl -i $MANTIS/c/<public_id>
# → 200 OK with a 1×1 transparent GIF

# Inspect hits
curl -s $MANTIS/api/keys/<id>/hits -H "Authorization: Bearer $KEY" | jq
```

## Endpoint reference

Management endpoints are API-key authenticated with `Authorization: Bearer mantis_live_...`.
Dashboard helper endpoints that need browser access also accept the `mantis_session`
httpOnly cookie. Public trigger, status, health, wallet, and dev-inbox routes
are called out explicitly below.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/keys` | Create a key. Bearer auth. Body: `{ memo, external_id?, response_kind?, response_payload?, destinations?, expires_at?, dedupe_window_seconds?, monitor_mode?, monitor_window_seconds?, self_origins?, adopt? }`. `expires_at` must be in the future, and `memo` and destination targets may not contain control characters. Supply `external_id` to make creation idempotent — see [below](#idempotent-creation). The one route enrollment-scoped keys may call, with a [restricted body](#api-key-scope-full-vs-enroll). |
| `GET` | `/api/keys?limit=&cursor=&mine=1` | List accessible keys. Bearer auth. Admin keys see all; non-admin keys see rows they created. `mine=1` restricts any caller, admins included, to keys it created (the CLI's `last` uses it). |
| `GET` | `/api/keys/:id` | Get one accessible key. Bearer auth. |
| `PATCH` | `/api/keys/:id` | Update memo, response, expiry, dedupe, monitor mode/window, `self_origins`, `disabled`, or replace destinations. Bearer auth. |
| `DELETE` | `/api/keys/:id` | Hard-delete a key and cascading hits/notifications. Bearer auth. |
| `GET` | `/api/keys/:id/hits?limit=&cursor=` | Paginated hit log for one key. Bearer auth. Each hit carries a `notifications` array; see [notification rows](#notification-rows-in-hit-listings). |
| `GET` | `/api/hits/recent?since=<iso>&cursor=<iso>&key_id=<id>&limit=<n>` | Recent hit feed across accessible keys, used by CLI watch mode. Bearer or session auth. Same `notifications` shape as above. |
| `GET` | `/api/keys/:id/download?format=<format>` | Download a generated artifact. Bearer or session auth. Formats: `docx`, `xlsx`, `pptx`, `pdf`, `folder`, `nfc-label`, `apple-wallet`, `svg`, `html`, `md`, `eml`, `ics`, `vcf`, `rtf`, `cookies`, `bookmarks`, `env`, `aws-credentials`, `netrc`, `kubeconfig`, `ovpn`, `rdp`. See [file keys](/file-keys). |
| `POST` | `/api/keys/bulk-download` | Zip one generated artifact per key. Bearer or session auth. Body: `{ ids, format }`, max 50 ids; returns a `.zip` with one artifact (or per-key folder) per key. Ids not visible to the caller are silently skipped, not rejected. |
| `POST` | `/api/keys/device-bundle` | Package an already-minted device suite into an installable zip. Bearer or session auth. Body: `{ device, os, vectors }`, max 20 vectors; returns the install zip, or a JSON file map with `?format=json`. Backs the dashboard's device page and `mantis device new --bundle`. |
| `GET` | `/api/keys/:id/install?type=<type>[&hostname=example.com][&format=json]` | Generated installer snippet for host, web, NFC, and IoT events. Bearer or session auth. |
| `GET` | `/api/keys/:id/monitor` | Monitor state for one accessible key: `{ state, tripped_at, mode, window_seconds }`. Bearer or session auth. The public status URL returns the state only; the detail lives here. |
| `POST` | `/api/keys/:id/reset` | Reset a key's latched monitor state. Bearer or session auth. Audited. |
| `POST` | `/api/keys/:id/destinations/:destinationId/signing-secret` | Reveal a webhook destination's plaintext HMAC signing secret. Bearer or session auth. Audited. |
| `POST` | `/api/keys/:id/destinations/:destinationId/rotate-secret` | Rotate a webhook destination's HMAC signing secret and return the new secret once. Bearer or session auth. Audited. |
| `GET` | `/api/api-keys` | List API keys. Bearer auth. Hashes are never returned; non-admin keys see only themselves. Each row includes its `scope`. |
| `POST` | `/api/api-keys` | Mint a new API key. Bearer auth, **admin-only** (`403` for non-admin keys). Body: `{ name, is_admin?, scope?, owner_api_key_id? }`; plaintext key returned once. `scope` is `full` (default) or `enroll` — see [key scope](#api-key-scope-full-vs-enroll). `owner_api_key_id` applies to enroll keys only: the full key whose fleet the key enrolls for (default: the minting admin). |
| `DELETE` | `/api/api-keys/:id` | Revoke an API key. Bearer auth. Self-revoke is allowed; revoking others requires admin. |
| `GET` | `/api/device-profiles` | The device-profile / vector catalog used by `mantis device`. Bearer or session auth. |
| `GET` | `/api/audit?limit=&cursor=&since=&event_type=&actor=` | Admin-only audit log. Bearer or session auth. `actor` must be a full UUID (`422` otherwise). |
| `GET` `HEAD` | `/api/health` | **Public unless gated by your proxy.** Liveness + `SELECT 1` readiness. 200 = app and DB ok, 503 = DB failure. |
| `GET` `POST` | `/api/cron/notifications?max=<n>` | Notification retry and retention worker endpoint for serverless deployments. Requires `Authorization: Bearer $CRON_SECRET`; returns 401 if `CRON_SECRET` is unset. |
| `GET` `HEAD` | `/status/:public_id.:tag` | **Public.** Uptime-monitor status endpoint; the full URL is the key's `monitor_status_url`. 200 = ok, 503 = tripped. A missing or wrong tag, an unknown, disabled or expired key, and monitoring switched off all return the same empty 404. Does not record a hit. See [Uptime Kuma](/uptime-kuma). |
| `ANY` | `/c/:public_id[/<any path>]` | **Public.** Records a hit, returns the configured response. Any path after the id and any HTTP method reach the same handler, so bait placed in a base-URL field still fires when a tool appends its own path. |
| `ANY` | `/inbox/<slug>` | **Dev only.** Captures webhook-style requests when `ENABLE_DEV_INBOX=1`. |
| `GET` `DELETE` | `/api/inbox` | **Dev only.** Read or clear the in-memory dev inbox when `ENABLE_DEV_INBOX=1`. Bearer or session auth. |
| `POST` | `/api/wallet/v1/log` | **Public Apple Wallet web service.** Accepts Wallet diagnostics. |
| `GET` | `/api/wallet/v1/passes/:passTypeId/:serial` | **Public Apple Wallet web service.** Authenticates `Authorization: ApplePass <token>`, records `wallet-fetched`, returns the latest `.pkpass`. |
| `GET` | `/api/wallet/v1/devices/:deviceId/registrations/:passTypeId` | **Public Apple Wallet web service.** Wallet update poll; returns 204 and does not record a hit. |
| `POST` `DELETE` | `/api/wallet/v1/devices/:deviceId/registrations/:passTypeId/:serial` | **Public Apple Wallet web service.** Records `wallet-installed` on registration and `wallet-uninstalled` on removal. |

Parsed request bodies are bounded. `POST /api/keys` and
`POST /api/api-keys` reject JSON bodies over 64 KiB with
`413 payload_too_large`. Apple Wallet log bodies are capped at 32 KiB, and the
dev inbox capture path is capped at 1 MiB.

Supported installer `type` values are `shell`, `shell-sudo`,
`macos-login`, `macos-boot`, `macos-wake`, `macos-network`,
`linux-boot`, `linux-wake`, `linux-network`, `windows-logon`,
`windows-wake`, `windows-network`, `css-background`, `js-clone-detector`,
`nfc-ndef`, `homeassistant`, `homeassistant-receiver`, and `scrypted`.

Webhook destinations get an HMAC secret. Outbound raw-webhook deliveries include
`X-Mantis-Timestamp` and `X-Mantis-Signature: sha256=<hex>` over
`<timestamp>.<json body>`. The plaintext secret is only shown on create, replace,
explicit reveal, or rotate responses; normal listing returns a fingerprint. The
secret of a [global](/configuration#global-notification-destinations) webhook
destination is revealed or rotated by an admin on the settings page.

## API key scope: full vs enroll

Every API key carries a `scope`, orthogonal to `is_admin`:

- **`full`** (default) — behaves as described throughout this page. Subject to the admin / non-admin visibility rules.
- **`enroll`** — create-only. An enroll key may call **only** `POST /api/keys`. Every other management route (list/read/update/delete keys — including the ones it created — plus `/api/hits/recent`, `/api/api-keys`, the audit log, and any session-reachable route) returns `403 forbidden`, and an enroll key cannot log in to the dashboard. `is_admin: true` together with `scope: "enroll"` is rejected at validation.

Enroll keys are the intended credential for MDM / fleet provisioning: you embed one on every managed machine and accept that a curious user will extract it. So an enroll key can only mint a plain tripwire:

- **Body.** `memo`, `external_id`, `response_kind` (`gif` or `empty`) and `dedupe_window_seconds` (at most 600). Anything else — `expires_at`, monitor settings, `response_payload`, a redirect / HTML / JSON response, `self_origins`, or an `external_id` in the `mantis:device:` namespace — is refused with `403 forbidden`.
- **Destinations.** Accepted only when every `channel:target` pair is listed in the server's [`MANTIS_ENROLL_DESTINATIONS`](/configuration#fleet-enrollment); otherwise `403`, before anything is stored or sent. Unset means an enroll key cannot attach destinations at all, and fleet alerts are routed by [global destinations](/configuration#global-notification-destinations). The response never includes activation error text.
- **Volume.** One enroll key can create at most `MANTIS_ENROLL_KEYS_PER_HOUR` new keys per hour (default 1000); beyond that it gets `429`. Re-claims are not counted.
- **Fleet.** Each enroll key belongs to one fleet, set when it is minted (`owner_api_key_id`, default: the minting admin). It can re-claim an `external_id` only inside that fleet — see [Idempotent creation](#idempotent-creation).

What an extracted enroll key can still do: create noise keys up to the hourly cap, and recover the trigger URL of a key in its own fleet whose `external_id` it knows or guesses (alert routing is never included, and the memo is `null` unless it created the key). Knowing a machine's trigger URL lets someone fire false alarms or step around the tripwire, so treat serial numbers as guessable and watch the audit log: each such claim is recorded as `key.claimed` with `cross_key: true`.

See the Kandji recipe in the product repo's `deploy/kandji/`.

## Idempotent creation

`POST /api/keys` also accepts an optional `external_id` (1–128 chars, matching
`^[A-Za-z0-9][A-Za-z0-9._:-]*$`) stored on a unique column. When supplied, a
repeat POST with the same `external_id` returns the **existing** key —
`"reused": true` with HTTP `200` instead of `201` — rather than minting a
duplicate. The other body fields (`memo`, `destinations`, …) apply only when the
row is actually created; a later claim never changes what an operator
configured. Keys created without an `external_id` are unaffected (unique
constraint treats NULLs as distinct).

This is the mechanism the fleet-enrollment flow relies on — one key per machine
serial, so re-running enrollment on a reimaged machine reuses its key instead of
littering the list. External ids are guessable and unique across the whole
instance, so a repeat POST only resolves inside the caller's **fleet**:

- **the key's creator** — the key as it could read it anyway, with
  `"created_by_caller": true`;
- **an enrollment-scoped key of the same fleet** — the reduced shape: trigger
  URL, `public_id`, `external_id`, expiry and `disabled`, with `memo` set to
  `null` unless it created the key. No alert routing, no signing secrets.
  Audited as `key.claimed` with `cross_key: true`;
- **an admin** — keys of the operators' own fleet, in full. Adopting a key
  another fleet created needs `"adopt": true` in the body (audited with
  `adopted: true`);
- **anyone else** — `409 conflict` with no key details, audited as
  `key.claimed` with `denied: true`.

A fleet is all admin keys plus the enroll keys they own, or one non-admin full
key plus the enroll keys bound to it with `owner_api_key_id`. Enroll keys minted
before 0.3.0 have no recorded owner and count as the operators'.

A disabled or expired key is never handed back: the claim returns
`409 conflict`, so enrollment fails visibly instead of arming a device with a
tripwire that cannot fire. A claim that races a concurrent delete also returns
`409 conflict`; retry.

One case adds to an existing key: when an enrollment-scoped key re-claims a key
that an enroll key created, any approved destination in the request that the
key lacks is attached. A serial claimed early by someone holding the enroll key
therefore still ends up routed once the real device enrolls.

## Notification rows in hit listings

Every hit returned by `/api/keys/:id/hits` and `/api/hits/recent` carries a
`notifications` array — one row per destination the hit fanned out to, with
`channel`, `status`, `attempts`, `max_attempts`, `next_attempt_at`,
`succeeded_at`, `last_error`, `target` and `destination_scope`.

`destination_scope` is `key` for a destination attached to the key itself,
`global` for an instance-wide [global destination](/configuration#global-notification-destinations),
and `unknown` when the destination has since been deleted. **`target` is `null`
unless the caller may see it**: admins always may; a non-admin key owner sees
only the targets of the key's own destinations. Global-destination targets are
Slack / Discord / Teams / Home Assistant webhook URLs configured by an admin —
they are credentials, so a non-admin never receives them. `last_error` follows
the same rule: a caller who may not see the target gets the HTTP status only
(for example `HTTP 500 (details visible to admins)`). The dashboard hit feed and
`mantis hits` render a placeholder for redacted rows.

A row whose destination was removed before delivery ends as `aborted`.

## Response kinds for the trigger endpoint

| `response_kind` | Payload | Result |
|---|---|---|
| `gif` (default) | — | `200` + 1×1 transparent GIF |
| `empty` | — | `204 No Content` |
| `json` | any | `200` + JSON body |
| `redirect` | `{"url":"..."}` | `302` to that HTTP(S) URL with no-store cache headers |
| `html` | `{"html":"..."}` | `200 text/html` with no-store cache headers and a restrictive CSP sandbox |

## Webhook payload

```json
{
  "type": "mantis.hit",
  "key": { "id": "...", "public_id": "...", "memo": "...", "url": "...", "dashboard_url": "..." },
  "hit": {
    "id": "...",
    "occurred_at": "2026-05-12T10:00:00.000Z",
    "ip": "203.0.113.5",
    "user_agent": "Mozilla/5.0 ...",
    "referer": null,
    "ua_browser": "Chrome",
    "ua_os": "macOS",
    "ua_device": "desktop",
    "bot_label": null,
    "is_duplicate": false,
    "headers": { "host": "...", "accept": "...", "x-mantis-source": "shell", "x-mantis-user": "alice", "x-mantis-ssh-client": "203.0.113.42 54321 22", "..." : "..." }
  }
}
```

`key.url` is the trigger URL: requesting it fires the key again, so never render it as a link or let a chat client preview it. Link `key.dashboard_url`, the key's page in the dashboard, instead. Home Assistant payloads carry the same pair as `key_url` and `dashboard_url`, plus the hit's `referer`.

Webhook payloads also include a parsed `host_context` object when the hit came from one of our installer snippets:

```json
"host_context": {
  "source": "shell",
  "user": "alice",
  "host": "alice-mbp",
  "ssh_client": "203.0.113.42 54321 22",
  "ssh_client_ip": "203.0.113.42",
  "ssh_connection": "203.0.113.42 54321 10.0.0.5 22",
  "tty": "/dev/pts/0",
  "sudo_cmd": null,
  "network_interface": null
}
```

For a `shell-sudo` hit you'd see `"source": "shell-sudo", "sudo_cmd": "apt update --quiet"`. For a `linux-network` hit, `"source": "linux-network", "network_interface": "wlan0"`. Fields not relevant to the installer are `null`.

`host_context` is `null` for hits that didn't include `X-Mantis-*` headers (e.g., a file/folder key, or a regular curl to the URL).

Webhooks are sent through a **Postgres-backed retry queue** (no Redis required). On failure the notification is retried with exponential backoff: 1m, 5m, 30m, 2h, 12h (each with ±20% jitter), giving up after 5 attempts. Delivery state is tracked on each hit's `notifications` array.
