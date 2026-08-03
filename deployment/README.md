---
title: "Deployment"
description: "Choose how to run Mantis and expose a public trigger URL."
---

The mantis needs a public-reachable URL. Pick the option that matches where you want to run it.

| | What runs where | Public URL via | When this is right |
|---|---|---|---|
| **A. [Local Docker](./docker-local.md)** | Your machine | None (localhost only) | Development, testing, air-gapped use |
| **B. [Docker + Tailscale](./tailscale.md)** | Your machine | Tailscale Funnel (`*.ts.net`) | Personal mantis on a laptop / home server — works behind CGNAT |
| **C. [Docker + Cloudflare Tunnel](./cloudflare.md)** | Your machine | Your own domain on Cloudflare | You already have a Cloudflare-hosted domain; want SSO via Cloudflare Access |
| **E1. [Railway](./railway.md)** | Railway (long-running) | `*.up.railway.app` or custom | Set-and-forget; the worker runs natively (no cron config) |
| **E2. [Fly.io](./fly.md)** | Fly app + managed or external Postgres | `*.fly.dev` or custom | One-command, idempotent launch; broader regional choice |
| **E3. [Render](./render.md)** | Render (long-running) | `*.onrender.com` or custom | Same shape; free tier exists but cold-starts after 15 min idle |

For any of the public options, also see **[edge-limits.md](./edge-limits.md)** for rate-limit and DDoS guidance, and **[backups.md](./backups.md)** for Postgres backup strategies.

## Quick-pick: A vs B vs C (run-on-your-own-hardware variants)

Both B and C give you a public HTTPS URL for mantis running on your own hardware. The differences:

| | Tailscale (B) | Cloudflare (C) |
|---|---|---|
| Need to own a domain? | No (uses `*.ts.net`) | Yes (must be on Cloudflare) |
| Setup steps | ~3 | ~5 |
| Dashboard SSO | Tailnet membership / ACLs in split mode | Cloudflare Access (one app, one policy) |
| DDoS protection | No | Yes (CF edge) |
| Edge regions | Limited Tailscale relays | CF global edge |
| Privacy posture | Tailscale sees traffic metadata | Cloudflare sees all traffic + bodies |
| Free tier | Up to 100 devices | Unlimited tunnels, 50 Access seats |
| Best for | Personal, hobby, private dashboard/API without owning a domain | Custom domain, brand-protection |

## Edge variant

The stateless [`mantis-edge`](https://github.com/privacykey/mantis/tree/main/mantis-edge) Cloudflare Worker is a separate concept: it runs on Cloudflare's edge with no DB, and URLs decrypt purely from the Worker's secret. See [edge-deployment.md](../edge-deployment.md) for the Worker setup.
