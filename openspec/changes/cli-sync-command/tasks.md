## 1. mailbrus-cli: dependencies + runtime

- [ ] 1.1 In `mailbrus-cli/Cargo.toml`, depend on `mailbrus-core` with `features = ["sync"]`
- [ ] 1.2 Add `tokio` (multi-thread + macros) as a dependency for the `sync` subcommand
- [ ] 1.3 Keep the read-only subcommands on the existing synchronous path (only `sync` enters an async runtime)

## 2. mailbrus-cli: sync subcommand

- [ ] 2.1 Add a `Sync { account: Option<String> }` variant to the clap `Commands` enum (`mailbrus sync [account]`)
- [ ] 2.2 Load accounts via `mailbrus_core::config::load_config(None)`; on an unknown account id, print an error and exit non-zero without syncing
- [ ] 2.3 Resolve `db_path = notmuch_db::default_db_path()` and `config_path = notmuch_db::default_config_path()`; call `write_config(config_path, db_path, maildir_roots)` then `ensure_initialized(db_path)` (same account→maildir-root resolution as the server)
- [ ] 2.4 For each targeted account, build an `ImapWorker` (shared `NotmuchLock`, state DB path) and `await sync()`, collecting `SyncReport`s
- [ ] 2.5 Run the above on a scoped Tokio runtime built only for the `sync` arm

## 3. Output + exit code

- [ ] 3.1 Print one line per account with fetched / deleted / indexed counts (respect the existing `--output text|json` convention where reasonable)
- [ ] 3.2 Exit non-zero if any account errored (reporting each error); exit 0 when all succeed

## 4. Validation

- [ ] 4.1 `cargo build -p mailbrus-cli` succeeds with the `sync` feature compiled in
- [ ] 4.2 `cargo clippy -p mailbrus-cli` is clean
- [ ] 4.3 Manual/integration check: `mailbrus sync <account>` against a real (or Stalwart) IMAP account creates the DB if absent, fetches, indexes, and the messages are then visible via `mailbrus message search`
- [ ] 4.4 Update `docs/mail-sync.md` to document `mailbrus sync` as a terminal-native alternative to the server API
