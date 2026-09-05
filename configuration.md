---
title: "Configuration"
description: "Required and optional environment variables for running Mantis."
---

See `.env.example` in the main Mantis repo for the canonical, commented list.
These are the variables operators usually need to understand.

## Required

- `DATABASE_URL` — Postgres connection string. Used directly when you run Mantis **from source** (`pnpm dev`, `pnpm db:migrate`) — point it at your own Postgres. The Docker Compose deploy **ignores** this value and derives its own from `POSTGRES_PASSWORD` (connecting to host `postgres`, not `localhost`), so a `localhost` value kept here for run-from-source does no harm.
- `POSTGRES_PASSWORD` — password for the Docker Compose Postgres service, and the single source of truth from which Compose builds the app's `DATABASE_URL`. It ships **empty** in `.env.example` and has no insecure default: both Compose services abort on boot if it is unset or empty. Generate it (together with the pepper below) by running `./scripts/setup.sh` — a bare `cp .env.example .env` is not enough to start the stack. Not needed when running from source against your own Postgres.
- `MANTIS_API_KEY_PEPPER` — server-side secret used as the HMAC key when hashing API keys at rest. Generate with `openssl rand -base64 32`. A leaked database alone is useless to an attacker without this value too. **Do not rotate after the first key is minted** — rotating invalidates every existing API key used by the CLI or API clients. If you must rotate, plan to re-mint and re-distribute every API key on the same maintenance window.

  Upgrading from a pre-pepper deployment? Set the pepper once and existing API keys keep working — the verifier accepts the old pre-pepper SHA-256 hashes too, and opportunistically re-hashes each row to the peppered form on next use. After a few weeks of normal traffic the legacy rows drain to zero.

