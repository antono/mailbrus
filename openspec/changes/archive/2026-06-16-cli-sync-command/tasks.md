## 1. mailbrus-cli: dependencies + runtime

- [x] 1.1 In `mailbrus-cli/Cargo.toml`, depend on `mailbrus-core` with `features = ["sync"]`
- [x] 1.2 Add `tokio` (multi-thread + macros) as a dependency for the `sync` subcommand
- [x] 1.3 Keep the read-only subcommands on the existing synchronous path (only `sync` enters an async runtime)

## 2. mailbrus-cli: sync subcommand

- [x] 2.1 Add a `Sync { account: Option<String> }` variant to the clap `Commands` enum (`mailbrus sync [account]`)
- [x] 2.2 Load accounts via `mailbrus_core::config::load_config(None)`; on an unknown account id, print an error and exit non-zero without syncing
- [x] 2.3 Resolve `db_path = notmuch_db::default_db_path()` and `config_path = notmuch_db::default_config_path()`; call `write_config(config_path, db_path, maildir_roots)` then `ensure_initialized(db_path)` (same account→maildir-root resolution as the server)
- [x] 2.4 For each targeted account, build an `ImapWorker` (shared `NotmuchLock`, state DB path) and `await sync()`, collecting `SyncReport`s
- [x] 2.5 Run the above on a scoped Tokio runtime built only for the `sync` arm

## 3. Output + exit code

- [x] 3.1 Print one line per account with fetched / deleted / indexed counts (respect the existing `--output text|json` convention where reasonable)
- [x] 3.2 Exit non-zero if any account errored (reporting each error); exit 0 when all succeed

## 5. mailbrus-core: progress sink

- [x] 5.1 Add a public `SyncProgress` enum to `sync/imap.rs` (ResolvingCredentials, CredentialsResolved, Connecting, Authenticated, MailboxSelected, NewMessages, FetchingBatch, BatchFetched, MessageFetched, MessageStored, MessageFailed, MessageDeleted, IndexingStarted, IndexingProgress, IndexingFinished) and re-export it from `sync/mod.rs`
- [x] 5.5 Emit `MessageFailed { uid, reason }` from `fetch_message_bodies` when an individual message fetch response is incomplete/skipped
- [x] 5.6 Process new messages in bounded batches: per batch fetch → write → index → checkpoint UIDs before the next, emitting `FetchingBatch`/`BatchFetched` around each fetch and `IndexingProgress` after each index (fixes the silent, all-at-once fetch of a large initial sync and makes mail searchable incrementally)
- [x] 5.2 Add an optional progress sink to `ImapWorker` (`Option<Arc<dyn Fn(SyncProgress) + Send + Sync>>`) with a `with_progress(...)` builder; default `None`
- [x] 5.3 Emit milestones from `sync()` at: credential resolution (store name; reference only for keyring/pass, never the secret), connect, auth, mailbox selected, new-message count, each message fetched, each file written, each deletion, indexing start/finish
- [x] 5.4 Confirm the server path is unaffected (no sink attached) — `cargo build -p mailbrus-server` and core tests still pass

## 6. mailbrus-cli: live progress output

- [x] 6.1 Print "config: N account(s)" after loading config, and "account <id>: starting sync" before each worker (verbose only)
- [x] 6.2 Attach a progress sink to each `ImapWorker` that prints each `SyncProgress` milestone to stderr as it arrives
- [x] 6.3 Keep the final per-account `fetched/deleted/indexed` summary on stdout; errors (with the failing step) on stderr
- [x] 6.4 Add a `--verbose` (`-v`) flag to `sync`; default mode redraws a single `[fetched/total]` line in place (when stderr is a TTY), verbose mode prints one prefixed `[fetched/total]` line per milestone
- [x] 6.5 Track `fetched`/`total` in the progress sink (total from `NewMessages`, increment on `MessageStored`/`MessageFailed`); finalize the redrawn line after each account completes

## 4. Validation

