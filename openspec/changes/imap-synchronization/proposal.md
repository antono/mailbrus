## Why

Mailbrus currently has no mail sync — it reads a pre-existing notmuch index but cannot
pull email from a server. Users must configure and run external tools (mbsync, offlineimap)
themselves, which breaks cross-platform packaging and prevents mailbrus from functioning
as a standalone client. Adding an embedded IMAP sync engine makes mailbrus self-contained.

## What Changes

- Extend `mailbrus-core` with a `sync` module implementing per-account IMAP sync
  using pimalaya's `email-lib` and `imap-client` — both already in the ecosystem
  (`io-email`/`io-maildir` are already git deps in `mailbrus-core`)
- Add account configuration: TOML config file (`~/.config/mailbrus/config.toml`) with
  typed per-account protocol settings (IMAP for now, schema designed to accommodate JMAP later)
- Add credential storage with two backends: OS keyring via pimalaya `keyring-lib`
  (macOS/Windows/Linux) and Unix `pass` via `prs-lib` (v0.5.7, `backend-gnupg-bin`
  feature — shells out to `gpg`) for power users who manage secrets with GPG;
  config file holds only a credential reference, never secrets
- Add sync state persistence (SQLite) storing per-mailbox `highestModSeq` / `uidValidity`
  for CONDSTORE-based delta sync
- Add notmuch tagging convention: `tag:account:<id>` applied to all messages so the shared
  notmuch index can distinguish accounts
- Expose a `POST /api/sync` endpoint in `mailbrus-server` to trigger sync and stream progress
- **BREAKING**: `mailbrus-server` switches from using the notmuch default config
  (`MaildirReader::open()`) to reading account list from the new config file

## Capabilities

### New Capabilities

- `imap-sync`: IMAP synchronization engine — account config schema, per-account sync
  workers, delta sync via CONDSTORE/QRESYNC, credential lookup from OS keyring or `pass`,
  maildir write + notmuch index update, sync state persistence in SQLite
- `account-config`: Typed TOML account configuration — protocol enum (Imap/Jmap),
  per-account maildir root, credential references, XDG-compliant config path resolution

### Modified Capabilities

- `mailbrus-server-crate`: gains `/api/sync` endpoint and reads account list from config
  file instead of inferring from notmuch root directory listing
- `mailbrus-core-crate`: gains `sync` module, notmuch write access (currently read-only)
  for applying `account:<id>` tags after sync, and credential abstraction (`keyring` or `pass`)

## Impact

- `mailbrus-core`: gains `sync` module, new deps: `email-lib`, `imap-client` (pimalaya),
  `keyring-lib` (pimalaya), `prs-lib` (pass store, `backend-gnupg-bin`),
  `rusqlite` (sync state), `toml` (config parsing)
- `mailbrus-core/Cargo.toml`: existing `io-email`/`io-maildir` git deps superseded or
  complemented by `email-lib` (higher-level pimalaya composition layer)
- `mailbrus-server`: new CLI flag or env var for config file path; `AppState` gains
  account registry
- Nix devShell: no new system deps required (keyring via `secret-service` on Linux
  already available; notmuch already present)
- No UI changes in this change — sync is triggered via API, progress via SSE or polling
