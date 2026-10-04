---
title: "Host-event keys"
description: "Install host snippets that fire Mantis keys on shell, login, boot, wake, and network events."
---

Want to know when *your own machine* boots, logs in, or starts a shell? Create a key, then install one of the generated snippets on the host you want to watch:

| Type | Fires when | Platform |
|---|---|---|
| `shell` | Any shell starts (covers SSH logins) | POSIX (macOS, Linux) |
| `shell-sudo` | You run `sudo` from a configured shell (captures the original command) | POSIX |
| `macos-login` | You log in to the macOS desktop | macOS |
| `macos-boot` | The Mac boots, before any user logs in | macOS (sudo required) |
| `macos-wake` | Mac wakes from sleep | macOS (requires `brew install sleepwatcher`) |
| `macos-network` | Network attaches / Wi-Fi joins / VPN connects | macOS |
| `linux-boot` | systemd brings the network up | Linux (sudo required) |
| `linux-wake` | System resumes from suspend / hibernate | Linux (sudo required) |
| `linux-network` | NetworkManager brings an interface up | Linux (sudo required, NetworkManager) |
| `windows-logon` | Any user logs on | Windows |
| `windows-wake` | System resumes from sleep / hibernate | Windows |
| `windows-network` | Network profile connects (Wi-Fi join, Ethernet, VPN) | Windows |
| `nfc-ndef` | A phone taps an NFC tag and opens the URL | Blank NFC tag (NTAG213/215/216) |

Get the installer for a key via:

```bash
# CLI — prints to stdout + install instructions to stderr
mantis install <key-id> --type macos-login

# Or write directly to a file:
mantis install <key-id> --type macos-login --out ~/Library/LaunchAgents/com.mantis.login.plist

# From the dashboard: key detail page → "install on a host" card → tab → copy/download
# Or API: GET /api/keys/<id>/install?type=<type>  (cookie or Bearer auth)
#         GET /api/keys/<id>/install?type=<type>&format=json  for metadata
```

The snippets are designed to be unobtrusive — backgrounded execution, 3–10s timeouts, output redirected to `/dev/null`. They won't slow your shell startup or hang your boot if the mantis server is unreachable. Boot and wake alarms get one chance per event, often before the network is back, so they retry up to five times over about a minute.

On Windows, the logon task runs as the Users group, in the session of whichever account logs on. The wake and network tasks run as LOCAL SERVICE, so they fire with nobody logged on.

**Example: alert me on every SSH login**

```bash
# 1. Create the key
mantis new "ssh login alert" -w https://my-webhook.example.com

# 2. Generate + install the shell snippet
mantis install <key-id> --type shell --out ~/.mantis.sh
echo 'source ~/.mantis.sh' >> ~/.zshrc

# 3. SSH in (or start any shell) — webhook fires.
```

**Example: alert me when my Mac boots**

```bash
mantis install <key-id> --type macos-boot --out com.mantis.boot.plist
sudo mv com.mantis.boot.plist /Library/LaunchDaemons/
sudo chown root:wheel /Library/LaunchDaemons/com.mantis.boot.plist
sudo launchctl load /Library/LaunchDaemons/com.mantis.boot.plist
```

These keys behave identically to a normal HTTP key server-side — the difference is the install helpers that wire the trigger to host events. The same key can serve any installer type, so you can reuse one key for shell + login + boot if you don't want to discriminate.

## Web-embed snippets (CSS / JS)

In addition to host-event installers, the same `/install` endpoint generates two web-embed snippets you can paste into your own website:

| Type | Fires when | Use case |
|---|---|---|
| `css-background` | The CSS is rendered anywhere (browser loads the URL as a background image) | Detect when someone copies your stylesheet to their own site. **Fires on your own site too** — declare your site's origin on the key so those hits are ignored. |
| `js-clone-detector` | The script runs on a hostname other than the expected one (or any subdomain of it) | Detect site cloning / phishing copies. Includes a runtime hostname check so it does **not** fire on your real site. |

