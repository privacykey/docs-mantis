---
title: "Fly.io"
description: "Deploy Mantis to Fly.io with one command, Postgres, and safe proxy defaults."
---

The repository includes an idempotent launcher that creates the Fly app,
connects Postgres, sets the required secrets, deploys Mantis, and prints the
first admin API key.

## Quick launch

Prerequisites:

- A Fly.io account and [`flyctl`](https://fly.io/docs/flyctl/install/).
- A local clone of the Mantis repository.
- `fly auth login` completed once.

```bash
git clone https://github.com/privacykey/mantis
cd mantis
fly auth login

bash deploy/fly-launch.sh --app my-mantis --region iad
```

The launcher shows the app-machine and database choices before creating
anything. Add `--dry-run` to print the planned commands, or `--yes` to skip the
confirmation prompt:

```bash
bash deploy/fly-launch.sh \
  --app my-mantis \
  --region iad \
  --dry-run
```

On a first launch, save the `mantis_live_...` admin key printed at the end. It
is shown once and works for both the dashboard login and `mantis login`.

## Database choices

The default is Fly Managed Postgres. It is the supported Fly database product,
but it is billed separately and can cost considerably more than the small
Mantis app machine. The launcher surfaces that before provisioning.

| Option | Behaviour | When to use it |
|---|---|---|
| `--db mpg` | Creates and attaches Fly Managed Postgres. This is the default. | You want the supported, managed Fly option. |
| `--db external` | Imports the `DATABASE_URL` already present in your environment. | You use Neon, Supabase, or another external Postgres provider. |
| `--db unmanaged` | Creates a legacy `fly postgres` machine. | You accept operating and recovering Postgres yourself. |
| `--db none` | Skips database setup. | You will attach or configure Postgres separately before the app can start. |

For an external database:

```bash
DATABASE_URL='postgres://...' \
  bash deploy/fly-launch.sh --app my-mantis --db external
```

## Safe re-runs and configuration checks

Re-running the launcher is safe: it reuses an existing app and database and
refuses to rotate `MANTIS_API_KEY_PEPPER`, because rotating that value would
invalidate every API key.

If `fly.toml` already exists, the launcher leaves it untouched and checks its
public origin before deploying:

- `PUBLIC_BASE_URL` must be a quoted absolute `https://` URL.
- A `*.fly.dev` URL must match the app passed with `--app`.
- An intentional custom HTTPS domain is accepted.
- Missing `TRUST_PROXY_HEADERS` remains a warning so existing deployments are
  not blocked, but it should be fixed before relying on hit IP attribution.

The generated configuration enables trusted proxy headers and pins attribution
to Fly's authoritative `X-Forwarded-For` value. Without those settings,
production deployments record a null client IP. If a custom domain is proxied
through Cloudflare, follow the comments in `deploy/fly.toml.example` and use
`cf-connecting-ip` instead.

## Later deployments

To redeploy from your machine, either re-run the launcher with the same options
or deploy the existing configuration directly:

```bash
fly deploy --app my-mantis --config fly.toml
```

The repository also includes an opt-in
[`fly-deploy.yml`](https://github.com/privacykey/mantis/blob/main/.github/workflows/fly-deploy.yml)
workflow for deploys from `main`. It stays inert until you configure the
app-scoped `FLY_API_TOKEN`, `FLY_APP`, and `FLY_DEPLOY_ENABLED=true` repository
settings described at the top of that file.

## Verify

```bash
curl https://my-mantis.fly.dev/api/health
mantis login --url https://my-mantis.fly.dev
mantis doctor
```

The health response should report `"status":"ok"` and `"db":"ok"`.

Fly concurrency protects the VM, not the public canary URL. For app-layer
rate limits and DDoS guidance, see **[edge limits](/deployment/edge-limits#flyio)**.
