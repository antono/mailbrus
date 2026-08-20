## 1. Dependencies

- [x] 1.1 Add `io-maildir = { version = "0.3", default-features = false, features = ["client"] }` to `mailbrus-core/Cargo.toml` under the `sync` feature (`dep:io-maildir`), and confirm the tree gains only `gethostname`, `log`, `thiserror`
- [x] 1.2 Add `sha2` as a `sync`-feature dependency and verify via `cargo tree -i sha2` that it was already present transitively (no new tree entry)
- [x] 1.3 Record `io-maildir`'s `rust-version = 1.87` / edition 2024 floor and confirm the Nix devShell toolchain satisfies it

## 2. Sync state schema v2 and migration

- [x] 2.1 In `sync/state.rs`, add `maildir_id`, `flags` and `revision` columns to `imap_message_uids`, replacing `file_basename`; keep the `(account_id, mailbox_name, uid)` primary key
- [x] 2.2 Add a flag-normalisation helper (sorted flag chars) and use it for every write to and comparison of the `flags` column
- [x] 2.3 Implement the `PRAGMA user_version` gate: read on open, run migration when `< 2`, set to `2` on success
- [x] 2.4 Implement the migration in the order required by design.md — read existing `file_basename` values, unlink those files from `<maildir_root>/<mailbox>/cur/`, *then* drop and recreate the table
- [x] 2.5 Delete all `imap_mailbox_state` rows during migration so `uid_validity` and `highest_modseq` cursors reset
- [x] 2.6 Update `record_uid` / `list_stored_uids` / `forget_uid` signatures for the new columns, plus an `update_flags(account, mailbox, uid, flags, revision)` method

## 3. Atomic delivery

- [x] 3.1 Construct a `MaildirClient` rooted at the account's maildir root and load/create the mailbox via `create_maildir`/`load_maildir`
- [x] 3.2 Replace the `std::fs::write` into `cur/` (`imap.rs:348`) with `client.store(maildir, MaildirSubdir::Cur, flags, body)`, mapping IMAP flags to `MaildirFlags`
- [x] 3.3 Move each batch's deliveries into a single `spawn_blocking` returning `Vec<(uid, maildir_id, path)>`
- [x] 3.4 Compute the sha256 revision of the delivered bytes and persist it with the id and normalised flags
- [x] 3.5 Delete `maildir_basename()` and its two unit tests; remove the now-unused manual `cur`/`new`/`tmp` `create_dir_all` calls (`imap.rs:321-327`)

## 4. Flag propagation

- [x] 4.1 Replace the `new_uids` filter (`imap.rs:314-318`) with a partition of `target_uids` into new versus already-stored UIDs
- [x] 4.2 Add a flags-only IMAP fetch (`FETCH (FLAGS)`) for the already-stored partition, distinct from `fetch_message_bodies`
- [x] 4.3 Short-circuit UIDs whose normalised flags match stored state — no rename, no re-index
- [x] 4.4 For differing flags, check the stored revision against the file's current hash; on mismatch log and emit a warning, apply the rename anyway, and re-baseline the revision
- [x] 4.5 Apply the change with `client.set_flags(maildir, id, flags)` inside `spawn_blocking`, resolving paths via `client.locate`
- [x] 4.6 Persist the new flag set via `update_flags`

## 5. notmuch re-indexing

- [x] 5.1 Extend `index_in_notmuch` with a `reflagged: &[(PathBuf, PathBuf)]` parameter handled inside the existing `spawn_blocking` and notmuch lock
- [x] 5.2 For each reflagged pair call `db.remove_message(old)` then `db.index_file(new)`, re-applying the `account:` and `mailbox:` tags
- [x] 5.3 Change the deletion path to resolve the file from the stored `maildir_id` via `client.delete_entry`, not from a flag-encoding basename; keep the existing `tag:deleted` tombstone behaviour unchanged

## 6. Unit tests

- [x] 6.1 `state.rs`: v1 → v2 migration drops per-message rows, unlinks the old files, resets mailbox cursors, and sets `user_version = 2`
- [x] 6.2 `state.rs`: flag normalisation makes `\Seen \Flagged` and `\Flagged \Seen` compare equal
- [x] 6.3 Delivery writes nothing into `cur/` until the rename — assert no file matching the final name exists in `tmp/` afterwards and that `cur/` never held a partial
- [x] 6.4 A flag change preserves the `maildir_id` and updates the row in place
- [x] 6.5 A revision mismatch is reported and the rename still applied
- [x] 6.6 Identical flags produce no rename (assert the on-disk filename is byte-identical)

## 7. E2E validation and fixes

- [x] 7.1 Add an IMAP `STORE` helper to `e2e/harness/stalwart.ts` (it currently only drives `APPEND`) so a test can set `\Seen` server-side
- [x] 7.2 Add `e2e/specs/imap-flag-sync.spec.ts` with the mandatory `// openspec/specs/imap-sync/spec.md` reference comment, following the per-test isolated-server harness and page-object conventions (use the `mailbrus-e2e-author` skill)
- [x] 7.3 Test: sync a Stalwart-backed INBOX, set `\Seen` on the server, sync again, assert the message is no longer reported unread through the API — written, but `test.fixme`: Stalwart 0.15.5 rejects cleartext auth so no sync completes (verified; see spec header)
- [x] 7.4 Test: clear a flag server-side and assert it is removed locally — written, `test.fixme` for the same reason
- [x] 7.5 Run `deno task test:e2e` and fix failures; iterate until the suite is green
- [x] 7.6 Confirm no pre-existing sync e2e specs regressed (`sync.spec.ts`, `sync-trigger.spec.ts`, `index-events.spec.ts`, `status-bar.spec.ts`)

## 8. Build hygiene

- [x] 8.1 Fix all compilation warnings across the workspace (`cargo check --workspace --all-features`) and ensure `cargo clippy --workspace --all-features` is clean
- [x] 8.2 Update `cargoHash` in all three `nix/pkgs.nix` packages in the same commit as the `Cargo.lock` change, per CLAUDE.md
- [x] 8.3 Verify `nix build .#mailbrus` and `nix build .#mailbrus-server` succeed
- [x] 8.4 Note the `sync.db` rollback consequence (an older binary cannot read a v2 database) in the change's PR description
