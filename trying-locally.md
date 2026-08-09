---
title: "Trying it locally"
description: "Run Mantis locally with Docker or a contributor development setup."
---

Two flavours of "running mantis on your laptop": the **Docker quickstart** is for kicking the tyres before you provision a real server; the **local dev** flow is for contributors who want to edit the source.

## Docker quickstart (evaluation)

Run the stack against your laptop with Docker:

```bash
git clone <this repo> mantis && cd mantis
./scripts/setup.sh   # creates .env with a random DB password + API-key pepper
docker compose up -d
docker compose logs mantis | grep "bootstrap API key" -A1
```

`./scripts/setup.sh` (also `pnpm setup`) writes `.env` and generates the two
secrets Compose refuses to start without — `POSTGRES_PASSWORD` (the DB password
the app's `DATABASE_URL` is derived from) and `MANTIS_API_KEY_PEPPER`. It's
idempotent, so re-running leaves existing secrets untouched.

The first boot prints a bootstrap API key. Copy it; it won't be shown again.

Then drive the CLI as usual, just pointing at localhost:

```bash
mantis --key mantis_live_... login --url http://localhost:3000

# The dev image ships an inbox at /inbox; webhook captures land there with
# zero external setup.
mantis new "first mantis" -w http://localhost:3000/inbox/demo
open http://localhost:3000/inbox
mantis hits last --follow
```

When you're ready to move from "trying it" to "running it", pick a real deployment from [Deployment](/deployment) and `mantis --profile prod login --url https://...` against it. The Docker localhost setup is for evaluation only — don't rely on it for canaries that need to fire when you're not at your machine.

## Local dev (for contributors)

The source workspace uses `pnpm@11.1.3` and requires Node `>=25.8.0`.

```bash
corepack enable
pnpm install
cp .env.example .env
pepper="$(openssl rand -base64 32)"
sed -i.bak "s|^MANTIS_API_KEY_PEPPER=.*|MANTIS_API_KEY_PEPPER=$pepper|" .env
rm .env.bak
# edit .env: at minimum set DATABASE_URL and keep MANTIS_API_KEY_PEPPER set

# Start postgres separately (docker run -p 5432:5432 ... or use Neon/Supabase)
pnpm run db:migrate
pnpm run dev
```

First request prints a bootstrap API key to stdout.

## Performance checks

Benchmarks live under [`bench/`](https://github.com/privacykey/mantis/tree/main/bench) and are intentionally local, not CI-gated:

```bash
pnpm run bench:cli                  # CLI startup/rendering overhead
pnpm run bench:edge                 # mantis-edge worker, requires `pnpm --filter @mantis/edge dev` running
MANTIS_BENCH_KEY=mantis_live_... pnpm run bench:server
```