- [x] 4.1 `cargo build -p mailbrus-cli` succeeds with the `sync` feature compiled in
- [x] 4.2 `cargo clippy -p mailbrus-cli` is clean
- [x] 4.3 Manual/integration check: `mailbrus sync <account>` against a real Gmail account creates the DB, fetches, and indexes (verified: 2740 messages indexed under `folder:"mail/gmail/INBOX"`); surfaced and fixed the server folder-query bug below
- [x] 4.5 Fix `mailbrus-server` message-list `folder:` query to resolve the maildir root relative to the notmuch DB root, so mail stored under `mail/<id>/` is listed (was returning empty)
- [x] 4.6 Make server reads resilient to a concurrent sync: `read_with_retry` reopens the notmuch DB and retries on transient Xapian "modified"/lock errors (message list, search, message body), so the inbox does not momentarily render empty mid-sync
- [x] 4.7 Send `Cache-Control: no-store` on all `/api` responses (`no_store_middleware`), so the browser never replays a stale empty inbox captured before the first sync (verified via response headers)
- [x] 4.8 Fix the SPA cold deep-link to `/folder/<id>`: auto-select the account silently instead of via `onAccountPick` (which opened the folder picker and nulled `folder`, flashing an empty screen until reload)
- [x] 4.9 Fix the hotkey scope stack `popScope mismatch` (`expected 'reader' on top, found 'palette'`) — the load-bearing fix for "Enter doesn't open a message but the mouse click does": a mismatched strict-LIFO pop left a scope stranded on the stack, so `activeScope()` no longer matched the visible surface and the scope-gated keyboard bindings stopped firing (the mouse `onclick` is not scope-gated, so it kept working). `popScopePure` now removes the most-recent matching scope wherever it sits, tolerating layered views (palette/modal over reader) whose teardown is out of LIFO order; only an absent scope fails loudly. Added unit tests; amends the `ui-hotkeys` "Active scope and scope stack" requirement
- [x] 4.10 Bind each scope+keymap once per mount via a shared `useScopedKeymap` helper (decouples push/pop from inline-arrow handler-prop churn so a re-run can't reorder the stack); refactored Reader/Palette/Compose/HintOverlay/KeyboardHelp/About onto it and `untrack`-wrapped the two open-gated/listener effects (SettingsPanel, HeadersPopover). Added `e2e/specs/hotkeys-open-message.spec.ts` (Enter opens → close → Enter opens again; Enter still opens after a modal was layered over the reader). Full hotkeys E2E suite + hotkeys unit tests (26) green
- [x] 4.11 Fix "Enter does nothing in the open-folder dialog while the mouse click works" (start-screen flow): the keymap registry stored keymaps in a deeply-reactive `$state` array, so each pushed keymap was wrapped in a proxy and `dispose()`'s identity lookup never matched — keymaps leaked and accumulated, and `pickMatch` (first match wins) fired a stale picker's keymap (e.g. the unmounted account picker's `confirm`) instead of the live folder picker's. Also de-gated the list-keymap registration (now `phase === 'list'` only): the leak had masked that opening a modal disposed the list keymap, breaking the keyboard-help dialog's introspection of the scope beneath the modal — per-scope isolation already prevents non-active scopes from firing. Added `e2e/specs/hotkeys-picker.spec.ts` (Enter selects in account/folder picker; Escape closes the command palette); hotkeys-help-per-view restored
- [x] 4.13 Fix the same Enter-ignored symptom when switching folder via the breadcrumb/top toolbar (the list stays mounted under the picker, so a register and a dispose run in one reactive flush). `$state.raw` reassignment (`[...x, km]` / `x.filter()`) loses updates in that case — the list-keymap dispose read a pre-flush snapshot and clobbered the just-registered picker keymap, so the picker had no keymap and Enter no-op'd. Reworked the registry to a plain non-proxied array mutated in place (`push`/`splice` — reliable identity, interleaved effects see each other immediately) plus a `$state` version counter that drives reactive readers. Added `e2e/specs/hotkeys-picker.spec.ts` › "Enter opens a folder in the folder picker reopened from the toolbar". Full hotkeys E2E (28) + unit (26) green
- [x] 4.12 Fix folder/account message counters showing 0 everywhere (open-folder dialog + breadcrumb): `list_folders` and `list_maildirs` hardcoded `total/unread: 0`. Added `MaildirReader::count(query)`; `list_folders` now counts each `folder:"<prefix>/<name>"` (and `… and tag:unread`), `list_maildirs` sums the account's per-folder counts. Prefix resolved via the shared `mailbox_prefix` (db-root-relative) so counts match stored mail. Graceful 0 fallback if the index can't open. Added `e2e/specs/folder-counts.spec.ts`
- [x] 4.4 Update `docs/mail-sync.md` to document `mailbrus sync` as a terminal-native alternative to the server API
