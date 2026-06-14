## 1. mailbrus-core: NotmuchDB module

- [x] 1.1 Create `mailbrus-core/src/notmuch_db.rs` module with `default_db_path()` and `default_config_path()` resolving to `$XDG_DATA_HOME/mailbrus/` (DB root; index in hidden `.notmuch/`) and `$XDG_DATA_HOME/mailbrus/notmuch.cfg`
- [x] 1.2 Implement `ensure_initialized(db_path)` — calls `notmuch::Database::create` if `<db_path>/.notmuch/` subdirectory does not exist, no-op otherwise
- [x] 1.3 Implement `write_config(config_path, db_path, account_maildir_roots)` — writes minimal notmuch config registering the DB root and all account maildir roots (signature takes explicit `db_path` so it stays testable and hermetic)
- [x] 1.4 Add unit tests: default paths resolve correctly, `ensure_initialized` is idempotent, `write_config` produces valid notmuch config
- [x] 1.5 Export module from `mailbrus-core/src/lib.rs`

## 2. mailbrus-core: Remove external notmuch_db_path from SyncEngine

- [x] 2.1 Remove `notmuch_db_path: PathBuf` parameter from `SyncEngine::new`
- [x] 2.2 Resolve notmuch DB path internally via `notmuch_db::default_db_path()` inside `SyncEngine::new`
- [x] 2.3 Update all `SyncEngine::new` call sites in `mailbrus-server` and test helpers

## 3. mailbrus-core: IndexEvent on SSE broadcast

- [x] 3.1 Add `IndexEvent` struct to `mailbrus-core/src/sync/engine.rs`: `{ type: "index", status: SyncStatus, indexed: u32, error: Option<String> }`
- [x] 3.2 Add `"type"` discriminator field to `SyncEvent` serialization (value `"sync"`)
- [x] 3.3 Extend broadcast channel to carry an enum `BroadcastEvent { Sync(SyncEvent), Index(IndexEvent) }`
- [x] 3.4 Emit `IndexEvent { status: Running, indexed: 0 }` at the start of `index_in_notmuch`
- [x] 3.5 Emit `IndexEvent { status: Done, indexed: N }` on successful completion of `index_in_notmuch`
- [x] 3.6 Emit `IndexEvent { status: Error, ... }` on `index_in_notmuch` failure

## 4. mailbrus-server: Startup wiring

- [x] 4.1 Call `notmuch_db::write_config(config_path, db_path, maildir_roots)` from server startup after loading accounts
- [x] 4.2 Call `notmuch_db::ensure_initialized(db_path)` from server startup before `SyncEngine::new`
- [x] 4.3 Deprecate `--notmuch-db` in `mailbrus-server/src/cli.rs` (hidden, still parsed); log deprecation warning and ignore when passed
- [x] 4.4 Update `/api/sync/stream` SSE handler to serialize `BroadcastEvent` (both `SyncEvent` and `IndexEvent` variants)

## 5. mailbrus-cli: Remove notmuch-db argument

- [x] 5.1 Remove any `--notmuch-db` or equivalent argument from `mailbrus-cli/src/main.rs` (none existed; `MaildirReader::open()` now resolves the internal DB)
- [x] 5.2 Resolve notmuch DB path via `notmuch_db::default_db_path()` when opening `MaildirReader`

## 6. mailbrus-frontend: Status bar spinner + popup

- [x] 6.1 Create a Svelte store `syncState.svelte.ts` (`.svelte.ts` so runes work) that subscribes to `/api/sync/stream` SSE and tracks active `SyncEvent` and `IndexEvent` by account/mailbox
- [x] 6.2 Add `StatusBar.svelte` component that renders a spinner when any event has `status: "running"`, idle indicator otherwise
- [x] 6.3 Implement click-to-open popup panel in `StatusBar.svelte` showing per-account rows with fetched/indexed counts and status badge
- [x] 6.4 Show error message in popup row when an event has `status: "error"`
- [x] 6.5 Wire `StatusBar.svelte` into the root layout (`src/routes/+layout.svelte`)

## 7. Documentation

- [x] 7.1 Update `docs/mail-sync.md`: remove `--notmuch-db` references, document auto-init, add SSE `IndexEvent` shape to the monitoring section
- [x] 7.2 Add migration note to `docs/mail-sync.md` for users who were passing `--notmuch-db`

## 8. E2E tests + validation cycle

- [x] 8.1 Add E2E spec `e2e/specs/notmuch-init.spec.ts`: verify server auto-creates notmuch DB on first start with no pre-existing DB (also covers "existing DB not overwritten"). Harness reworked: per-clone `XDG_DATA_HOME`, corpus cloned to `$XDG_DATA_HOME/mailbrus/`, no `--notmuch-db`/`NOTMUCH_CONFIG`.
- [x] 8.2 Add E2E spec `e2e/specs/index-events.spec.ts`: asserts SSE frames carry the `"type":"sync"` discriminator on a sync trigger. The `IndexEvent status:"done"` assertion is `test.fixme` — it needs a *successful* IMAP sync, which the harness's IMAP backends can't currently complete (Stalwart refuses cleartext auth; see `sync.spec.ts`).
- [x] 8.3 Add E2E spec `e2e/specs/status-bar.spec.ts`: deterministic test for the status bar + popup toggle/empty-state. The "spinner during active sync + populated rows" assertion is `test.fixme` (same live-sync limitation).
- [ ] 8.4 Run full E2E suite (`deno task test:e2e`), fix any regressions — **pending**: needs the Nix devShell + a release `mailbrus-server` build; not yet executed.
- [x] 8.5 Fix all Rust compiler warnings (`cargo clippy --workspace` clean)
