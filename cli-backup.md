---
title: "CLI backup & restore"
description: "Export all your CLI profiles and plugin manifest into a passphrase-encrypted file, then restore on another machine."
sidebarTitle: "CLI backup"
---

The CLI's `config.json` is plain JSON and trivially copyable, but the secrets that actually make it work — `mantis_live_…` API keys, Cloudflare Service-Auth credentials, and edge-worker AES keys — live in the OS keychain and can't be `scp`'d. `mantis backup` and `mantis restore` cover the full set: every profile's config + secrets plus your installed-plugin manifest, packed into a single passphrase-encrypted JSON file.

Keep the resulting file private: attach it to a 1Password / Bitwarden / Doppler vault entry, or stash it in encrypted storage. It is encrypted, but it holds full API keys, and anyone with a copy can try passphrases offline — so use a strong passphrase and don't commit it to a repository other people can read. `mantis backup` warns when the output path is inside a git work tree. Lose the passphrase and the contents are unrecoverable, by design.

## Migrating to a new machine

```bash
# On the old machine
mantis backup --out ~/Vault/mantis-backup.json
# Prompts for a passphrase twice.

# On the new machine — install the CLI first
brew install privacykey/tap/mantis
mantis restore ~/Vault/mantis-backup.json
# Prompts for the passphrase once. Restores config, every profile's
# keychain entries, and re-installs plugins from their source.
```

## What's included

| Item | Where it normally lives | In the bundle? |
|---|---|---|
| Profile metadata (base URL, key prefix, CF Access mode, edge worker URL) | `~/.config/mantis/config.json` | ✅ |
| Active-profile pointer | `~/.config/mantis/config.json` | ✅ |
| `mantis_live_…` API keys | OS keychain (`mantis-cli` service) | ✅ |
| Cloudflare Access Service-Auth credentials | OS keychain (`mantis-cli-cf` service) | ✅ |
| Edge AES keys | OS keychain (`mantis-cli-edge` service) | ✅ |
| Plugin manifest (`name`, GitHub `owner/repo`, pinned commit SHA, version) | `~/.config/mantis/plugins.lock.json` | ✅ |
| Plugin contents (the `~/.config/mantis/plugins/<name>/` tree) | Disk | ❌ — restored via `mantis plugin add <source>@<sha>` |
| Local-path plugins (`mantis plugin add ./some/dir`) | Disk | ❌ — not reproducible on another machine; backup lists them as skipped |
| `~/.cloudflared/` JWTs | Disk | ❌ — owned by the `cloudflared` binary, regenerated on next login |

Plugins re-install from their original source, so the new machine needs network access to GitHub during `restore`. Use `--skip-plugins` if you want to defer that.

## Format

The bundle is plain JSON. Top-level fields are the encryption envelope; everything sensitive lives inside `ciphertextB64`.

```json
{
  "format": "mantis-backup-v1",
  "createdAt": "2026-05-15T09:30:00.000Z",
  "encryption": {
    "cipher": "AES-256-GCM",
    "kdf": "scrypt",
    "kdfParams": { "N": 32768, "r": 8, "p": 1 },
    "saltB64": "…16 random bytes…",
    "nonceB64": "…12 random bytes…"
  },
  "ciphertextB64": "…encrypted payload + GCM auth tag…"
}
```

- **scrypt** (N=32768, r=8, p=1) — interactive-password parameters, ~64 MiB working set
- **AES-256-GCM** — authenticated encryption; tampering with the file fails closed
- **Random salt + nonce per backup** — two backups of identical data produce different ciphertexts
- **Format tag** — checked on restore, so the CLI can evolve the format without silently breaking old bundles

The file is written with mode `0600` (owner-only).

## Flag reference

### `mantis backup`

| Flag | What it does |
|---|---|
| `-o, --out <file>` | Where to write the bundle. Default `./mantis-backup.json`. |
| `--only <name>` | Back up just one profile. Default is all profiles. |
| `--passphrase-stdin` | Read the passphrase from stdin instead of prompting (for scripts piping a vault into the CLI). |
| `--passphrase-env <VAR>` | Read the passphrase from the named environment variable. |

### `mantis restore`

| Flag | What it does |
|---|---|
| `<file>` | Required. Path to the bundle produced by `mantis backup`. |
| `--overwrite` | Replace profiles + keychain entries when names collide with profiles already on the target machine, or when a bundle profile points at a server that already has a different stored credential. Default: skip those, print which were skipped. |
| `--skip-plugins` | Don't re-install plugins from the manifest. You can run `mantis plugin add` manually later. |
| `--passphrase-stdin` | Read the passphrase from stdin. |
| `--passphrase-env <VAR>` | Read the passphrase from the named environment variable. |

**Inline `--passphrase <value>` is intentionally not offered.** It would leak into shell history, `ps`, and CI logs. Use one of the stdin / env-var forms for automation.

## Automation examples

Pipe a passphrase from a password manager (1Password CLI shown):

```bash
op read "op://Personal/Mantis Backup/passphrase" \
  | mantis backup --out ./mantis-backup.json --passphrase-stdin

op read "op://Personal/Mantis Backup/passphrase" \
  | mantis restore ./mantis-backup.json --passphrase-stdin
```

Restore via env var (avoids exposing the passphrase to other processes via stdin pipes):

```bash
export MANTIS_BACKUP_PASS="$(op read 'op://Personal/Mantis Backup/passphrase')"
mantis restore ./mantis-backup.json --passphrase-env MANTIS_BACKUP_PASS
unset MANTIS_BACKUP_PASS
```

Routine backup in cron / launchd, encrypted by a passphrase you've already burned into the env:

```cron
17 3 * * * MANTIS_BACKUP_PASS=$(cat /etc/mantis-passphrase) \
  /opt/homebrew/bin/mantis backup \
    --out /var/backups/mantis-$(date +\%F).json \
    --passphrase-env MANTIS_BACKUP_PASS
```

## Security notes

- The bundle is **only as strong as its passphrase**. scrypt slows down brute-forcing but does not eliminate it. Use a long, high-entropy passphrase (diceware-style, ≥ 5 words) if the file is going to live anywhere shared.
- If the file leaks but the passphrase doesn't, contents stay confidential. If the passphrase leaks, contents are recoverable in seconds — rotate API keys (`mantis login` again) on every profile.
- A wrong passphrase and a corrupted-/-tampered bundle are indistinguishable at the AES-GCM layer. The CLI reports "wrong passphrase or corrupted file" — both are real possibilities, in that order of likelihood.
- The plugin re-install during `restore` runs `mantis plugin add <source>@<sha>`. If a plugin source repo has been deleted, transferred, or had its history rewritten since the original install, the re-install will fail (and is reported as a failed plugin, not a failed restore). The bundle does not carry the plugin code as a fallback.

## When NOT to use this

- **Sharing access with a teammate.** Send them a fine-grained API key from your Mantis server instead — backups carry every secret you own, not a scoped subset.
- **Backing up the Mantis server data.** That's [`deployment/backups.md`](/deployment/backups) — Postgres dumps of hits, audit log, wallet config, etc. `mantis backup` only covers your local CLI state.
- **Synchronising two laptops in real time.** Use two profiles on each machine pointed at the same backend, and re-run `mantis login` on the second laptop. The backup file is a point-in-time snapshot, not a continuously-synced settings sync.

## Related

- [Getting started — step 4: set up two profiles for resilience](/getting-started)
- [Postgres backups (server side)](/deployment/backups)
- [Updating](/updating)
