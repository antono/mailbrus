## Context

Mailbrus reads a pre-existing notmuch index but has no way to populate it. Users must
configure and run mbsync or offlineimap externally. This design adds an embedded IMAP sync
engine inside `mailbrus-core` so the server can pull mail autonomously.

`mailbrus-core` already depends on pimalaya's `io-email` and `io-maildir` (git deps),
establishing the ecosystem choice. The server exposes a thin Axum API; sync is a
background concern that should not block HTTP handlers.

Current account model: none. `MaildirReader::open()` reads `~/.notmuch-config` and
treats subdirectories under the notmuch root as "accounts" by convention.

## Goals / Non-Goals

**Goals:**
- IMAP sync for one or more accounts, driven by `mailbrus-server`
- Typed account config file (TOML, XDG) with per-account protocol settings
- Two credential backends: OS keyring (`keyring-lib`) and `pass` via `prs-lib`
- Delta sync using IMAP CONDSTORE (`CHANGEDSINCE highestModSeq`)
- Sync state persisted in SQLite (separate from notmuch)
- Notmuch `tag:account:<id>` applied after sync to namespace messages
- `POST /api/sync[/:account]` endpoint; sync progress via SSE

**Non-Goals:**
- JMAP support (config schema designed to accommodate it, but not implemented here)
- SMTP / sending (separate capability)
- Two-way flag sync back to IMAP server (read-only pull first)
- OAuth2 token acquisition UI (config accepts a pre-obtained token path; OAuth flow is a later change)
- Windows support (Linux/macOS only for this change; keyring-lib is cross-platform but
  `prs-lib` requires gpg on PATH)

## Decisions

### D1 — Sync lives in `mailbrus-core`, not a new crate

Sync needs notmuch write access and the maildir reader; a separate crate would create a
circular or awkward dep chain. `mailbrus-core` is already the boundary for all mail I/O.
New module layout:

```
mailbrus-core/src/
  lib.rs
  maildir_reader.rs
  error.rs
  config.rs          ← account config loading (TOML)
  credentials.rs     ← credential backend abstraction
  sync/
    mod.rs           ← SyncEngine, per-account dispatch
    imap.rs          ← IMAP worker (email-lib + imap-client)
    state.rs         ← SQLite sync state (rusqlite)
```

### D2 — Config file: TOML at XDG config path

```toml
# ~/.config/mailbrus/config.toml

[accounts.work]
protocol = "imap"
email = "me@work.com"
display_name = "Me (Work)"
imap_host = "imap.work.com"
imap_port = 993
imap_tls = true
credential_backend = "keyring"    # or "pass"
credential_ref = "work-imap"      # keyring service name OR pass path
maildir_root = "~/.mail/work"
```

Resolved via `$XDG_CONFIG_HOME/mailbrus/config.toml`, fallback `~/.config/mailbrus/config.toml`.
`mailbrus-server` gains a `--config` CLI flag; defaults to XDG path.

**Why TOML over JSON/YAML**: consistent with Cargo ecosystem, human-editable, no
indentation footguns.

### D3 — Credential abstraction with two backends

```rust
enum CredentialBackend {
    Keyring,   // via keyring-lib (pimalaya)
    Pass,      // via prs-lib, backend-gnupg-bin feature
}
```

Both implement a `resolve() -> Result<String>` trait. The `credential_ref` field is
interpreted differently per backend:
- `keyring`: service name looked up in the OS keyring
- `pass`: path under `$PASSWORD_STORE_DIR` (default `~/.password-store`), e.g. `mail/work`

`prs-lib` with `backend-gnupg-bin` shells out to the user's existing `gpg` — no extra
system libraries, works wherever `pass` works.

**Alternative considered**: shell out to `pass show <path>` directly without a crate.
Rejected because `prs-lib` handles store discovery, `.gpg-id` lookup, and edge cases
(multiple recipients, git-tracked stores) without us parsing `pass` output.

### D4 — IMAP sync via `email-lib` + `imap-client`

`email-lib` provides a `Backend` composed from feature traits. The IMAP backend is built
via `BackendBuilder` with the `imap-client` connector. Delta sync flow per mailbox:

```
1. SELECT mailbox, check UIDVALIDITY
   → if changed: full resync (reset stored UIDs + modseq)
2. FETCH UIDs CHANGEDSINCE <highestModSeq>  (CONDSTORE)
   → for new UIDs: FETCH RFC822, write to maildir/<account>/<mailbox>/cur/
   → for changed UIDs: update flags in-place
3. Detect deleted: compare known UIDs vs server UID set
   → move deleted messages to Trash folder path, apply notmuch tag:deleted
4. notmuch index: call Database::index_file() for each new file
5. Apply tag:account:<id> to all newly indexed messages
6. Persist new highestModSeq + uidvalidity to SQLite
```

**Fallback for servers without CONDSTORE**: full UID scan (slower, detected by capability
advertisement).

### D5 — Sync state in SQLite, not notmuch

A small SQLite DB at `$XDG_DATA_HOME/mailbrus/sync.db`:

```sql
CREATE TABLE imap_mailbox_state (
  account_id   TEXT NOT NULL,
  mailbox_name TEXT NOT NULL,
  uid_validity INTEGER NOT NULL,
  highest_modseq INTEGER,
  last_sync_at TEXT,
  PRIMARY KEY (account_id, mailbox_name)
);
```

**Why not notmuch**: notmuch is a search index, not a KV store. Storing sync cursors
there would require hacks (fake messages or config abuse). SQLite is trivially embeddable
via `rusqlite`.

### D6 — notmuch tagging convention

All messages written by sync get:
- `tag:account:<account-id>` — namespace for multi-account queries
- Standard maildir flags translated to notmuch tags: `unread` (¬Seen), `replied`, `flagged`, `deleted`, `draft`
- Raw IMAP folder preserved as `tag:mailbox:<folder>` (e.g. `tag:mailbox:INBOX`)

The existing `tags_to_flags()` in `maildir_reader.rs` already handles the reverse mapping.

### D7 — Sync API in `mailbrus-server`

```
POST /api/sync           → sync all accounts (async, returns job_id)
POST /api/sync/:account  → sync one account
GET  /api/sync/stream    → SSE stream of SyncEvent { account, status, count }
```

Sync runs in a `tokio::task::spawn` per account. `AppState` gains an
`Arc<SyncEngine>` constructed from the config at startup.

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| `email-lib` pre-1.0 API churn | Pin to a specific git rev; update deliberately |
| CONDSTORE not universally supported | Detect via CAPABILITY, fall back to full UID scan |
| notmuch write contention (reader + sync writing simultaneously) | Open notmuch DB in ReadWrite only during sync; use a `tokio::sync::Mutex<Database>` in AppState |
| `prs-lib` `backend-gnupg-bin` spawns `gpg` subprocess | Acceptable for credential fetch (once per sync session); document that gpg-agent must be running |
| Large initial sync blocking the server | Full sync runs in background task; SSE progress lets UI show state; server API stays responsive |
| Config file not found at startup | Server logs a warning and falls back to current behavior (notmuch default config, no sync capability); does not crash |

## Migration Plan

1. Config file is opt-in — server starts fine without it (backwards compatible)
2. Existing users with a pre-populated notmuch index continue to work unchanged
3. New users: create `~/.config/mailbrus/config.toml`, run `POST /api/sync`
4. No database migrations needed (SQLite is created fresh on first sync)

## Open Questions

1. **Should `mailbrus-cli` also expose a `sync` subcommand?** Likely yes, but deferred —
   server API covers the desktop use case.
2. **IMAP IDLE / push notifications**: not in scope here, but the sync worker's structure
   should not preclude adding an IDLE loop later (mirador pattern).
3. **Conflict on simultaneous syncs**: if the user triggers sync while one is already
   running for the same account, do we queue, reject, or coalesce? Propose: reject with
   409 and expose running status via SSE.
4. **`email-lib` exact crate version**: need to verify whether to use the crates.io
   release or pin the pimalaya git monorepo — the existing `io-email`/`io-maildir` are
   git deps, so the workspace may need a `[patch.crates-io]` entry.