- `MANTIS_SECRET_KEY` *(optional)* — envelope-encryption key for operator secrets stored in the database: per-destination webhook HMAC signing secrets, the Apple Wallet auth secret, and the `.p12` certificate passphrase. When set, those columns are sealed at rest with AES-256-GCM (an `encv1:` envelope) so a database-only leak (backup, read replica) yields no usable secrets — the same trust model as the pepper above. Generate with `openssl rand -base64 32` (a 64-character hex string also works; it must decode to exactly 32 bytes). Leave it unset to keep plaintext-at-rest behavior. The feature is backward compatible: existing plaintext rows are read transparently, and once the key is set, new writes are encrypted while legacy rows migrate to ciphertext the next time a signing secret is rotated. (A legacy DB wallet config can't be re-saved — wallet config is env-var driven now — so clear it from `/settings/wallet` instead of leaving its plaintext secrets in the database.) Don't rotate this key without re-saving those secrets, and don't remove it once rows are encrypted — reads of sealed values will then fail.

## URLs

- `PUBLIC_BASE_URL` — public origin used when Mantis generates trigger, status, and Wallet callback URLs. Defaults to `http://localhost:3000`.
- `MANTIS_PUBLIC_PATH` — trigger path prefix, default `/c`. Changing this changes generated URLs and the public-only host allowlist; the app rewrites `<prefix>/<id>` onto its trigger handler itself, so no reverse-proxy rewrite is needed (server ≥ 0.2.0 — earlier releases needed one). Responses under a custom prefix also carry the dashboard's security headers (`X-Frame-Options: DENY`, CSP), which only matters if you embed an `html` response kind in an iframe.

## Boot and runtime

- `BOOTSTRAP_API_KEY` — pre-seed the first admin API key. If unset and no API keys exist, Mantis mints one and prints it on first boot.
- `AUTO_MIGRATE=1` — apply pending migrations on app boot. Useful for long-running container deploys; avoid for Vercel/serverless.
- `RUN_NOTIFY_WORKER=0|1` — notification worker switch. It runs by default outside Vercel; set `0` when using cron mode instead.
- `CRON_SECRET` — required to enable `GET`/`POST /api/cron/notifications`. The endpoint fails closed with 401 when unset.
- `LOG_LEVEL` — `trace|debug|info|warn|error`, default `info`.

## Notification destinations

- `SMTP_URL` — enables email notification destinations. Example: `smtp://user:pass@host:587`.
- `SMTP_FROM` — email sender, default `Mantis <mantis@localhost>`.
- `ALLOW_PRIVATE_WEBHOOKS=1` — allow webhook/Slack/Discord/Teams targets that resolve to private, loopback, link-local, or cloud-metadata IPs. Default is blocked as an SSRF guard.

## Global notification destinations

Beyond the per-key destinations managed with `mantis destinations`, an admin can
set **instance-wide** destinations from the dashboard at `/settings/notifications`.
Every key's hits fan out to its own destinations *plus* every global one, so you
can set a Slack or webhook once and have every key you mint — including
bulk-created ones — alert you without further setup. A destination listed both
globally and on a key fires once (the key's own row wins, keeping its signing
secret and activation history). There is no environment variable or CLI
subcommand for the global set; it lives only in the admin dashboard.

## Proxy and public-only hosts

- `TRUST_PROXY_HEADERS=1` — trust `cf-connecting-ip`, `x-vercel-forwarded-for`, `x-real-ip`, and `x-forwarded-for` for forensic IP logging. Set only behind a proxy that strips and re-injects those headers. Auto-enabled on Vercel and in non-production; set `TRUST_PROXY_HEADERS=0` to force it off even there. In production with no trusted proxy (the default), client IPs are recorded as `null` rather than spoofable values, and Mantis logs a one-time startup warning.
- `TRUSTED_IP_HEADER` — pin client-IP extraction to a single header (matched case-insensitively), e.g. `x-real-ip`. By default Mantis tries `cf-connecting-ip`, `x-vercel-forwarded-for`, `x-real-ip`, then `x-forwarded-for` and takes the first present; behind a non-Cloudflare proxy (nginx, Caddy, Traefik) that sets only `x-real-ip` and doesn't strip an inbound `cf-connecting-ip`, an attacker could forge `cf-connecting-ip` and have it trusted. Pin this to the one header your proxy authoritatively writes so all others are ignored. Only takes effect when `TRUST_PROXY_HEADERS` is on.
- `TRUST_PROXY_HOPS` — number of trusted reverse-proxy hops in front of Mantis, default `1` (clamped to 1–16). Only affects `x-forwarded-for` parsing: the client IP is taken this many entries from the right of the chain (your nearest proxy appends the real peer on the right), so a client can't forge it past your proxy. Raise it only if you stack multiple trusted proxies; it has no effect on single-value headers like `cf-connecting-ip` or `x-real-ip`.
- `FORCE_SECURE_COOKIES` — override the `Secure` flag on the dashboard session cookie. `1` forces it on, `0` forces it off; unset derives it from the request scheme (`X-Forwarded-Proto`, or the RFC 7239 `Forwarded` header's leftmost hop). Set `1` behind a proxy or tunnel that terminates real TLS but sets **neither** scheme header — otherwise the session cookie travels un-`Secure` over genuine HTTPS. Leave it unset for the proxies Mantis documents (Cloudflare, cloudflared, Tailscale, nginx), which all set a scheme header. Don't force it on over plain HTTP: the browser would then never send the cookie back and login would break.
- `PUBLIC_ONLY_HOSTS` — comma/space-separated hostnames that should expose only public routes: trigger URLs, status URLs, and Wallet callbacks.
- `DASHBOARD_HOSTS` — hostnames allowed to serve the dashboard and management API. When `PUBLIC_ONLY_HOSTS` is set, unknown hosts fail closed to public-only unless explicitly listed here.
- `PUBLIC_ONLY_ALLOW_HEALTH=1` — allow `/api/health` on public-only hosts.
- `PUBLIC_ONLY_ALLOW_INBOX=1` — allow `/inbox` and `/api/inbox` on public-only hosts. Use only for deliberate dev boxes.

## Hit storage

- `MANTIS_DUPLICATE_LOG_LIMIT` — duplicate hit rows to store per dedupe window after the first hit. Default `10`; `0` stores only the first hit in the window.
- `MANTIS_MAX_STORED_REQUEST_FIELD_CHARS` — cap for stored `user-agent`, `referer`, and individual header values. Default `16384`.
- `MANTIS_MAX_STORED_HEADER_SNAPSHOT_CHARS` — cap for the total stored header snapshot. Default `65536`.

## Retention

Unset retention variables mean retain forever. The notify worker sweeps hourly;
cron mode runs the same sweep through `/api/cron/notifications`.

- `MANTIS_HIT_RETENTION_DAYS` — delete hits older than N days; notifications cascade.
- `MANTIS_NOTIFICATION_RETENTION_DAYS` — delete settled notifications older than N days.
- `MANTIS_AUDIT_RETENTION_DAYS` — delete append-only audit events older than N days.
- `MANTIS_SESSION_RETENTION_DAYS` — delete revoked or expired dashboard sessions older than N days. Active sessions are not affected.

## Dev inbox

- `ENABLE_DEV_INBOX=1` — enable the in-memory `/inbox` webhook capture and `/api/inbox` JSON API. The `/inbox/<slug>` capture endpoint is unauthenticated by design (so it can receive webhooks), but reading or clearing the buffer (`GET`/`DELETE /api/inbox`) requires an API key or dashboard session. Leave off in production.

## Docker and tunnels

- `MANTIS_BIND_HOST` — compose host bind address, default `127.0.0.1`.
- `MANTIS_HOST_PORT` — compose host port, default `3000`.
- `TS_AUTHKEY`, `TS_HOSTNAME`, `TS_PRIVATE_HOSTNAME`, `TS_PUBLIC_HOSTNAME`, `TS_EXTRA_ARGS` — Tailscale sidecar configuration.
- `CLOUDFLARE_TUNNEL_TOKEN` — Cloudflare Tunnel sidecar token.

## Apple Wallet

Apple Wallet is configured with env vars — mount the certificate and secrets
with your deploy (e.g. docker secrets), not through the app. The admin page at
`/settings/wallet` is read-only: it shows whether Wallet is configured and from
which source. Earlier versions had a dashboard upload form that stored the
config in the database; a leftover DB config still works (env vars take
precedence) but can only be cleared from that page, not re-saved.

Required to enable `.pkpass` generation:

- `APPLE_PASS_CERT_PATH` — Pass Type ID `.p12` certificate.
- `APPLE_PASS_CERT_PASS` — password for the `.p12`.
- `APPLE_PASS_TEAM_ID` — 10-character Apple Team ID.
- `APPLE_PASS_TYPE_ID` — Pass Type ID, for example `pass.com.example.mantis`.
- `APPLE_PASS_AUTH_SECRET` — random secret used to derive per-pass Wallet auth tokens.

Optional:

- `APPLE_PASS_WWDR_PATH` — Apple WWDR intermediate PEM override. Mantis also bundles a WWDR cert.
- `APPLE_PASS_ICON_PATH` — custom 58x58 PNG icon.
- `APPLE_PASS_LOGO_PATH` — custom 160x50 PNG logo.
- `APPLE_PASS_ORG_NAME` — pass organization name, default `Mantis`.
- `APPLE_PASS_APNS_KEY_PATH` — APNs `.p8` auth key for pass-update pushes.
- `APPLE_PASS_APNS_KEY_ID` — APNs key ID.
- `APPLE_PASS_APNS_SANDBOX=1` — use APNs sandbox instead of production.
