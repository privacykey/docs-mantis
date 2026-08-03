---
title: "Updating"
description: "Update commands for the server, CLI, edge worker, IoT helper, and host installers."
---

Pick the row that matches how each component was installed. After bumping the server, run `mantis doctor` to confirm CLI/server compatibility.

<Warning>
**One-time step when upgrading to ≥ v0.1.2:** the server now requires `MANTIS_API_KEY_PEPPER`, a base64 secret used as the HMAC key for hashing API keys at rest. Generate one with `openssl rand -base64 32` and set it in your `.env` (or your PaaS secret store) before redeploying. Existing API keys keep working — the verifier accepts the old pre-pepper SHA-256 form and opportunistically upgrades each row on next use. Skip this step and the server will refuse to boot with a clear "Missing required env: MANTIS_API_KEY_PEPPER" message. See [Configuration → Required](/configuration#required) for the full rationale.
</Warning>

| Component | Install method | Update |
|---|---|---|
| **Server** | Docker (`docker compose up -d`) | `git pull && docker compose up -d --build` — `AUTO_MIGRATE=1` (set in `docker-compose.yml`) runs new migrations on container start. |
| **Server** | Local dev (`pnpm run dev`) | `git pull && corepack enable && pnpm install && pnpm run db:migrate` — then restart `pnpm run dev`. |
| **Server** | Railway / Render (Git-tracked) | `git push` to the tracked branch — both auto-redeploy. Migrations run on boot via `AUTO_MIGRATE=1`. |
| **Server** | Fly.io launcher | `git pull && bash deploy/fly-launch.sh --app <name> --region <region>` — safely reuses the app/database and does not rotate the API-key pepper. If `fly.toml` is already configured, `git pull && fly deploy --app <name> --config fly.toml` is the shorter equivalent. |
| **CLI** | Homebrew (`brew install privacykey/tap/mantis`) | `brew update && brew upgrade mantis`. |
| **CLI** | Direct tarball from [releases](https://github.com/privacykey/mantis/releases?q=cli-v) | Download the new `mantis-<platform>.tar.gz`, extract, replace the binary on your `$PATH`. |
| **Edge worker** | `mantis-edge/` via wrangler | `git pull && corepack enable && pnpm install && pnpm --filter @mantis/edge run deploy` — secrets (`MANTIS_EDGE_KEY`, `MANTIS_EDGE_WEBHOOK_ALLOWLIST`) persist across deploys, no re-keying needed. |
| **IoT helper** | `iot-helper/` direct | `git pull && corepack enable && pnpm install && pnpm --filter @mantis/iot-helper run check` — then restart your `mantis-iot-helper.js` process. |
| **Host installers** | Per-machine snippets from `mantis install …` | Existing snippets keep firing as long as the trigger URL hasn't changed — only re-run `mantis install <key-id> --type <type> --out <path>` when a release note flags a snippet-format change. |

To get notified of new releases, **Watch → Custom → Releases** on the GitHub repo — `cli-v*` tags publish CLI binaries, plain `v*` tags publish server releases.