```bash
# CSS embed
mantis install <key-id> --type css-background --out ./mantis-canary.css

# JS embed with hostname check
mantis install <key-id> --type js-clone-detector --hostname example.com --out ./mantis.js
```

Both are also visible as tabs ("web CSS", "web JS") on the key detail page in the dashboard, with the JS tab exposing an inline hostname input field. The dashboard tab regenerates the snippet whenever you change the hostname.

Your own site loads the CSS on every page view. Add your site's origin (for example `https://www.example.com`) under "your own site" on the key page, or as `self_origins` in the API. Hits whose Referer comes from those origins are ignored, so your own visitors can't occupy the dedupe window and hide a cloned site's hit. This needs your pages to send at least an origin Referer — the browser default does; `Referrer-Policy: no-referrer` or `same-origin` does not — and a clone that hot-links your stylesheet instead of copying it is not detected.

The CSS uses partial escape-sequence obfuscation on the URL (`\00006c` for `l`, etc.) so the canary URL is less obvious to a casual reader of the stylesheet. Snippets generated before 0.3.0 used short escapes that usually decoded to a different URL and never fired — regenerate and re-paste them.

The JS snippet sends explicit `?l=<location>&r=<referrer>` query params alongside the canary URL so you can identify the cloning site even when the Referer header is stripped (strict referrer policies, mixed-protocol downgrades, etc.). They are stored with the hit as `x-mantis-page-url` and `x-mantis-page-referrer`.

## Physical snippets (NFC)

The `/install` endpoint also generates an NFC URL record:

| Type | Fires when | Use case |
|---|---|---|
| `nfc-ndef` | A phone taps a written NFC tag and opens the key URL | Server-room stickers, laptop lids, asset labels, network closet doors |

```bash
mantis install <key-id> --type nfc-ndef --out mantis-nfc-url.txt
mantis download <key-id> --nfc-label mantis-nfc-label.pdf
```

Write the generated URL to a blank tag with any NFC writer app. Mantis appends
`?src=nfc`, which the trigger endpoint promotes into `host_context.source = "nfc"`
when the tag is tapped. The printable `nfc-label` PDF is a QR/sticker
companion for the same key; it only fires when scanned or tapped, not when the
PDF itself is opened.

## Smart-home snippets (Home Assistant / Scrypted)

The `/install` endpoint also generates smart-home snippets:

| Type | Fires when | Use case |
|---|---|---|
| `homeassistant` | Any Home Assistant automation calls the generated `rest_command` | Door opened, lock unlocked, automation triggered, Scrypted sensor changed, Apple Home device bridged through HA |
| `scrypted` | A Scrypted Script sees a selected device/interface event | Person/package/vehicle detection from Scrypted Smart Motion Sensor without routing through HA |

```bash
mantis install <key-id> --type homeassistant --out mantis-ha.yaml
mantis install <key-id> --type scrypted --out mantis-scrypted.js
```

Use `--profile` on the `install` command to decide which server the generated
snippet reports to. The snippet stores a literal URL, so changing the CLI's
current profile later does not affect already-installed Home Assistant or
Scrypted automations.

### Drive an action when a hit fires

The snippets above let Home Assistant *trigger* a mantis. The reverse also
works: a `home_assistant` notification destination lets a hit *drive* HA — flip a
switch, cut a VLAN, fire a scene, or push a phone notification. Point it at an HA
webhook automation:

```bash
mantis dest add <key-id> home_assistant https://<your-ha>/api/webhook/<id>
```

Every hit then POSTs a `mantis.hit` JSON payload (memo, IP, user-agent, and the
full `host_context`) to that webhook. The target URL must end in
`/api/webhook/<id>`. To scaffold the HA side, generate a ready-to-paste
automation skeleton — it listens on the webhook, drops the activation ping, and
shows example actions (switch toggle, mobile push, logbook entry). The file
carries an unguessable webhook id; treat it like a secret, because it is the
only credential between Mantis and Home Assistant:

