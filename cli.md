---
title: "CLI reference"
description: "Every mantis CLI command and flag, verified against the v0.1.6 source."
sidebarTitle: "CLI"
---

The `mantis` CLI is the primary way to work with a Mantis server (and with the
stateless [edge worker](/edge-deployment)). This page documents **every** command
and flag in the CLI, transcribed from the v0.1.6 source. For the conceptual
map — diagrams, mental model, common workflows — see `cli/COMMAND_MAP.md` in the
app repo.

New to the CLI? Run `mantis init` for guided, interactive setup, or `mantis`
with no arguments for a context-aware welcome screen.

<Note>
This reference covers CLI **v0.1.6**. Check yours with `mantis --version`, and
run `mantis doctor` after upgrading the server to confirm compatibility.
</Note>

## Global flags

These can be combined with most commands. They're owned by the root `mantis`
program, so they work the same everywhere.

| Flag | Purpose |
|---|---|
| `--base-url <url>` | Override the stored base URL for this command (env: `MANTIS_BASE_URL`) |
| `--key <key>` | Override the stored API key for this command (env: `MANTIS_API_KEY`) |
| `-p, --profile <name>` | Use a named profile (env: `MANTIS_PROFILE`) |
| `--json` | Emit machine-readable JSON to stdout (NDJSON for streaming commands like `hits --follow` and `watch`) |
| `--output <mode>` | Output mode: `table`, `json`, or `wide` |
| `-q, --quiet` | Suppress human-readable stdout |
| `--no-headers` | Hide table headers |
| `--color <when>` | When to colorize output: `auto`, `always`, `never` (env: `NO_COLOR`, `FORCE_COLOR`) |
| `--debug` | Print stack traces + HTTP request details on failure (env: `MANTIS_DEBUG`) |
| `--timeout <duration>` | Request timeout, e.g. `500ms`, `5s`, `1m` |
| `--retries <n>` | Retry transient GET failures, `0`–`5` |
| `-v, --version` | Print the CLI version |
| `-h, --help` | Show help for any command |

### Environment-only settings

Three settings have no flag — they only exist as environment variables.

| Variable | Default | Purpose |
|---|---|---|
| `MANTIS_ASCII` | (unset) | Set to any value to force plain-ASCII output. The CLI defaults to Unicode glyphs (`…` `·` `←` `🔐`) and already falls back to ASCII on `TERM=dumb` or a non-UTF-8 locale; this is the explicit opt-out for terminals that render them as mojibake anyway. |
| `MANTIS_QUIET` | (unset) | Set to `1` to suppress the one-time keychain notice on stderr. Distinct from `-q, --quiet`, which suppresses human-readable **stdout** — this only silences that advisory. |
| `MANTIS_BULK_CREATE_MAX_BYTES` | `67108864` (64 MiB) | Input-size cap for `mantis bulk-create`, guarding against a pathological CSV (a 10 GB file, or an unclosed quoted field) exhausting memory. Values below 1024, or anything non-integer, are ignored and the default applies. |

### How a command picks its server

Resolution happens when the command runs, in this order:

1. **Ad-hoc** — `--base-url` + `--key` together talk to a one-off server, ignoring profiles.
2. **`--profile <name>`** — use that named profile.
3. **`MANTIS_PROFILE`** — same, from the environment.
4. **Stored current profile** — the default when nothing else is set.

The base URL comes from local config; the API key comes from the OS keychain.
Generated artifacts (files, Home Assistant YAML, NFC URLs, host installers) embed
a **literal trigger URL** at creation time — they don't consult CLI profiles when
they later fire.

<Note>
Any `<id>` argument accepts a full UUID, a unique prefix of at least four hex
characters, or the literal `last` (the most-recently-created key). Example:
`mantis hits last --follow`.
</Note>

---

## Setup & authentication

### `mantis init`

Guided first-time setup — walks you through a server or edge configuration,
interactive. No flags.

### `mantis login`

Store an API key for a profile, creating one if needed.

