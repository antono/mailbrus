## Why

mailbrus-core is scaffolded but has no real email functionality. The
first meaningful capability is reading local mail from Maildir stores
at scale (50k+ messages) using a notmuch database as the index.

notmuch is a mandatory dependency: mailbrus-core assumes a notmuch
database is already configured and kept up-to-date by the user's
existing mail sync setup (mbsync, offlineimap, etc). mailbrus-core
opens the database read-only and never modifies it.

Account discovery, credentials, and mail sync configuration are
entirely out of scope — those live in the CLI/Tauri layer.

## What Changes

- Add `notmuch` crate as a required dependency to `mailbrus-core`
- Add `libnotmuch` as a required system dependency in `nix/deps.nix`
- Implement `MaildirReader` in `mailbrus-core`: list messages via
  notmuch queries; fetch message bodies from paths stored in the index
- Define `Message`, `Headers`, `MaildirFlags`, `SortBy`, and
  `PaginationOpts` types in `mailbrus-core`
- Implement `MailboxError` proxy that maps well-known notmuch and I/O
  errors into clear domain-level variants
- Update `mailbrus-core/Cargo.toml` with notmuch dependency
- Update `nix/deps.nix` with required `libnotmuch` system dependency

## Capabilities

### New Capabilities

- `maildir-reader`: reads messages from notmuch-indexed Maildir stores;
  exposes `list_messages(query, sort, pagination)` using direct notmuch
  query syntax; exposes `get_message_body(message_id)` which reads raw
  RFC 5322 bytes from the path stored in the notmuch index; account
  discovery and credential management are out of scope

### Modified Capabilities

- `mailbrus-core-crate`: gains `maildir_reader` and `error` modules;
  `version()` placeholder remains
