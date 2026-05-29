## 1. Dependencies & Cargo setup

- [x] 1.1 Add `email-lib`, `imap-client` (pimalaya) to `mailbrus-core/Cargo.toml`; add `[patch.crates-io]` if git monorepo pins are needed alongside existing `io-email`/`io-maildir`
- [x] 1.2 Add `keyring-lib` (pimalaya) to `mailbrus-core/Cargo.toml`
- [x] 1.3 Add `prs-lib` with `backend-gnupg-bin` feature to `mailbrus-core/Cargo.toml`
- [x] 1.4 Add `rusqlite` (with `bundled` feature) to `mailbrus-core/Cargo.toml`
- [x] 1.5 Add `toml` and `serde` (derive) to `mailbrus-core/Cargo.toml`
- [x] 1.6 Gate all new deps behind a `sync` Cargo feature; verify `cargo build` without it still compiles

## 2. Account config

- [x] 2.1 Create `mailbrus-core/src/config.rs` with `AccountConfig` enum (`Imap(ImapConfig)`) and `ImapConfig` struct
- [x] 2.2 Implement `CredentialBackend` enum (`Keyring`, `Pass`) with `credential_ref: String`
- [x] 2.3 Implement `load_config(path: Option<&Path>) -> Result<Vec<AccountConfig>>` with XDG fallback
- [x] 2.4 Handle missing config file (return empty vec + warn), malformed file (return `ConfigError`), and unknown protocol (skip + warn)
- [x] 2.5 Write unit tests for config parsing: valid IMAP account, missing field, unknown protocol, absent file

## 3. Credential resolution

- [x] 3.1 Create `mailbrus-core/src/credentials.rs` with `resolve(config: &AccountConfig) -> Result<String>` trait/fn
- [x] 3.2 Implement `keyring` backend via `keyring-lib`
- [x] 3.3 Implement `pass` backend via `prs-lib`: decrypt `$PASSWORD_STORE_DIR/<credential_ref>.gpg`, return first line
- [x] 3.4 Write unit tests for `CredentialError::NotFound` path (mock or cfg-test)

## 4. Sync state (SQLite)

- [x] 4.1 Create `mailbrus-core/src/sync/state.rs` with `SyncStateDb` wrapping `rusqlite::Connection`
- [x] 4.2 Implement schema creation (`imap_mailbox_state` table) on first open at `$XDG_DATA_HOME/mailbrus/sync.db`
- [x] 4.3 Implement `get_mailbox_state(account_id, mailbox) -> Option<ImapMailboxState>`
- [x] 4.4 Implement `save_mailbox_state(account_id, mailbox, state)` (upsert)
- [x] 4.5 Write unit tests for state persistence using a temp directory

## 5. IMAP sync worker

- [x] 5.1 Create `mailbrus-core/src/sync/imap.rs` with `ImapWorker` struct
- [x] 5.2 Implement IMAP connection setup via `email-lib` `BackendBuilder` with `imap-client`
- [x] 5.3 Implement CONDSTORE capability detection; fall back to full UID scan if absent
- [x] 5.4 Implement UIDVALIDITY check: reset stored state and trigger full resync on mismatch
- [x] 5.5 Implement delta fetch: `CHANGEDSINCE <highestModSeq>` → write RFC 822 to `<maildir_root>/<mailbox>/cur/`
- [x] 5.6 Implement full UID scan fallback for servers without CONDSTORE
- [x] 5.7 Implement deleted-message detection: diff stored UIDs vs server UID set → remove maildir file, apply `tag:deleted`
- [x] 5.8 Open notmuch in `ReadWrite`, call `index_file()` for each new maildir file, apply `tag:account:<id>`, drop handle

## 6. SyncEngine

- [x] 6.1 Create `mailbrus-core/src/sync/mod.rs` with `SyncEngine` struct holding account registry and in-flight state map
- [x] 6.2 Implement `SyncEngine::new(accounts: &[AccountConfig])` 
- [x] 6.3 Implement `SyncEngine::sync_all()` — spawn one tokio task per account
- [x] 6.4 Implement `SyncEngine::sync_account(id)` — guard against concurrent sync (`AlreadyRunning` error)
- [x] 6.5 Implement SSE progress channel: `SyncEvent { account_id, status, count }` broadcast via `tokio::sync::broadcast`

## 7. Server integration

- [x] 7.1 Add `--config <path>` flag to `mailbrus-server` CLI (`cli.rs`)
- [x] 7.2 Load `AccountConfig` list at server startup; construct `Arc<SyncEngine>` and add to `AppState`
- [x] 7.3 Add `POST /api/sync` handler → call `sync_engine.sync_all()`, return `202`
- [x] 7.4 Add `POST /api/sync/:account` handler → call `sync_engine.sync_account(id)`, handle `404` / `409`
- [x] 7.5 Add `GET /api/sync/stream` SSE handler → subscribe to broadcast channel, stream `SyncEvent` as JSON
- [x] 7.6 Update `GET /api/maildirs` to derive account list from `AppState` config rather than notmuch root filesystem scan
- [x] 7.7 Handle no-config startup: server starts with empty account registry, `GET /api/maildirs` returns `[]`

## 8. E2E test validation and fixes

- [x] 8.1 Author E2E test: start server with a fixture config pointing at a pre-populated maildir, call `POST /api/sync`, verify `GET /api/sync/stream` emits a `done` event
- [x] 8.2 Author E2E test: `GET /api/maildirs` returns accounts from config file (not filesystem scan)
- [x] 8.3 Author E2E test: `POST /api/sync/:unknown` returns `404`
- [x] 8.4 Run full E2E suite; fix any regressions in existing tests (maildirs, messages, pagination)

## 9. Compilation warnings

- [x] 9.1 Run `cargo clippy --all-features` and fix all warnings
- [x] 9.2 Run `cargo clippy` without `sync` feature and fix all warnings
- [x] 9.3 Verify `cargo test --all-features` passes with zero failures
