# Mail Sync Architecture Research — mailbrus
Date: 2026-05-28

## Current mailbrus architecture

```
notmuch DB (default ~/.notmuch-config)
    └── <db_root>/
        ├── account@domain/      ← directory = "account" (filesystem convention)
        │   ├── INBOX/cur/
        │   ├── Sent/cur/
        │   └── Drafts/cur/
        └── other@domain/
             └── ...

mailbrus-core reads this via notmuch bindings (read-only).
No sync whatsoever. No account config. No credentials.
```

The "account" concept today is just **filesystem directories** under the notmuch root.
`list_maildirs()` lists non-hidden subdirs. That's it.

**Key discovery**: `mailbrus-core/Cargo.toml` already has pimalaya git deps:
```toml
io-email = { git = "https://github.com/pimalaya/io-email" }
io-maildir = { git = "https://github.com/pimalaya/io-maildir" }
```
So pimalaya is already in the codebase (low-level I/O primitives).

---

## Pimalaya ecosystem (late 2025 / 2026)

```
CLI Tools                Libraries (crates.io + git)
─────────────            ──────────────────────────
himalaya 1.0+   ──────▶  email-lib     (IMAP/Maildir/Notmuch/SMTP)
neverest        ──────▶  imap-client   (IMAP sessions)
mirador                  maildirs      (local maildir)
                         io-email      (raw email I/O) ← mailbrus uses
                         io-maildir    (maildir I/O)   ← mailbrus uses
                         mml-lib       (MIME Meta Language)
                         oauth-lib     (OAuth2 flows + XOAUTH2)
                         secret-lib    (secret storage)
                         keyring-lib   (OS keyring: macOS/Win/Linux)
                         pgp-lib       (PGP ops)

WHAT'S MISSING from pimalaya:
  ❌  NO JMAP backend (IMAP/Maildir/Notmuch only)
  ❌  neverest = sync CLI, NOT a Rust library you embed
```

- **himalaya** CLI: 1.0.0 released 2024-12-09, uses email-lib as core
- **neverest**: dedicated sync/backup CLI, direct competitor to mbsync/offlineimap
- Sync and mailbox-watching moved OUT of himalaya into neverest (mirador) at 1.0
- All crates published individually on crates.io, usable as library deps

---

## mbsync vs pimalaya vs embedded: comparison

|                      | mbsync        | neverest      | email-lib embedded |
|----------------------|---------------|---------------|--------------------|
| Cross-platform?      | ✗ Linux/Mac   | ✓ Rust bin    | ✓ Rust lib         |
| JMAP support?        | ✗ never       | ✗ no          | ✗ no (yet)         |
| OAuth2/XOAUTH2?      | via helper    | via oauth-lib | via oauth-lib      |
| UI progress/events   | ✗ process     | ✗ process     | ✓ in-process       |
| Delta sync CONDSTORE | ✓ mature      | ✓ via email-lib | ✓ via imap-client |
| Keyring integration  | ✗ external    | ✓ keyring-lib | ✓ keyring-lib      |
| Packaging for Tauri  | ✗ 3rd party   | ✓ bundle it   | ✓ compile in       |
| Config management    | ✗ ~/.mbsyncrc | ✓ own format  | ✓ you control      |

**mbsync is ruled out** for Tauri: not cross-platform, no JMAP path.

---

## JMAP options for Rust

- **`jmap-client`** crate from Stalwart (crates.io) — only serious Rust JMAP impl
  - Implements RFC 8620 + RFC 8621
  - Battle-tested (Stalwart Mail Server uses it internally)
  - Used by mujmap under the hood
- **mujmap**: Go binary, JMAP↔notmuch bridge — packaging nightmare for Tauri
- **pimalaya**: no JMAP backend as of 2026

---

## Multi-account settings architecture

