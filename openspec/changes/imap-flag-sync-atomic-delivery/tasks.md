## 1. Dependencies

- [ ] 1.1 Add `io-maildir = { version = "0.3", default-features = false, features = ["client"] }` to `mailbrus-core/Cargo.toml` under the `sync` feature (`dep:io-maildir`), and confirm the tree gains only `gethostname`, `log`, `thiserror`
- [ ] 1.2 Add `sha2` as a `sync`-feature dependency and verify via `cargo tree -i sha2` that it was already present transitively (no new tree entry)
- [ ] 1.3 Record `io-maildir`'s `rust-version = 1.87` / edition 2024 floor and confirm the Nix devShell toolchain satisfies it

## 2. Sync state schema v2 and migration

- [ ] 2.1 In `sync/state.rs`, add `maildir_id`, `flags` and `revision` columns to `imap_message_uids`, replacing `file_basename`; keep the `(account_id, mailbox_name, uid)` primary key
- [ ] 2.2 Add a flag-normalisation helper (sorted flag chars) and use it for every write to and comparison of the `flags` column
- [ ] 2.3 Implement the `PRAGMA user_version` gate: read on open, run migration when `< 2`, set to `2` on success
- [ ] 2.4 Implement the migration in the order required by design.md — read existing `file_basename` values, unlink those files from `<maildir_root>/<mailbox>/cur/`, *then* drop and recreate the table
- [ ] 2.5 Delete all `imap_mailbox_state` rows during migration so `uid_validity` and `highest_modseq` cursors reset
- [ ] 2.6 Update `record_uid` / `list_stored_uids` / `forget_uid` signatures for the new columns, plus an `update_flags(account, mailbox, uid, flags, revision)` method

## 3. Atomic delivery

- [ ] 3.1 Construct a `MaildirClient` rooted at the account's maildir root and load/create the mailbox via `create_maildir`/`load_maildir`
- [ ] 3.2 Replace the `std::fs::write` into `cur/` (`imap.rs:348`) with `client.store(maildir, MaildirSubdir::Cur, flags, body)`, mapping IMAP flags to `MaildirFlags`
- [ ] 3.3 Move each batch's deliveries into a single `spawn_blocking` returning `Vec<(uid, maildir_id, path)>`
- [ ] 3.4 Compute the sha256 revision of the delivered bytes and persist it with the id and normalised flags
- [ ] 3.5 Delete `maildir_basename()` and its two unit tests; remove the now-unused manual `cur`/`new`/`tmp` `create_dir_all` calls (`imap.rs:321-327`)

## 4. Flag propagation

- [ ] 4.1 Replace the `new_uids` filter (`imap.rs:314-318`) with a partition of `target_uids` into new versus already-stored UIDs
- [ ] 4.2 Add a flags-only IMAP fetch (`FETCH (FLAGS)`) for the already-stored partition, distinct from `fetch_message_bodies`
- [ ] 4.3 Short-circuit UIDs whose normalised flags match stored state — no rename, no re-index
- [ ] 4.4 For differing flags, check the stored revision against the file's current hash; on mismatch log and emit a warning, apply the rename anyway, and re-baseline the revision
- [ ] 4.5 Apply the change with `client.set_flags(maildir, id, flags)` inside `spawn_blocking`, resolving paths via `client.locate`
- [ ] 4.6 Persist the new flag set via `update_flags`

## 5. notmuch re-indexing

- [ ] 5.1 Extend `index_in_notmuch` with a `reflagged: &[(PathBuf, PathBuf)]` parameter handled inside the existing `spawn_blocking` and notmuch lock
- [ ] 5.2 For each reflagged pair call `db.remove_message(old)` then `db.index_file(new)`, re-applying the `account:` and `mailbox:` tags
- [ ] 5.3 Change the deletion path to resolve the file from the stored `maildir_id` via `client.delete_entry`, not from a flag-encoding basename; keep the existing `tag:deleted` tombstone behaviour unchanged

## 6. Unit tests

- [ ] 6.1 `state.rs`: v1 → v2 migration drops per-message rows, unlinks the old files, resets mailbox cursors, and sets `user_version = 2`
- [ ] 6.2 `state.rs`: flag normalisation makes `\Seen \Flagged` and `\Flagged \Seen` compare equal
- [ ] 6.3 Delivery writes nothing into `cur/` until the rename — assert no file matching the final name exists in `tmp/` afterwards and that `cur/` never held a partial
- [ ] 6.4 A flag change preserves the `maildir_id` and updates the row in place
- [ ] 6.5 A revision mismatch is reported and the rename still applied
- [ ] 6.6 Identical flags produce no rename (assert the on-disk filename is byte-identical)

## 7. E2E validation and fixes

- [ ] 7.1 Add an IMAP `STORE` helper to `e2e/harness/stalwart.ts` (it currently only drives `APPEND`) so a test can set `\Seen` server-side
- [ ] 7.2 Add `e2e/specs/imap-flag-sync.spec.ts` with the mandatory `// openspec/specs/imap-sync/spec.md` reference comment, following the per-test isolated-server harness and page-object conventions (use the `mailbrus-e2e-author` skill)
- [ ] 7.3 Test: sync a Stalwart-backed INBOX, set `\Seen` on the server, sync again, assert the message is no longer reported unread through the API
- [ ] 7.4 Test: clear a flag server-side and assert it is removed locally
- [ ] 7.5 Run `deno task test:e2e` and fix failures; iterate until the suite is green
- [ ] 7.6 Confirm no pre-existing sync e2e specs regressed (`sync.spec.ts`, `sync-trigger.spec.ts`, `index-events.spec.ts`, `status-bar.spec.ts`)

## 8. Build hygiene

- [ ] 8.1 Fix all compilation warnings across the workspace (`cargo check --workspace --all-features`) and ensure `cargo clippy --workspace --all-features` is clean
- [ ] 8.2 Update `cargoHash` in all three `nix/pkgs.nix` packages in the same commit as the `Cargo.lock` change, per CLAUDE.md
- [ ] 8.3 Verify `nix build .#mailbrus` and `nix build .#mailbrus-server` succeed
- [ ] 8.4 Note the `sync.db` rollback consequence (an older binary cannot read a v2 database) in the change's PR description
