---
title: "File keys"
description: "Generate bait files that fire a Mantis trigger when opened or rendered."
---

Mantis can generate 22 server-backed artifacts, in two classes. Most are
**document formats** that embed the key URL so the trigger fires when a viewer
renders the file; NFC and Wallet artifacts fire through the platform action they
are designed for. The **[credential and config stores](#credential-and-config-stores)**
are different — they sit where an intruder who already has a shell goes looking,
and fire when the URL inside them is *used*, not when the file is opened.

| Format | Mechanism | Best in | Notes |
|---|---|---|---|
| `.docx` | External-image relationship in OOXML | Word, LibreOffice Writer | Most reliable — fires on render, also from email attachments after "Enable Editing" |
| `.xlsx` | Same external-image trick, attached to a worksheet drawing | Excel, LibreOffice Calc | Identical reliability to DOCX |
| `.pptx` | Same external-image trick on slide 1 | PowerPoint, Keynote (some), LibreOffice Impress | Same as above |
| `.pdf` | **Combo**: `/OpenAction → /URI` + clickable `/Link` annotation | Adobe Reader, Foxit, most enterprise PDF readers | Less reliable — Chrome's PDFium viewer doesn't fire OpenAction; macOS Preview doesn't either. The clickable link covers the "user reads + clicks" case in those viewers. |
| `.rtf` | `INCLUDEPICTURE` field referencing the trigger URL | Word, WordPad, TextEdit | Beacons on open like `.docx`, but as plain text it survives being opened in a text editor, and WordPad/TextEdit render it without the Protected-View banner `.docx` inherits from the Mark-of-the-Web. The `\d` switch re-fetches on every open, so a re-opened file fires again. |
| `.zip` (`folder`) | Honey-directory bundle of 9 bait files | Shared drives, unpacked project folders | Each file in the extracted folder triggers the same key |
| `.pdf` (`nfc-label`) | Printable QR/NFC sticker label | Physical tags, asset labels | The PDF does not fire by itself; the scan/tap opens the key URL |
| `.pkpass` (`apple-wallet`) | Signed Apple Wallet pass with web-service callbacks | iPhone Wallet | Requires Wallet config; install, uninstall, and fetch callbacks record hits |
| `.svg` | `<image href>` referencing the trigger URL | Browsers, some image viewers, photo libraries | Apps that raster-thumbnail may not fire on preview — opening the original always does |
| `.html` | `<img src>` in a standalone page | Any browser, web-clip notes | Fires on first render |
| `.md` | `![](URL)` image syntax | Joplin / Trilium / Logseq / Gitea README | Fires when the renderer loads images |
| `.eml` | RFC 5322 message with HTML body `<img src>` | Thunderbird, Apple Mail, mail-archive previews | Fires on message render |
| `.ics` | iCalendar event with `ATTACH;FMTTYPE=image/png` + `URL` | Apple Calendar, some CalDAV clients | Behavior varies by client |
| `.vcf` | vCard 4.0 with `PHOTO;VALUE=URI` | macOS / iOS Contacts, CardDAV clients | Fires when the contact's avatar renders |

## Credential and config stores

The remaining eight formats are a different class of bait. Instead of beaconing
when a viewer renders them, they carry the trigger URL in the slot a real file of
that kind would — and fire when someone (or a tool they point at it) *uses* that
URL. These are the files an intruder who already has a shell goes looking for,
and the ones infostealer and forensic tooling greps by name, so a bait URL in one
is found by exactly the person you want to catch. Every embedded secret is a
documented example value (AWS's own `AKIAIOSFODNN7EXAMPLE`, Stripe's published
test key) or generated nonsense, so nothing here is a live credential anywhere.

Because the filename *is* the disguise, most of these keep the name the real thing
has rather than taking the memo — a cookie jar named `payroll-laptop.txt` is not a
cookie jar.

| Format | Saved as | Fires when |
|---|---|---|
| `cookies` | `cookies.txt` | A stolen jar is replayed. The bait cookie is path-scoped to the canary, so curl / wget / yt-dlp or any "export cookies" tool that reloads it hits the URL exactly. |
| `bookmarks` | `bookmarks.html` | The file is opened in a browser (the bait's `ICON_URI` is fetched on render) **or** the bait bookmark — an internal VPN portal / admin console — is clicked. |
| `env` | `.env` | A tool reads the file and resolves `API_BASE_URL` against the canary. (`DEPLOY_WEBHOOK_URL` points at `/hooks/deploy` on the same host, which has no route — it is plausible filler, not a second trigger.) |
| `aws-credentials` | `credentials` | The AWS CLI or an SDK is pointed at the profile — it honours the profile's `endpoint_url`, so calls resolve against the canary rather than AWS. |
| `netrc` | `.netrc` | curl, wget, git or ftp authenticate to the canary host. `.netrc` is auto-consumed, so this fires without the file ever being opened. |
| `kubeconfig` | `config` | Someone reads the file and curls the `server:` URL to see what cluster it is. (kubectl appends its own API paths and 404s, so a real `kubectl get pods` won't register — this catches the read.) |
| `ovpn` | `<memo>.ovpn` | Someone follows the profile-update URL in the file. OpenVPN speaks its own protocol, so pointing the client at an HTTP canary won't fire — this is discovery bait, a weaker trigger than a document beacon, and the dashboard preset says so. |
| `rdp` | `<memo>.rdp` | Someone follows the `workspacefeedurl` in the file. Like `.ovpn`, RDP won't beacon on its own; the hit comes when a human opens the URL. |

See **[self-hosted apps](/self-hosted-apps)** for per-app recipes (Immich, Paperless, Joplin, Vaultwarden, dashboards, code hosts, etc.).

```bash
# Create key + generate the formats supported directly by `mantis new`
mantis new "Q4 forecast" \
  -w http://localhost:3000/inbox/q4 \
  --docx ./forecast.docx \
  --xlsx ./forecast.xlsx \
  --pptx ./forecast.pptx \
  --pdf  ./forecast.pdf \
  --svg  ./forecast.svg \
  --html ./forecast.html \
  --md   ./forecast.md \
  --eml  ./forecast.eml \
  --ics  ./forecast.ics \
  --vcf  ./forecast.vcf \
  --folder ./forecast-bundle.zip \
  --qr ./forecast-qr.png

# Download artifacts for an existing key, including Wallet/NFC formats
mantis download <key-id> --docx ./out.docx
mantis download <key-id> --pdf ./out.pdf
mantis download <key-id> --nfc-label ./nfc-label.pdf
mantis download <key-id> --apple-wallet ./mantis.pkpass

# Credential/config-store bait — save under the real thing's name
mantis download <key-id> --env ./.env
mantis download <key-id> --netrc ./.netrc
mantis download <key-id> --aws-credentials ./credentials

# Dashboard: key detail page → "file keys" card has download links for all formats
# API: GET /api/keys/<id>/download?format=docx|xlsx|pptx|pdf|folder|nfc-label|apple-wallet|svg|html|md|eml|ics|vcf|rtf|cookies|bookmarks|env|aws-credentials|netrc|kubeconfig|ovpn|rdp  (Bearer or session)
```

**Office reader caveats**:
- ✅ Microsoft Office desktop apps — fetch external image on render (subject to **Protected View** for files marked "from internet"; first "Enable Editing" click triggers).
- ✅ LibreOffice (Writer/Calc/Impress) — fetches external content by default.
- ⚠ Office on the web / Office 365 in browser — depends on tenant policy.
- ❌ macOS Quick Look — does not render external content.

**PDF reader caveats**:
- ✅ Adobe Acrobat Reader — follows `/OpenAction → /URI` (may show a one-time trust prompt for the host).
- ✅ Foxit Reader, PDF-XChange — typically follows OpenAction.
- ⚠ Chrome, Edge, Firefox built-in viewers — OpenAction not honored; mantis fires only if user clicks the visible "View the latest version online" link.
- ❌ macOS Preview — OpenAction not honored; click-the-link fallback works.

When you supply no body text, the document formats (`.docx`, `.xlsx`, `.pptx`,
`.pdf`, `.html`, `.md`, `.eml`, `.rtf`) fall back to a built-in multi-paragraph
internal-memo body that opens `CONFIDENTIAL — INTERNAL DISTRIBUTION ONLY`. It
deliberately reads as a genuine document — an earlier default that described
itself as placeholder text gave the canary away to the first person who opened
it — so editing the file to look authentic afterwards is optional polish, not a
required step. The credential/config stores carry their own fixed content and use
neither the body nor the memo — except `bookmarks`, where the memo becomes the
visible name of the bait bookmark, so give that key a memo that reads like a real
bookmark rather than one that names it as a canary. The `.svg` / `.ics` / `.vcf` / NFC / Wallet formats
have no multi-paragraph document body to fall back on either — instead they
surface the key memo/title in their title, summary, name, or pass field, and
`.ics` / `.vcf` route any body you do supply into the event `DESCRIPTION` /
contact `NOTE` (falling back to that same title when you give none).

The key memo and title flow into these artifacts (document properties, calendar/contact fields), so Mantis sanitizes them on generation: control bytes illegal in XML 1.0 are stripped from the Office / SVG / HTML formats, and a lone carriage return is normalized in the line-oriented `.ics` / `.vcf` formats — both so a memo carrying stray control characters can't produce a file that silently fails to open or that injects a forged property line.

Apple Wallet artifacts require an Apple Developer Pass Type ID certificate. Set
the `APPLE_PASS_*` env vars or configure `/settings/wallet` as an admin. If
Wallet is not configured, `format=apple-wallet` returns `503 not_configured`.
