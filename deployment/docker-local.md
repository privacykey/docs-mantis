---
title: "Local Docker"
description: "Run Mantis locally with Docker for evaluation or development."
sidebarTitle: "Local Docker"
---

```bash
git clone <this repo> mantis && cd mantis
./scripts/setup.sh   # creates .env with a random DB password + API-key pepper
docker compose up -d
docker compose logs mantis | grep "bootstrap API key" -A1
```

Mantis is bound to `127.0.0.1:3000` by default. Reachable from the host only. To expose to LAN: set `MANTIS_BIND_HOST=0.0.0.0` in `.env`.

`./scripts/setup.sh` (also `pnpm setup`) generates the two required secrets into
`.env`: `POSTGRES_PASSWORD` — the single source of truth for the database
password, from which Docker Compose derives the app's `DATABASE_URL` — and
`MANTIS_API_KEY_PEPPER`. It's idempotent, so re-running leaves existing secrets
untouched. Compose refuses to start if either is empty, so `cp .env.example .env`
alone is not enough. Keep the pepper stable for that database; rotating it
invalidates existing API keys.

The Docker localhost setup is for **evaluation only** — don't rely on it for canaries that need to fire when you're not at your machine.