| Flag | What it does |
|---|---|
| `-u, --url <url>` | Mantis server base URL (skips the prompt) |
| `--key-stdin` | Read the API key from stdin instead of prompting (leak-free for CI) |
| `--no-switch` | Save the profile but don't switch the current profile to it |

### `mantis logout`

Clear stored credentials for a profile (default: current).

| Flag | What it does |
|---|---|
| `--all` | Clear all profiles and the config file |

### `mantis whoami`

Show the current profile: server, key prefix, Cloudflare Access state, and edge
worker. No flags.

### `mantis doctor`

Check CLI config, server health, auth, and split public/private hosts.

| Flag | What it does |
|---|---|
| `--public-url <url>` | Public trigger base URL to verify (auto-detected when a key exists) |

### `mantis detect`

Scan **this** machine for Mantis-style installer artifacts — a defensive,
offline self-audit.

| Flag | What it does |
|---|---|
| `--scope <scope>` | What locations to scan: `user` (default), `system`, or `all` |
| `--verbose` | Include matched line text in the report |
| `--deep` | Also walk `$HOME` for files containing `mantis` / `canarytokens.*` / `canary.tools` patterns (slow) |

---

## Profiles

`mantis profile <subcommand>` — manage CLI profiles (multiple Mantis servers +
edge workers).

| Command | Flags |
|---|---|
| `profile list` (alias `ls`) | none |
| `profile current` | none |
| `profile use <name>` | none |
| `profile show [name]` | none — defaults to the current profile |
| `profile rm <name>` (alias `delete`) | `-y, --yes` (skip confirmation) |
| `profile set-edge <name>` | `--worker <url>` (edge worker base URL), `--clear` (remove the linked worker) |

`profile set-edge` links a default `mantis-edge` worker URL to a profile, which
`mantis edge mint` then uses as its fallback worker.

---

## Cloudflare Access

`mantis cloudflare <subcommand>` — manage Cloudflare Access auth for the Mantis
API. See [Cloudflare deployment](/deployment/cloudflare) for context.

| Command | Flags |
|---|---|
| `cloudflare login` | `-a, --app <url>` — Access application URL (defaults to your Mantis base URL); opens a browser |
| `cloudflare logout` | none |
| `cloudflare set-service-auth` | `--client-id <id>` (ends in `.access`), `--client-secret <secret>`, `--client-secret-stdin` (read the secret from stdin, leak-free for CI) |
| `cloudflare status` | none |

`set-service-auth` configures a Service-Auth client-id + client-secret pair for
headless CLI usage.

---

## Keys

### `mantis new [memo]`

Create a new key, and optionally generate bait artifacts and an installer in one
shot. `[memo]` is a human-readable label.

| Flag | What it does |
|---|---|
| `-N, --notify <spec>` | Destination as `<channel>:<target>`. Channels: `webhook`, `email`, `slack`, `discord`, `teams`. Repeatable. |
| `-w, --notify-webhook <url>` | Shortcut for `--notify webhook:<url>`. Repeatable. |
| `-e, --notify-email <email>` | Shortcut for `--notify email:<email>`. Repeatable. |
| `-r, --response-kind <kind>` | Trigger response shape: `gif`, `empty`, `json`, `redirect`, `html` |
| `--response-payload <json>` | Payload for `json`/`redirect`/`html` responses (JSON) |
| `--expires-at <iso>` | ISO timestamp at which the key disables itself |
| `--copy` | Copy the created key URL to the clipboard |
| `--id-only` | Print only the created key UUID |
| `--url-only` | Print only the created trigger URL |
| `--qr <file>` | Write a PNG QR code of the key URL to this path |

**Bait-file artifacts** (each writes a file containing the canary):

| Flag | Format |
|---|---|
| `--docx <file>` | Word document |
| `--xlsx <file>` | Excel spreadsheet |
| `--pptx <file>` | PowerPoint |
| `--pdf <file>` | PDF |
| `--folder <file>` | Honey-directory `.zip` bundle (multiple bait files) |
| `--svg <file>` | SVG that fires on browser render (Immich/PhotoPrism) |
| `--html <file>` | HTML page that fires on browser open |
| `--md <file>` | Markdown note that fires when rendered (Joplin/Trilium/Gitea) |
| `--eml <file>` | `.eml` email that fires when opened in a mail client |
| `--ics <file>` | Calendar event with an image-attachment URL |
| `--vcf <file>` | Contact card with a PHOTO URI |

