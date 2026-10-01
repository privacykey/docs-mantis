---
title: "Single-user by default"
description: "How the default single-user operator model works in Mantis."
sidebarTitle: "Single-user model"
---

Mantis is single-user out of the box. The first API key minted on a fresh
deploy is automatically `is_admin = true` (the bootstrap path sets the flag).
That key is the operator: it sees and manages every key on the instance.
Additional API keys are minted by an admin (`POST /api/api-keys` is
admin-only) and default to **non-admin** — they can only see and manage the
keys they created themselves, and their hit history shows the key's own
notification targets but not the admin's global destinations.

If you only ever mint one API key for your deploy you'll never notice the
distinction; the schema is shaped that way so it's easy to later promote a
shared instance to multi-user. Until then, treat every operator as admin and
keep your bootstrap key safe. Admin privileges are also required for the
instance-wide audit log and the settings pages (global notify destinations,
Apple Wallet status). The `audit log`
(`mantis audit log`, admin-only) records create / update / delete / login /
destination-secret / wallet-config events across the instance.

## Key scope: a second axis

`is_admin` is not the only authorization axis. Every API key also has a
`scope` — `full` or `enroll` — set when it is minted (`POST /api/api-keys` body
`{ scope }`, default `full`). A `full` key behaves as described above. An
`enroll` key is **create-only**: it can call only `POST /api/keys`, and gets
`403` on every other route — it cannot list keys, read hit history, read alert
routing or signing secrets, or log in to the dashboard. The one thing it can
read back is a key it can name: re-posting an `external_id` that already exists
returns that key's trigger URL, `public_id` and expiry (the memo is `null` and
alert routing is never included) even when another API key created it, and the
claim is audited as `key.claimed` with `cross_key: true`. So an enroll key is
safe to embed on managed machines only to the extent your `external_id`s are
hard to guess; `mantis device` derives them deterministically from the machine
name. A full-scope key that did not create the key gets `409` instead. `is_admin` and `enroll`
are mutually exclusive. See [key scope in the HTTP
API](/api#api-key-scope-full-vs-enroll).
