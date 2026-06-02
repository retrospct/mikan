# Runbook — sync + encryption at rest (ROADMAP #10)

How to verify that opt-in Turso sync works **and** that content is encrypted at rest on
the cloud primary. This is the highest-stakes piece of #10: when sync is enabled, personal
content must never leave the device as plaintext.

There are two tiers. Tier 1 needs no credentials and runs anywhere. Tier 2 is the live
two-device replica loop and needs a Turso database.

---

## What "working properly" means

| Guarantee | How it's enforced | How this runbook proves it |
|---|---|---|
| **Fail closed** — `NEEME_SYNC=on` without a valid key never syncs | `getSyncConfig()` returns `enabled:false` + `disabledReason:'missing-or-invalid-key'` | Tier 1 gate check |
| **Encryption at rest** — the cloud primary holds ciphertext, not plaintext | `items.text`, `todos.title`, `todos.notes` wrapped by AES-256-GCM (`db/crypto.ts`) | Tier 2 `[primary] ciphertext: true` |
| **Cross-device** — a second replica pulls and decrypts | embedded-replica `client.sync()` + same key | Tier 2 `[B] decrypted note: true` |
| **Search after sync** — vector index rebuilds from synced rows | worker `reindexAll()` on boot | Tier 2 `search top-hit is note: true` |
| **Local-first never breaks** — sync failures are soft | worker `runSyncNow()` try/catch; decrypt returns raw on bad key | warnings, never a crash |

---

## Tier 1 — gate check (no credentials, ~1 s)

Confirms the fail-closed behavior: with sync requested but no valid key, the app stays
fully local and makes no network calls.

```bash
pnpm --filter @nimi/desktop test:smoke:sync
```

Expected tail:

```
[gate] on + url + no key => enabled=false reason=missing-or-invalid-key (PASS)
[orchestrate] no Turso creds set — skipping the live two-device loop. … exiting 0.
```

Also run the unit suite (16+ sync-seam tests, incl. the key validator):

```bash
pnpm --filter @nimi/desktop test
```

---

## Tier 2 — live two-device replica loop

### Prerequisites

A Turso database + token + encryption key. Follow **`docs/setup/turso-credentials.md`**
steps 1–5, then export all four (the key is **mandatory** — sync refuses to enable
without it):

```bash
export NEEME_SYNC=on
export NEEME_SYNC_URL=libsql://<db>.turso.io          # turso db show <db> --url
export NEEME_SYNC_AUTH_TOKEN=<token>                  # turso db tokens create <db>
export NEEME_SYNC_ENCRYPTION_KEY=<64-hex>             # generateKey() — see step 5
```

> Running as a **cloud agent**? Put these in the Cursor Dashboard → **Cloud Agents →
> Secrets** instead of exporting them. They inject as env vars into new agent VMs (and are
> redacted in logs), so a fresh agent can run this runbook hands-off.

### Run it (one command)

```bash
pnpm --filter @nimi/desktop test:smoke:sync
```

The script spawns two isolated replicas (separate `NEEME_USER_DATA` dirs, mirroring two
devices): **Device A** captures a note + todo and pushes; the **primary** is inspected
directly to prove ciphertext; **Device B** boots fresh, pulls, decrypts, reindexes, and
searches. It cleans up its own rows from the primary afterward.

### Expected output (success)

```
-- Device A: capture + push --
[A] captured + pushed item <id>
-- Remote primary: at-rest check --
[primary] item present: true | ciphertext: true
[primary] stored: enc:<iv>:<tag>:<ciphertext>…
-- Device B: pull + decrypt + search --
[B] decrypted note: true | search top-hit is note: true | decrypted todo: true
✓ PASS — encrypted note + todo synced A → primary (ciphertext) → B (decrypted).
```

The exit code is `0` on PASS, non-zero on any failed assertion.

### Manual two-device variant (optional)

To watch the loop across two real app instances, launch the Electron app twice with the
same four env vars but different `--user-data-dir`, capture a note in one, and confirm it
appears in the other's archive (see `docs/setup/turso-credentials.md` §"Smoke test").

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `enabled=false reason=missing-or-invalid-key` while you expect sync on | `NEEME_SYNC_ENCRYPTION_KEY` missing or not 64-hex | regenerate with `generateKey()`; export the full 64-hex value |
| `Replication(PrimaryHandshakeTimeout)` / `replicator sync error` | bad/expired token, wrong URL, or no network | rotate the token (`turso db tokens create`), recheck `NEEME_SYNC_URL` |
| `[crypto] decrypt failed (wrong key or corrupt data)` warnings | rows on the primary were encrypted with a **different** key | use the same key across devices; warnings are non-fatal (raw value returned) |
| `[primary] ciphertext: false` | sync ran without a key (older build) or key was unset on Device A | ensure the key is set before capturing; wipe + retry |

> The "wrong key" warning is by design: `decrypt()` never throws on bad data — it returns
> the raw value and logs, so a key mismatch degrades gracefully instead of crashing.