**Installer chaining** (template a host snippet right after creation):

| Flag | What it does |
|---|---|
| `--install <type>` | Generate an installer snippet for the new key (`shell`, `macos-login`, `css-background`, …). See [installer types](#installer-types). |
| `--out <file>` | Write the installer snippet to this path (only with `--install`; default: stdout) |
| `--ssh-only` | Wrap `shell`/`shell-sudo` installers in `if [[ -n $SSH_CONNECTION ]]; then … fi` |
| `--hostname <host>` | Expected hostname (required for `--install js-clone-detector`) |

Run `mantis new` with no arguments on a TTY to launch the interactive wizard.

### `mantis bulk-create` (alias `import-csv`)

Bulk-create keys from a CSV and write an output CSV with the generated URLs.

| Flag | What it does |
|---|---|
| `--csv <file>` | Input CSV. **Required.** |
| `-o, --out <file>` | Output CSV. **Required.** |
| `--memo-column <name>` | Column to use as the memo |
| `--memo-template <template>` | Memo template with `{{column}}` placeholders, e.g. `"{{area}} - {{device}}"` |
| `-N, --notify <spec>` | Destination for every row as `<channel>:<target>`. Repeatable. |
| `-w, --notify-webhook <url>` | Webhook destination for every row. Repeatable. |
| `-e, --notify-email <email>` | Email destination for every row. Repeatable. |
| `-r, --response-kind <kind>` | Default trigger response shape: `gif`, `empty`, `json`, `redirect`, `html` |
| `--response-payload <json>` | Default payload for `json`/`redirect`/`html` responses |
| `--expires-at <iso>` | Default ISO timestamp at which created keys disable themselves |
| `--concurrency <n>` | Parallel create requests, `1`–`20` (default `4`) |
| `--fail-fast` | Stop after the first row-level failure |
| `--dry-run` | Validate rows and write the output CSV without creating keys |

The input CSV is capped at **64 MiB**. Raise it with
[`MANTIS_BULK_CREATE_MAX_BYTES`](#environment-only-settings) if you trust the
file.

### `mantis list` (alias `ls`)

List keys.

| Flag | What it does |
|---|---|
| `-n, --limit <n>` | Max number of keys to fetch (default `50`) |
| `-a, --all` | Fetch all pages |
| `--id-only` | Print only key UUIDs |
| `--url-only` | Print only trigger URLs |

### `mantis show <id>`

Show one key.

| Flag | What it does |
|---|---|
| `--copy` | Copy the key URL to the clipboard |
| `--qr-terminal` | Render the key URL as a QR code in the terminal |
| `--id-only` | Print only the key UUID |
| `--url-only` | Print only the trigger URL |

### `mantis last`

Print the id of the most-recently-created key. (Or pass `last` as the `<id>`
argument on any command.) No flags.

### `mantis open [id]`

Open a key's dashboard page in the browser (or the dashboard root).

| Flag | What it does |
|---|---|
| `--dashboard` | Always open the dashboard root, even if an id is supplied |
| `--trigger` | Open the trigger URL instead of the dashboard page — **this fires the canary** |

### `mantis disable <id...>`

Disable one or more keys (preserves hit history). Accepts multiple ids. No flags.

### `mantis enable <id...>`

Re-enable one or more disabled keys. Accepts multiple ids. No flags.

### `mantis rm <id...>` (alias `delete`)

Delete one or more keys and cascade their hits. Accepts multiple ids.

| Flag | What it does |
|---|---|
| `-y, --yes` | Skip confirmation (required on a non-TTY) |

```bash
# Bulk-delete everything
mantis list --id-only | xargs mantis rm -y
```

---

## Artifacts & installers

### `mantis download <id>`

Download generated bait files for an existing key. Each flag writes one file.

| Flag | Format |
|---|---|
| `--docx <file>` | Word document |
| `--xlsx <file>` | Excel spreadsheet |
| `--pptx <file>` | PowerPoint |
| `--pdf <file>` | PDF |
| `--folder <file>` | Honey-directory `.zip` bundle |
| `--nfc-label <file>` | Printable NFC sticker PDF (QR fallback) |
| `--apple-wallet <file>` | Signed `.pkpass` Apple Wallet pass (requires `APPLE_PASS_*` env on server) |
| `--svg <file>` | SVG image (Immich/PhotoPrism) |
| `--html <file>` | HTML page |
| `--md <file>` | Markdown note |
| `--eml <file>` | `.eml` email message |
| `--ics <file>` | Calendar event |
| `--vcf <file>` | Contact card |

### `mantis install <id>`

Generate a host-install or web-embed snippet for a key (built-in or
plugin-provided type). See [Host events](/host-events).

| Flag | What it does |
|---|---|
| `-t, --type <type>` | Installer type (run `mantis install` with no `--type` to see the full list, including plugin types) |
| `-o, --out <file>` | Write the snippet to a file (default: stdout) |
| `-H, --hostname <host>` | Expected hostname (required for `js-clone-detector`; the snippet won't fire on this host or its subdomains) |
| `--ssh-only` | Wrap `shell`/`shell-sudo` installers in `if [[ -n $SSH_CONNECTION ]]; then … fi` so they only fire for SSH-originated shells |

#### Installer types

| Type | Category | Fires when |
|---|---|---|
| `shell` | Host | Shell starts (useful for SSH-login detection) |
| `shell-sudo` | Host | Wrapped `sudo` is invoked |
| `macos-login` | Host | macOS user logs in |
| `macos-boot` | Host | macOS boots |
| `macos-wake` | Host | macOS wakes |
| `macos-network` | Host | macOS network config changes |
| `linux-boot` | Host | Linux boots |
| `linux-wake` | Host | Linux resumes |
| `linux-network` | Host | NetworkManager interface comes up |
| `windows-logon` | Host | Windows user logon |
| `windows-wake` | Host | Windows resumes |
| `windows-network` | Host | Windows network profile connects |
| `css-background` | Web | CSS background image is rendered |
| `js-clone-detector` | Web | Page runs on an unexpected hostname |
| `nfc-ndef` | Tag | NFC tag URL is opened |
| `homeassistant` | Smart home | HA automation calls the generated `rest_command` |
| `scrypted` | Smart home | Scrypted Script sees the selected device event |

Plugins can register additional types; `mantis install` validates against the
union of built-ins plus installed plugins.

---

## Hits & monitoring

### `mantis hits <id>`

Show recent hits for a key (filterable; `--follow` for a live tail).

| Flag | What it does |
|---|---|
| `-n, --limit <n>` | Max hits to fetch (default `50`) |
| `-v, --verbose` | Show full headers |
| `--since <duration>` | Filter to hits within the last duration (e.g. `30s`, `5m`, `2h`, `1d`) or an ISO timestamp |
| `--ip <addr>` | Filter to hits from this exact IP |
| `--bot-only` | Only show hits flagged as bots |
| `-f, --follow` | Stream new hits as they arrive (Ctrl-C to stop) |
| `-i, --interval <seconds>` | Poll interval when `--follow` (default `3`) |

### `mantis watch [id]`

Poll for new hits and print them as they arrive — across all keys, or one.
Omit `[id]` to watch all keys.

| Flag | What it does |
|---|---|
| `-i, --interval <seconds>` | Poll interval in seconds (default `5`) |
| `--id <id>` | **Deprecated** — watch a single key. Use the positional `[id]` instead. |

### `mantis status [id]`

Show monitor state across keys, or details for one (window mode: hits + expiry;
latch mode: hits since reset). Omit `[id]` for a summary across all monitored keys.

| Flag | What it does |
|---|---|
| `-n, --limit <n>` | Max hits to consider (default `50`) |
| `-w, --watch` | Refresh continuously (default interval `5s`) |
| `-i, --interval <seconds>` | Watch interval in seconds (used with `--watch`, default `5`) |
| `--tripped-only` | Only show keys currently tripped (summary mode) |

### `mantis monitor <id>`

Configure the [Uptime Kuma](/uptime-kuma) status endpoint for a key.

| Flag | What it does |
|---|---|
| `-m, --mode <mode>` | Monitor mode: `off`, `latch`, or `window` |
| `--window <seconds>` | Window size in seconds (used with `--mode window`) |

### `mantis reset <id>`

Reset a key's tripped monitor state (latch mode). No flags.

---

## Notifications

`mantis destinations <subcommand>` (alias `dest`) — incrementally manage
notification destinations on a key. Channels: `webhook`, `email`, `slack`,
`discord`, `teams`.

| Command | Flags |
|---|---|
| `destinations list <key-id>` (alias `ls`) | none |
| `destinations add <key-id> [channel] [target]` | `--channel <channel>` (`webhook`/`email`/`slack`/`discord`/`teams`), `--target <target>` (URL or email) |
| `destinations rm <key-id> <destination-id>` (alias `remove`) | none |
| `destinations test <key-id>` | `-y, --yes` (skip the confirmation prompt) |
| `destinations rotate-secret <key-id> <destination-id>` | `-y, --yes` (skip the confirmation prompt) |

- `add` fires an activation ping when the destination is created.
- `test` fires a synthetic hit on the key URL and reports which destinations succeeded.
- `rotate-secret` rotates the HMAC signing secret on a webhook destination; the new secret is shown **once**.

---

## Audit log

`mantis audit log` — list audit events, most recent first (admin keys only).

| Flag | What it does |
|---|---|
| `-n, --limit <n>` | Page size, `1`–`500` (default `100`) |
| `--since <duration>` | Only events within the last duration (e.g. `30s`, `5m`, `2h`, `1d`) or an ISO timestamp |
| `-t, --type <event_type>` | Filter to one event type (e.g. `key.created`, `session.login`) |
| `--actor <api_key_id>` | Filter to events caused by a specific API key id |

---

## Edge worker

`mantis edge <subcommand>` — manage the stateless `mantis-edge` (Cloudflare
Worker) key flow. See [Edge deployment](/edge-deployment).

### `mantis edge keygen`

Generate a 32-byte AES key for an edge worker (prints to stdout). No flags.

### `mantis edge set-key [worker] [key]`

Store an edge AES key in the OS keychain for a given worker URL. `[worker]` is
an alternative to `--worker`; `[key]` is a base64url-encoded 32-byte key
(prompts for paste if omitted).

| Flag | What it does |
|---|---|
| `--worker <url>` | Worker base URL (`https://…`) |
| `--key-stdin` | Read the edge key from stdin instead of prompting (leak-free for CI) |

There is intentionally no `--key` flag here — it would collide with the global
`--key`. Use the positional argument, `--key-stdin`, or the prompt.

### `mantis edge delete-key`

Remove a stored edge key for a worker URL.

| Flag | What it does |
|---|---|
| `--worker <url>` | Worker base URL |

### `mantis edge mint`

Mint a stateless edge URL — no server round-trip, pure local crypto. Run it bare
on a TTY to launch the interactive wizard.

| Flag | What it does |
|---|---|
| `--worker <url>` | Worker base URL (`https://…`); falls back to the current profile's edge worker |
| `--webhook <url>` | Webhook URL the worker POSTs on hit |
| `--channel <channel>` | Destination channel formatter: `webhook`, `slack`, `discord`, `teams` |
| `--response-kind <kind>` | Trigger response shape: `gif`, `empty`, `json`, `redirect`, `html` |
| `--response-payload <json>` | Payload for `json`/`redirect`/`html` responses (JSON) |
| `--memo <text>` | Memo, forwarded to the webhook for context |
| `--expires-at <iso>` | ISO timestamp after which the URL stops working |
| `--edge-key <base64url>` | Override the stored AES key for one mint |
| `--copy` | Copy the minted edge URL to the clipboard |
| `--test` | Fire a synthetic GET to the minted URL and report what the worker says (verifies the chain end-to-end) |
| `--install <type>` | After minting, generate an installer snippet for the URL |
| `--out <file>` | Write the installer snippet to this path (only with `--install`) |
| `--ssh-only` | Wrap `shell`/`shell-sudo` installers in `if [[ -n $SSH_CONNECTION ]]; then … fi` |
| `--hostname <host>` | Expected hostname (required for `--install js-clone-detector`) |

`--edge-key` is named separately from the global `--key` to avoid a collision.

### `mantis edge install <url>`

Generate an installer snippet for a stateless edge URL — the same snippets
`mantis install` produces server-side, but for a minted edge URL. `<url>` is the
URL printed by `mantis edge mint`.

| Flag | What it does |
|---|---|
| `-t, --type <type>` | Installer type (see [installer types](#installer-types)) |
| `-o, --out <file>` | Write the snippet to this path (default: print to stdout) |
| `--ssh-only` | Wrap `shell`/`shell-sudo` installers in `if [[ -n $SSH_CONNECTION ]]; then … fi` |
| `-H, --hostname <host>` | Expected hostname (required for `js-clone-detector`) |
| `--memo <text>` | Memo to embed in the snippet header comment |

---

## Backup & restore

`mantis backup` and `mantis restore` export and re-import your CLI profiles +
plugin manifest as a passphrase-encrypted file. These have a dedicated guide
with format details and automation examples — see
[CLI backup & restore](/cli-backup).

### `mantis backup`

| Flag | What it does |
|---|---|
| `-o, --out <file>` | Write the encrypted bundle to this path (default `./mantis-backup.json`) |
| `--only <name>` | Back up only this profile instead of all of them |
| `--passphrase-stdin` | Read the passphrase from stdin instead of prompting |
| `--passphrase-env <var>` | Read the passphrase from the named environment variable |

### `mantis restore <file>`

`<file>` is a bundle produced by `mantis backup`.

| Flag | What it does |
|---|---|
| `--overwrite` | Replace profiles that already exist on this machine (otherwise they're skipped) |
| `--skip-plugins` | Don't re-install plugins from the manifest |
| `--passphrase-stdin` | Read the passphrase from stdin instead of prompting |
| `--passphrase-env <var>` | Read the passphrase from the named environment variable |

---

## Plugins

`mantis plugin <subcommand>` — manage CLI plugins (third-party installer types +
file formats; installed locally, never on the server).

| Command | Flags |
|---|---|
| `plugin add <spec>` | none — `<spec>` is a GitHub ref (`owner/repo`, `owner/repo@v1.0.0`, `owner/repo@<sha>`) or a local directory |
| `plugin list` (alias `ls`) | none |
| `plugin remove <name>` (alias `rm`) | none |
| `plugin upgrade <name>` | none — refresh from source; errors out if pinned to a commit SHA |

---

## Machine-wide config

`mantis config <subcommand>` — get/set machine-wide CLI defaults (output mode,
color). Stored defaults are applied **below** explicit flags.

| Command | Flags / args |
|---|---|
| `config list` (alias `ls`) | none — show the config file path and current defaults |
| `config get <key>` | `<key>` is `output` or `color` |
| `config set <key> <value>` | `<key>` is `output` or `color`; `<value>` is `table`/`json`/`wide` (output) or `auto`/`always`/`never` (color) |
| `config unset <key>` | `<key>` is `output` or `color` |
| `config path` | none — print the config file path |

---

## Shell completion

`mantis completion <shell>` — print a shell completion script. `<shell>` is
`bash`, `zsh`, or `fish`.

```bash
# Zsh, for example
mantis completion zsh > "${fpath[1]}/_mantis"
```

---

## Related

- [CLI backup & restore](/cli-backup) — passphrase-encrypted profile + plugin export
- [HTTP API](/api) — the JSON API the CLI wraps
- [Configuration](/configuration) — server-side environment variables
- [Updating](/updating) — keeping the server, CLI, and edge worker in sync
- [Host events](/host-events) and [Edge deployment](/edge-deployment) — what the installers and edge URLs do
