## Why

mailbrus-core is scaffolded but has no real email functionality. The
first meaningful capability is reading local mail from a Maildir at
scale (50k+ messages), sorting by headers, optionally accelerating
listing and search via a notmuch index, and sending outgoing mail via
SMTP.

The notmuch integration is optional: mailbrus-core works without it
(io-maildir reads files directly), but activates faster listing,
threading, and full-text search when the `notmuch` feature flag is
enabled and a notmuch database is configured.

## What Changes

- Add `io-smtp` git dependency to `mailbrus-core`
- Add `notmuch` crate as an optional dependency (`features = ["notmuch"]`)
- Implement `MaildirReader` in `mailbrus-core`: list and fetch messages
  via io-maildir coroutines
- Implement `NotmuchIndex` in `mailbrus-core` (feature-gated): wraps
  the notmuch database for fast listing, search, and threading
- Implement header-based sorting via `mail-parser` (re-exported by
  io-maildir as `io_maildir::parser`)
- Implement `SmtpSender` in `mailbrus-core`: send a composed message
  via io-smtp coroutines
- Update `mailbrus-core/Cargo.toml` with new dependencies and feature
  flags
- Update `nix/pkgs.nix` with `cargoLock.outputHashes` for new git deps
  and optional `libnotmuch` system dependency under the notmuch feature

## Capabilities

### New Capabilities

- `maildir-reader`: reads messages from a local Maildir using
  io-maildir; exposes list (returns `Vec<Message>` with parsed headers)
  and get (returns full message bytes by path); sorting by Date, From,
  Subject done in-memory via mail-parser
- `notmuch-index`: optional (feature `notmuch`) notmuch-backed fast
  message listing, tag-based filtering, and full-text search; uses
  notmuch database non-destructively (read-only queries + tag writes
  only, no `notmuch new` side-effects); activates automatically when
  the feature is compiled in
- `smtp-sender`: sends an outgoing RFC 5322 message via io-smtp;
  supports PLAIN auth and STARTTLS; credentials passed in at call site
  (no account config storage in this change)

### Modified Capabilities

- `mailbrus-core-crate`: gains `maildir_reader`, `notmuch_index`
  (feature-gated), and `smtp_sender` modules; `version()` placeholder
  remains