### Config file (no secrets)
```toml
# ~/.config/mailbrus/config.toml

[accounts.work]
protocol = "imap"
email = "me@work.com"
display_name = "Me (Work)"
imap_host = "imap.work.com"
imap_port = 993
imap_security = "tls"
auth = "oauth2"
maildir_root = "~/.mail/work"

[accounts.fastmail]
protocol = "jmap"
email = "me@fastmail.com"
display_name = "Me (Fastmail)"
jmap_url = "https://api.fastmail.com/jmap"
auth = "oauth2"
maildir_root = "~/.mail/fastmail"
```

### Credential storage
OS keyring via pimalaya `keyring-lib` — stores:
- OAuth2 refresh tokens
- OAuth2 access tokens + expiry
- App passwords (for non-OAuth accounts)

Config file stores only a `credential_ref` identifier, never secrets.

### Sync state (SQLite, not notmuch)
```rust
enum SyncState {
    Imap(ImapSyncState),
    Jmap(JmapSyncState),
}

struct ImapMailboxState {
    highest_modseq: Option<u64>,   // CONDSTORE/QRESYNC
    uid_validity: u32,             // detect mailbox reset
    last_uid: u32,
}

struct JmapSyncState {
    email_state: String,           // RFC 8620 state string
    mailbox_state: String,
}
```

### Full data flow
```
Config file (TOML)          OS Keyring
      │                         │
      └──────────┬──────────────┘
                 ↓
     ┌───────────────────────┐
     │   Per-account sync    │
     │       workers         │
     └──────┬─────────┬──────┘
            │         │
   ┌────────▼───┐  ┌──▼──────────────┐
   │ IMAP Worker│  │  JMAP Worker    │
   │ email-lib  │  │  jmap-client    │
   │ imap-client│  │  (Stalwart)     │
   │ (pimalaya) │  │                 │
   │ CONDSTORE  │  │  Email/changes  │
   └────────┬───┘  └──────┬──────────┘
            │              │
    writes maildir     writes maildir
    ~/.mail/work/      ~/.mail/fastmail/
            │              │
            └──────┬───────┘
                   ↓
     ┌─────────────────────────────┐
     │     Single notmuch index    │
     │  tag:account:work           │
     │  tag:account:fastmail       │
     │  tag:inbox, tag:unread      │
     │  tag:mailbox:INBOX (raw)    │
     └──────────────┬──────────────┘
                    ↓
     ┌──────────────────────────────┐
     │  mailbrus-core (read-only)   │
     │  mailbrus-server (Axum API)  │
     └──────────────────────────────┘
```

---

## Recommended path: pimalaya (IMAP) + jmap-client (JMAP)

**Path A — pimalaya + jmap-client (recommended)**
- Already using io-email/io-maildir (same ecosystem)
- email-lib has IMAP backend, oauth-lib, keyring-lib
- Single Rust binary, Tauri-friendly, cross-platform (Windows/macOS/Linux)
- Tight UI integration (progress events, cancellation in-process)
- oauth-lib handles XOAUTH2 token refresh
- Cons: email-lib is pre-1.0 (active but evolving API), you own the sync loop logic

**Path B — shell out to neverest + mujmap (rejected)**
- neverest: no stable release, CLI-only (not embeddable as lib)
- mujmap: Go binary, Tauri packaging nightmare
- No Windows support for either tool
- Poor UI progress integration (process boundary)

---

## Open questions

1. **email-lib IMAP delta sync depth**: Does imap-client do CONDSTORE/QRESYNC natively,
   or do you implement the delta loop yourself on top of it?

2. **neverest as library**: Could you depend on neverest's internal sync crate rather
   than the CLI? Or just reimplement it using email-lib directly?

3. **Single notmuch DB vs per-account**: Share one DB with `tag:account:X` convention,
   or separate notmuch DBs per account (then merge queries in server)?

4. **Account discovery**: Right now server calls `MaildirReader::open()` using
   `~/.notmuch-config`. Adding real account config requires a config file path
   (CLI flag, env var, or XDG). Where does this come from?

5. **OAuth2 UX in Tauri**: Auth dance opens browser, redirect via local HTTP listener
   or custom URL scheme (`mailbrus://oauth-callback`). This needs UX design.
