## Purpose

Define the mailbrus-core library crate that provides email handling functionality shared by CLI and desktop applications.
## Requirements
### Requirement: Core is a library crate
`mailbrus-core/` SHALL be a Rust `lib` crate (no `[[bin]]` target). Its `Cargo.toml` SHALL set `name = "mailbrus-core"`.

#### Scenario: Core compiles as library
- **WHEN** user runs `cargo build -p mailbrus-core`
- **THEN** build produces `libmailbrus_core.rlib` with no binary artefact

### Requirement: Core declares io-email as a dependency
`mailbrus-core/Cargo.toml` SHALL declare `email` from `https://github.com/pimalaya/io-email` as a dependency.

#### Scenario: io-email types are accessible from core
- **WHEN** `mailbrus-core/src/lib.rs` imports from the `email` crate
- **THEN** compilation succeeds

### Requirement: Core is a path dependency for CLI and desktop
Both `mailbrus-cli` and `src-tauri` SHALL declare `mailbrus-core = { path = "../mailbrus-core" }` in their `Cargo.toml`.

#### Scenario: CLI uses core
- **WHEN** `mailbrus-cli/src/main.rs` imports from `mailbrus_core`
- **THEN** compilation succeeds without duplicating email logic

#### Scenario: Desktop uses core
- **WHEN** `src-tauri/src/main.rs` imports from `mailbrus_core`
- **THEN** compilation succeeds without duplicating email logic

### Requirement: Core exposes a placeholder public API
At scaffold stage, `mailbrus-core/src/lib.rs` SHALL export at least one public symbol (e.g. `pub fn version() -> &'static str`) so dependents have a non-empty surface to import.

#### Scenario: Placeholder compiles and links
- **WHEN** `cargo test -p mailbrus-core` is run
- **THEN** at least one test passes (doc-test or unit test on the placeholder function)

### Requirement: mailbrus-core exposes a sync module
`mailbrus-core` SHALL provide a `sync` module containing `SyncEngine`, IMAP worker,
and sync state types as part of its public API.

#### Scenario: SyncEngine constructed from config
- **WHEN** `SyncEngine::new(config: &[AccountConfig])` is called
- **THEN** a `SyncEngine` is returned with one registered worker slot per IMAP account

#### Scenario: Sync module absent without feature flag
- **WHEN** `mailbrus-core` is compiled without the `sync` Cargo feature
- **THEN** the `sync` module is not present in the public API
- **AND** no IMAP or SQLite dependencies are required for compilation

### Requirement: mailbrus-core opens notmuch in ReadWrite mode during sync
`mailbrus-core` SHALL support opening the notmuch database in `ReadWrite` mode
for the duration of indexing newly fetched messages.

#### Scenario: ReadWrite access used for indexing
- **WHEN** `SyncEngine` indexes a new maildir file into notmuch
- **THEN** the database is opened in `ReadWrite` mode for the `index_file` call
- **AND** the handle is dropped immediately after indexing completes

#### Scenario: Existing read-only API unaffected
- **WHEN** `MaildirReader::open()` or `MaildirReader::new()` is called outside of sync
- **THEN** the database continues to open in `ReadOnly` mode as before

### Requirement: mailbrus-core provides a credential resolution API
`mailbrus-core` SHALL expose a `credentials::resolve(config: &AccountConfig) -> Result<String>`
function that returns the plaintext secret for a given account.

#### Scenario: Keyring backend resolves secret
- **WHEN** the account specifies `credential_backend = "keyring"`
- **THEN** `keyring-lib` is used to look up the entry by `credential_ref`
- **AND** the plaintext password is returned

#### Scenario: Pass backend resolves secret
- **WHEN** the account specifies `credential_backend = "pass"`
- **THEN** `prs-lib` with the `backend-gnupg-bin` feature decrypts
  `$PASSWORD_STORE_DIR/<credential_ref>.gpg` via `gpg`
- **AND** the first line of the decrypted content is returned as the password

### Requirement: ImapWorker emits progress via an optional sink
`ImapWorker` SHALL accept an optional progress sink (a callback) that receives
structured `SyncProgress` milestones as a sync proceeds. The sink SHALL be
opt-in: when none is configured, behaviour is unchanged and no progress is
emitted (so `mailbrus-server` and the SSE channel are unaffected).

`SyncProgress` SHALL include, at minimum, milestones for: resolving credentials
(naming the password store), credentials resolved, connecting, authenticated,
mailbox selected, the count of new messages, the start of each fetch batch and
its arrival, each message fetched, each message file written, each message that
fails to fetch, each message deleted, and indexing start / incremental progress
/ finish.

The credential milestones SHALL identify the password store (e.g. `keyring`,
`pass`, `plain`) and MAY include the credential reference key for the `keyring`
and `pass` backends. They SHALL NOT carry the resolved password, and for the
`plain` backend (where `credential_ref` holds the secret itself) they SHALL NOT
carry the reference.

#### Scenario: Progress is emitted when a sink is attached
- **WHEN** an `ImapWorker` configured with a progress sink runs `sync()`
- **THEN** the sink receives milestones in the order they occur during the sync

#### Scenario: No sink means no behaviour change
- **WHEN** an `ImapWorker` runs `sync()` without a progress sink
- **THEN** no progress is emitted and the sync result is identical to before

#### Scenario: Server path is unaffected
- **WHEN** `mailbrus-server` runs a sync (it attaches no progress sink)
- **THEN** the SSE `SyncEvent`/`IndexEvent` stream is unchanged

#### Scenario: The password value is never emitted
- **WHEN** credentials are resolved during a sync
- **THEN** the resolved password is not present in any `SyncProgress` milestone, and for the `plain` backend the `credential_ref` (which holds the secret) is not emitted either

---

### Requirement: Sync fetches, writes, indexes, and checkpoints in batches
`ImapWorker::sync` SHALL process new messages in bounded batches rather than
fetching every body in a single IMAP `FETCH`. For each batch it SHALL fetch the
bodies, write them to the maildir, index them into notmuch, and record their
UIDs in the sync state — completing one batch before fetching the next. This
bounds peak memory, streams progress on large mailboxes, makes mail searchable
as it arrives, and preserves already-pulled batches if a sync is interrupted.

#### Scenario: A large initial sync streams progress
- **WHEN** an account's first sync has thousands of new messages
- **THEN** messages are fetched and indexed in batches, and progress milestones are emitted throughout (not only after every message has been downloaded)

#### Scenario: Each batch is searchable and checkpointed before the next
- **WHEN** a batch has been fetched and indexed
- **THEN** its messages are queryable in notmuch and its UIDs are recorded in the sync state before the next batch is fetched

#### Scenario: An interrupted sync retains completed batches
- **WHEN** a sync is interrupted after some batches have completed
- **THEN** the next sync does not re-fetch the messages from those completed batches

