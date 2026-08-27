# docs-mantis

The Mintlify documentation source for [`privacykey/mantis`](https://github.com/privacykey/mantis), a self-hostable canary key service.

Production is a Cloudflare Worker serving the static export as assets
([`wrangler.jsonc`](wrangler.jsonc)). `just deploy` builds and publishes it.
**Hostname:** `docs.mantis.privacykey.org` *(DNS not configured yet)*

[![Project status](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fprivacykey%2F.github%2Fmain%2Fbadges%2Fdocs-mantis.json)](https://github.com/privacykey/.github/blob/main/STATUS.md#docs-mantis)

<!-- disclosure:start -->
> [!WARNING]
> **Project status.** The badge above is generated from [the privacykey status list](https://github.com/privacykey/.github/blob/main/STATUS.md), which says what I promise for this project and every other one.
<!-- disclosure:end -->

---

## Read the docs

The published site is not live yet — no docs domain resolves for this project at the moment, so there is nothing to link here. Until it is published, read the pages in this repository directly: they are ordinary Markdown with Mintlify frontmatter, and GitHub renders them.

Start at [`index.mdx`](./index.mdx), or jump to [Getting started](./getting-started.md).

## Run it locally

```bash
npm run dev
```

That runs `npx mint@latest dev`, which serves the site at `http://localhost:3000`. There is no lockfile and nothing to install first — the Mintlify CLI is fetched on demand.

Before opening a pull request, run the same two checks CI runs:

```bash
npm run validate     # mint validate — the Mintlify build
npm run check-links  # mint broken-links
npm run check        # scripts/check-docs.mjs — nav, anchors, frontmatter, stray JSX
```

If you have [`just`](https://github.com/casey/just) installed, `just run` and `just lint` are shorthands for the same commands.

## File layout

Pages live at the repository root, except the deployment guides which live under `deployment/`. `docs.json` holds the theme, colours and navigation; `style.css` carries the small CSS override for the nav logo. Both `README.md` files are listed in `.mintignore` — they are for GitHub readers, not part of the site.

The navigation groups in `docs.json`, and the files behind them:

**Start** — [`index.mdx`](./index.mdx) (site landing page), [`getting-started.md`](./getting-started.md) (CLI install to first key, in five steps), [`trying-locally.md`](./trying-locally.md) (Docker evaluation, local-dev setup for contributors, benchmarks), [`use-cases.md`](./use-cases.md) (defensive, detective, operational, and adversarial-research patterns).

**Deployment** — [`deployment/index.mdx`](./deployment/index.mdx) is the group root and the chooser between local, tunnelled and PaaS options. Then [`docker-local.md`](./deployment/docker-local.md) (option A), [`tailscale.md`](./deployment/tailscale.md) (B), [`cloudflare.md`](./deployment/cloudflare.md) (C), [`railway.md`](./deployment/railway.md) (E1), [`fly.md`](./deployment/fly.md) (E2), [`render.md`](./deployment/render.md) (E3), [`edge-limits.md`](./deployment/edge-limits.md) (rate limiting, DDoS, WAF), [`backups.md`](./deployment/backups.md) (Postgres backup strategies), and [`edge-deployment.md`](./edge-deployment.md) (the stateless mantis-edge Cloudflare Worker variant).

**Reference** — [`api.md`](./api.md) (endpoints, response kinds, webhook payload shape), [`configuration.md`](./configuration.md) (required and optional environment variables), [`cli.md`](./cli.md) (every command and flag), [`cli-backup.md`](./cli-backup.md), [`updating.md`](./updating.md) (update commands per component), [`changelog.mdx`](./changelog.mdx).

**Features** — [`file-keys.md`](./file-keys.md) (Office/PDF/SVG/HTML/Markdown/email/calendar/contact artifacts, honey-directory ZIP, NFC label PDF, Apple Wallet `.pkpass`), [`honey-directory.md`](./honey-directory.md) (the nine-file `.zip` bundle for shared drives), [`host-events.md`](./host-events.md) (shell / login / boot / wake / network installers, web embeds, NFC, smart home, and the `X-Mantis-*` header reference), [`uptime-kuma.md`](./uptime-kuma.md) (fan-out via Kuma's notification channels), [`reliability.md`](./reliability.md) (hit dedup, retry queue, UA and bot parsing).

**Operating** — [`single-user.md`](./single-user.md) (admin / non-admin behaviour), [`operational-notes.md`](./operational-notes.md) (key hashing, disabled-key responses, worker model), [`dev-inbox.md`](./dev-inbox.md) (built-in webhook capture for local dev).

**Recipes** — [`self-hosted-apps.md`](./self-hosted-apps.md), per-app recipes for Immich, Paperless, Joplin, Vaultwarden, dashboards and code hosts.

**Architecture** — [`architecture.md`](./architecture.md), a directory map of the product source tree.

## Adding a page

1. Create the file, either `.md` or `.mdx`, at the root or under `deployment/`.
2. Give it frontmatter. `title` and `description` are required; `icon` and `sidebarTitle` are the only other keys `npm run check` accepts without warning.
3. Register it in `docs.json` under a navigation group, as a path from the repository root with no extension — `host-events`, `deployment/backups`. A page that is not registered will not appear in the sidebar, and `npm run check` warns about unregistered `.mdx` files.
4. Link between pages with root-relative, extensionless paths (`/getting-started`, `/deployment/fly`). Relative `./file.md` links belong only in the two `.mintignore`d README files, which are read on GitHub.
5. Run `npm run check` and `npm run validate`.

## CI

- **Mintlify** (`.github/workflows/mintlify.yml`) validates the build and checks internal links on every pull request and every push to `main`.
- **Link check** (`.github/workflows/linkcheck.yml`) runs `npm run check` and then lychee over external links, on content changes and weekly on Mondays. A scheduled failure opens an issue.
- **Sync changelog** (`.github/workflows/sync-changelog.yml`) regenerates `changelog.mdx` daily from GitHub Releases on `privacykey/mantis` and opens a pull request if the file moved. Do not edit `changelog.mdx` by hand.
