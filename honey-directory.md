---
title: "Honey directory"
description: "Create a ZIP bundle of bait files wired to the same Mantis key."
---

A `.zip` bundle of pre-baited files, all wired to the same key. Drop the extracted folder on a shared drive; the mantis fires when someone opens one of the documents, double-clicks a shortcut, or follows the URL written in a text file.

```bash
mantis new "Q4 Leadership Plans" \
  -w http://localhost:3000/inbox/folder \
  --folder ./honey.zip

# Or from the dashboard: key detail page → "honey directory (zip)" → ↓ folder.zip
# Or API: GET /api/keys/<id>/download?format=folder
```

The unzipped folder contains 9 bait files, each independently triggering the same key:

| File | Trigger when |
|---|---|
| `Q4 Salary Review.xlsx` | Opened in Excel / LibreOffice Calc (Protected View and external-content prompts can hold the fetch back) |
| `Restructuring Memo - Draft.docx` | Opened in Word / LibreOffice Writer (same caveat) |
| `All-Hands Q4 Plans.pptx` | Opened in PowerPoint / LibreOffice Impress (same caveat) |
| `Layoff Schedule 2026.pdf` | Opened in Adobe Reader (`/OpenAction`) or clicked link |
| `passwords.txt` | Someone follows the URL line at the bottom, under the fake credentials. Reading the file alone fires nothing |
| `database-credentials.txt` | Same pattern — fake DB creds + URL to follow |
| `README.txt` | Someone follows the URL in the directory's "what is this" file |
| `Open in Browser.url` | Double-clicked on Windows (Internet Shortcut) |
| `Latest Version.webloc` | Double-clicked on macOS (URL bookmark) |

Note: this does **not** fire automatically when someone browses the folder in Finder/Explorer — that requires DNS infrastructure (a future stage). What it *does* give you is high-surface honeypot detection: a curious user spelunking the directory is likely to open one of the documents or follow one of the URLs, and any of those triggers the alert.

Fake credentials in `passwords.txt` / `database-credentials.txt` use AWS's and Stripe's documented example keys (`AKIAIOSFODNN7EXAMPLE`, `sk_live_4eC39HqLyjWDarjtT1zdp7dc`) — publicly known fakes, not real credentials anywhere.
