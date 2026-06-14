## 1. mailbrus-core: NotmuchDB module

- [ ] 1.1 Create `mailbrus-core/src/notmuch_db.rs` module with `default_db_path()` and `default_config_path()` resolving to `$XDG_DATA_HOME/mailbrus/notmuch/` and `$XDG_DATA_HOME/mailbrus/notmuch.cfg`
- [ ] 1.2 Implement `ensure_initialized(db_path)` — calls `notmuch::Database::create` if `.notmuch/` subdirectory does not exist, no-op otherwise
- [ ] 1.3 Implement `write_config(config_path, account_maildir_roots)` — writes minimal notmuch TOML config registering all account maildir roots
- [ ] 1.4 Add unit tests: default paths resolve correctly, `ensure_initialized` is idempotent, `write_config` produces valid notmuch config
- [ ] 1.5 Export module from `mailbrus-core/src/lib.rs`

## 2. mailbrus-core: Remove external notmuch_db_path from SyncEngine

- [ ] 2.1 Remove `notmuch_db_path: PathBuf` parameter from `SyncEngine::new`
- [ ] 2.2 Resolve notmuch DB path internally via `notmuch_db::default_db_path()` inside `SyncEngine::new`
- [ ] 2.3 Update all `SyncEngine::new` call sites in `mailbrus-server` and test helpers

## 3. mailbrus-core: IndexEvent on SSE broadcast

- [ ] 3.1 Add `IndexEvent` struct to `mailbrus-core/src/sync/engine.rs`: `{ type: "index", status: SyncStatus, indexed: u32, error: Option<String> }`
- [ ] 3.2 Add `"type"` discriminator field to `SyncEvent` serialization (value `"sync"`)
- [ ] 3.3 Extend broadcast channel to carry an enum `BroadcastEvent { Sync(SyncEvent), Index(IndexEvent) }`
- [ ] 3.4 Emit `IndexEvent { status: Running, indexed: 0 }` at the start of `index_in_notmuch`
- [ ] 3.5 Emit `IndexEvent { status: Done, indexed: N }` on successful completion of `index_in_notmuch`
- [ ] 3.6 Emit `IndexEvent { status: Error, ... }` on `index_in_notmuch` failure

## 4. mailbrus-server: Startup wiring

- [ ] 4.1 Call `notmuch_db::write_config(config_path, maildir_roots)` from server startup after loading accounts
- [ ] 4.2 Call `notmuch_db::ensure_initialized(db_path)` from server startup before `SyncEngine::new`
- [ ] 4.3 Remove `--notmuch-db` flag from `mailbrus-server/src/cli.rs`; log deprecation warning if flag is still passed via env or legacy config
- [ ] 4.4 Update `/api/sync/stream` SSE handler to serialize `BroadcastEvent` (both `SyncEvent` and `IndexEvent` variants)

## 5. mailbrus-cli: Remove notmuch-db argument

- [ ] 5.1 Remove any `--notmuch-db` or equivalent argument from `mailbrus-cli/src/main.rs`
- [ ] 5.2 Resolve notmuch DB path via `notmuch_db::default_db_path()` when opening `MaildirReader`

## 6. mailbrus-frontend: Status bar spinner + popup

- [ ] 6.1 Create a Svelte store `syncState.ts` that subscribes to `/api/sync/stream` SSE and tracks active `SyncEvent` and `IndexEvent` by account/mailbox
- [ ] 6.2 Add `StatusBar.svelte` component that renders a spinner when any event has `status: "running"`, idle indicator otherwise
- [ ] 6.3 Implement click-to-open popup panel in `StatusBar.svelte` showing per-account rows with fetched/indexed counts and status badge
- [ ] 6.4 Show error message in popup row when an event has `status: "error"`
- [ ] 6.5 Wire `StatusBar.svelte` into the root layout (`src/routes/+layout.svelte`)

## 7. Documentation

- [ ] 7.1 Update `docs/mail-sync.md`: remove `--notmuch-db` references, document auto-init, add SSE `IndexEvent` shape to the monitoring section
- [ ] 7.2 Add migration note to `docs/mail-sync.md` for users who were passing `--notmuch-db`

## 8. E2E tests + validation cycle

- [ ] 8.1 Add E2E spec `e2e/specs/notmuch-init.spec.ts`: verify server auto-creates notmuch DB on first start with no pre-existing DB
- [ ] 8.2 Add E2E spec `e2e/specs/index-events.spec.ts`: trigger sync, subscribe to SSE stream, assert `IndexEvent` with `status:"done"` is received
- [ ] 8.3 Add E2E spec for desktop spinner: assert spinner appears during sync and popup contains expected account/mailbox rows
- [ ] 8.4 Run full E2E suite (`deno task test:e2e`), fix any regressions
- [ ] 8.5 Fix all Rust compiler warnings (`cargo clippy --workspace`)