```bash
mantis install <key-id> --type homeassistant-receiver --out mantis-ha-receiver.yaml
```

If Mantis reaches HA over a private/Tailscale address, the SSRF guard blocks it
unless you set `ALLOW_PRIVATE_WEBHOOKS=1` (an instance-wide switch — prefer
restricting egress at the network layer). A refused destination always reports
"destination refused: it does not resolve to a public address"; the server log
has the reason.

Receivers generated before 0.3.0 used a webhook id derived from the key id
(`mantis-<8 hex>`). Generate the file again and re-register the destination to
move to an unguessable id.

For devices that do not expose useful webhooks, [`iot-helper/`](https://github.com/privacykey/mantis/tree/main/iot-helper) can watch LAN neighbor tables and log files, then fire the same Mantis URL for unexpected online/login events.

## What information each installer captures

Each installer sends `X-Mantis-*` headers alongside the hit, which the server parses into a structured `host_context` object exposed on the API + dashboard + CLI.

| Header | Set by | Useful for |
|---|---|---|
| `X-Mantis-Source` | every installer or `?src=` helper | which installer fired (shell / shell-sudo / macos-login / macos-boot / macos-wake / macos-network / linux-boot / linux-wake / linux-network / windows-logon / windows-wake / windows-network / nfc / homeassistant / scrypted / iot-network / iot-log / wallet-installed / wallet-uninstalled / wallet-fetched) |
| `X-Mantis-User` | `shell`, `shell-sudo`, `macos-login`, `macos-network`, `macos-wake`, `windows-logon` | OS account |
| `X-Mantis-Host` | every installer | which of your machines |
| `X-Mantis-SSH-Client` | `shell`, `shell-sudo` (when SSH'd in) | **the SSH client's IP** |
| `X-Mantis-SSH-Connection` | `shell`, `shell-sudo` (when SSH'd in) | full sshd connection tuple |
| `X-Mantis-TTY` | `shell` | pty path; distinguishes interactive from scripted |
| `X-Mantis-Sudo-Cmd` | `shell-sudo` | the args passed to sudo (e.g., `apt update --quiet`) |
| `X-Mantis-Network-Interface` | `linux-network` | interface name (`wlan0`, `eth0`, etc.) |
| `X-Mantis-Event` | Home Assistant / Scrypted / IoT helper | event label (`door-opened`, `person-detected`, `unexpected-online`, `device-login`) |
| `X-Mantis-Device` | Home Assistant / Scrypted / IoT helper | friendly device name |
| `X-Mantis-Entity-Id` | Home Assistant / Scrypted | entity/device id |
| `X-Mantis-Automation` | Home Assistant | automation or scene name |
| `X-Mantis-Area` | Home Assistant / Scrypted | room/area |
| `X-Mantis-Iot-Mac` / `X-Mantis-Iot-Ip` | IoT helper | observed MAC/IP |

(Boot-time installers don't include `X-Mantis-User` because no user is logged in yet. The Windows wake and network tasks run as LOCAL SERVICE, not as a person, and don't send it either.)

The big win is `$SSH_CLIENT` — when someone SSHes into your machine and the shell snippet fires, the mantis records the **SSH client's IP**, not just the machine's own public IP. The dashboard surfaces this prominently as `← <client-ip>` next to the user/host context. The CLI shows the same:

```
$ mantis hits <key-id>
when  ip   who                                              tag   notify
1s    ::1  shell · root · @ prod-bastion · ← 203.0.113.42   curl  ✓1
1s    ::1  shell · alice · @ alice-mbp                      curl  ✓1
```

Empty / missing X-Mantis headers (e.g., a non-SSH local shell, or a boot event with no user) are simply not displayed, so the chip stays compact.
