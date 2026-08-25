## Why

Two defects in `mailbrus-core/src/sync/imap.rs`, both reported by the pimalaya
maintainer in [issue #2](https://github.com/antono/mailbrus/issues/2).

**Server-side flag changes never reach the local index.** With CONDSTORE, the
worker asks the server for UIDs changed since the stored modseq — then discards
every UID it already has (`imap.rs:314-318`), which is exactly the set whose
flags changed. Flags are captured once at first fetch, encoded into the maildir
filename by `maildir_basename()` (`imap.rs:675`), and never revisited. Reading a
message on another client therefore never shows up in mailbrus.

**Delivery is not atomic.** `imap.rs:348` writes bodies straight into `cur/` with
`std::fs::write`, skipping the maildir tmp→rename protocol, so a partially
written message is visible to any concurrent reader — including our own notmuch
indexer. `tmp/` is created at `imap.rs:327` and never used.

These are one change because they need the same migration. `imap_message_uids`
keys messages by `file_basename`, and the basename encodes the flags — so
updating flags means renaming the file, which invalidates the key used to find
it. The current schema makes flag sync impossible by construction.

Note the spec is complicit: `imap-sync` currently *requires* the
`cur/<uid>:2,` filename, so a contributor following it would rewrite the same
bug. The requirement has to change, not just the code.

## What Changes

- Adopt `io-maildir` 0.3 (crates.io, `default-features = false`,
  `features = ["client"]` — pulls only `gethostname`, `log`, `thiserror`) for
  delivery and flag renames. Its `store()` returns a **stable id** that survives
  a flag rename; `set_flags()` performs the rename.
- Re-key `imap_message_uids` from `file_basename` to that stable id, and record
  last-known server flags plus a content revision.
- Propagate flag changes for already-stored UIDs instead of dropping them.
- Migrate via forced one-time resync (schema_version 1→2), reusing the existing
  UIDVALIDITY full-resync path. Every message is re-delivered atomically, so no
  file written by the old racy path survives.

## Non-goals

- **No local→server push.** Sync stays download-only; local flag edits are not
  uploaded. The revision column only makes a future local-edit path *safe*.
- **No `io-replica`/`io-pimdir` adoption.** Upstream is explicit it is not ready
  to hand over; the revision column is the cheap interim it recommends.
- **No `io-imap`/`io-smtp` migration.** Those have no async client yet.
- **No retest of the Gmail CONDSTORE workaround** (`imap.rs:295-298`), tracked
  separately.

## Capabilities

### Modified Capabilities

- `imap-sync`: the maildir-write requirement drops its literal-path mandate and
  gains atomic delivery; the SQLite-state requirement re-keys to a stable id and
  adds revision tracking; a new requirement covers propagating server-side flag
  changes to already-stored UIDs.

## Impact

- `mailbrus-core/src/sync/imap.rs` — delivery, flag-update branch, deletion.
- `mailbrus-core/src/sync/state.rs` — schema v2 + migration.
- `mailbrus-core/Cargo.toml` — `io-maildir` 0.3 (first edition-2024 dependency;
  toolchain is 1.95, its floor is 1.87).
- `nix/pkgs.nix` — `cargoHash` ×3, per CLAUDE.md.
- `openspec/specs/imap-sync/spec.md` — delta applied on archive.
