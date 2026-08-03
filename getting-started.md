---
title: "Getting started"
description: "Install the CLI, choose a backend, log in, and create your first Mantis key."
---

The CLI is the recommended way to drive mantis — the dashboard is a nice browser for hits, but the CLI does everything the dashboard does plus the things the dashboard doesn't (multi-profile, installer snippets, bulk-create, scriptable JSON output). Five steps from zero to a working canary (one of them optional):

## 1. Install the CLI

```bash
brew install privacykey/tap/mantis
```

That gives you `mantis` on `$PATH` with shell completions, a man page, and the auto-update path from the Homebrew tap. (Building from source also works — see [`cli/README.md`](https://github.com/privacykey/mantis/tree/main/cli#install-from-this-repo) for `npm link` instructions.)

## 2. Pick where mantis lives

The CLI talks to either of two backends, with the same command surface:

| Backend | What it gives you | Where it runs |
|---|---|---|
| **Stateful server** (`mantis`) | Dashboard, hit history, audit log, multiple destinations per key, key revocation, monitor/status, optional Apple Wallet passes | Your own server. Docker Compose on a VPS, the [one-command Fly.io launcher](/deployment/fly), or the [Railway / Render guides](/deployment). **Don't run this on your laptop as your primary backend** — your laptop's not on the public internet at 3am when the canary fires. |
| **Cloudflare Worker** (`mantis-edge`) | Sub-50ms response from the CF edge, no DB to host, "anyone with the AES key can mint", URLs are self-contained encrypted blobs | Cloudflare's edge — you deploy a single Worker via `pnpm --filter @mantis/edge run deploy` from the source checkout (see [`mantis-edge/`](https://github.com/privacykey/mantis/tree/main/mantis-edge)) |

You can use **both**. Most people deploy the stateful server for primary tripwires (the ones you want a timeline + multi-destination management for), and reach for the edge variant for hand-off URLs that just need to fire a webhook without a central log.

## 3. Log in

For the stateful server:

```bash
mantis login
# interactive: prompts for server URL + API key
```

For the edge worker (one-time, after you deploy the worker per [`mantis-edge/README.md`](https://github.com/privacykey/mantis/tree/main/mantis-edge)):

```bash
mantis edge keygen                       # makes a 32-byte AES key
pnpm --filter @mantis/edge exec wrangler secret put MANTIS_EDGE_KEY
mantis edge set-key https://mantis-edge.<your-subdomain>.workers.dev
```

Credentials live in your OS keychain — never on disk in plaintext. See [`cli/README.md`](https://github.com/privacykey/mantis/tree/main/cli) for storage details.

## 4. (Recommended) Set up a second profile for resilience

Run a second backend (or share with a teammate's deployment) so that if one is down for maintenance, you can still mint and inspect keys. Profiles live in `~/.config/mantis/config.json`; the CLI stores each profile's API key in a separate keychain entry.

```bash
mantis --profile primary login --url https://mantis.example.com
mantis --profile backup  login --url https://mantis-fallback.example.com  --no-switch

# Day-to-day: stay on `primary`
mantis new "ssh on prod-bastion" --install shell --ssh-only --out ~/.zshrc.d/mantis.sh

# When `primary` is unavailable: one-off override
mantis --profile backup new "urgent canary"

# Or switch the active profile entirely:
mantis profile use backup
mantis whoami
```

Caveat worth knowing: a key minted on `primary` only exists on `primary`. Profiles don't replicate state — they let your *CLI* keep working when one backend is down, and they let you split keys across deployments by purpose (`prod` / `staging` / `personal` / `home-lab`). For genuine URL-level redundancy where the trigger URL itself doesn't depend on any one host, use `mantis edge mint` — encrypted edge URLs decrypt purely from the Cloudflare Worker secret and have no per-key server state.

Once you have a few profiles configured, snapshot them with [`mantis backup`](/cli-backup) into a passphrase-encrypted file so a new machine is one `mantis restore` away from your full setup — keychain entries, plugins, the lot.

## 5. Create your first key

```bash
mantis new
# bare invocation launches the interactive wizard (memo → installer? →
# destinations loop → expiry → copy → summary/edit)
```

…or as a one-liner if you already know what you want:

```bash
mantis new "ssh on prod" \
  --notify-webhook https://discord.com/api/webhooks/... \
  --install shell --ssh-only \
  --out ~/.zshrc.d/mantis.sh
```

That single command creates the server-side key, registers the Discord webhook destination (fires an activation ping right away), and writes the SSH-only shell snippet into your zshrc.d. Reload your shell and the next SSH login fires a Discord notification.

For the stateless equivalent against the edge worker:

```bash
mantis edge mint \
  --worker https://mantis-edge.<sub>.workers.dev \
  --webhook https://discord.com/api/webhooks/... \
  --channel discord \
  --install shell --ssh-only \
  --out ~/.zshrc.d/mantis.sh \
  --test
```

`--test` fires a synthetic hit so you confirm the chain works before handing the URL off.

For spreadsheet-driven setup (one row, one canary), bulk-create writes the URLs back into a CSV:

```bash
mantis bulk-create \
  --csv smart-home-areas.csv \
  --out smart-home-areas-with-urls.csv \
  --memo-template "{{area}} - {{device}}"
```

See [`cli/README.md`](https://github.com/privacykey/mantis/tree/main/cli) for the full command reference and [`COMMAND_MAP.md`](https://github.com/privacykey/mantis/blob/main/cli/COMMAND_MAP.md) for the option matrix.

## Browse hits in the dashboard (optional)

The web dashboard at `/keys` is handy for clicking through a key's hits and seeing the full headers/UA breakdown. The CLI exposes the same data:

| Dashboard | CLI |
|---|---|
| `/keys` | `mantis list` |
| `/keys/<id>` | `mantis show <id>` or `mantis hits <id> --follow` |
| `/keys/new` | `mantis new` |
| `/inbox` (dev only) | `mantis hits last --follow` against a key pointing at `/inbox/demo` |

The dashboard authenticates by exchanging your API key for an httpOnly
`mantis_session` cookie. The cookie contains an opaque session token; the
database stores only its SHA-256 hash. Logout revokes the session row and
clears the cookie.
