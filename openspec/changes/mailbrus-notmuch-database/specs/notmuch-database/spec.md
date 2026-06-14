## ADDED Requirements

### Requirement: Isolated database location
Mailbrus SHALL maintain its notmuch database exclusively rooted at `$XDG_DATA_HOME/mailbrus/` (with the index in the hidden `$XDG_DATA_HOME/mailbrus/.notmuch/` subdirectory and account maildirs under `$XDG_DATA_HOME/mailbrus/mail/`). It SHALL NOT read, write, or reference the system notmuch config (`~/.notmuch-config`) or any user-configured notmuch database path.

#### Scenario: Database path is always internal
- **WHEN** mailbrus-server starts
- **THEN** the notmuch database path resolves to `$XDG_DATA_HOME/mailbrus/` regardless of any system notmuch installation

#### Scenario: System notmuch config is untouched
- **WHEN** mailbrus-server starts and `~/.notmuch-config` exists
- **THEN** `~/.notmuch-config` is not read and its contents are not modified

---

### Requirement: Auto-initialization
Mailbrus SHALL automatically create and initialize the notmuch database on first startup if it does not exist. No manual `notmuch new` or user action SHALL be required.

#### Scenario: First startup creates database
- **WHEN** mailbrus-server starts and `$XDG_DATA_HOME/mailbrus/.notmuch/` does not exist
- **THEN** the database is created before any sync or query operation proceeds

#### Scenario: Existing database is not overwritten
- **WHEN** mailbrus-server starts and the database already exists
- **THEN** the existing database is opened as-is without re-initialization

---

### Requirement: Generated notmuch config
Mailbrus SHALL write a notmuch config file to `$XDG_DATA_HOME/mailbrus/notmuch.cfg` on every startup, registering all configured account maildir roots. This file is owned by mailbrus and SHALL be regenerated on startup.

#### Scenario: Config registers account maildirs
- **WHEN** mailbrus-server starts with one or more configured accounts
- **THEN** `notmuch.cfg` contains each account's resolved maildir root under `[database] path`

#### Scenario: Config is regenerated on startup
- **WHEN** an account is added to `config.toml` and mailbrus-server is restarted
- **THEN** the new account's maildir root appears in `notmuch.cfg`

---

### Requirement: Indexing progress events — machine-readable
After indexing new messages into notmuch, mailbrus SHALL emit `IndexEvent` objects on the `/api/sync/stream` SSE channel. Events SHALL be JSON with at minimum `type`, `status`, `indexed`, and optionally `error` fields.

#### Scenario: Indexing emits running event
- **WHEN** mailbrus begins indexing fetched messages into notmuch
- **THEN** an event `{"type":"index","status":"running","indexed":0}` is emitted on the SSE stream

#### Scenario: Indexing emits done event
- **WHEN** indexing completes successfully
- **THEN** an event `{"type":"index","status":"done","indexed":<N>}` is emitted with the count of indexed messages

#### Scenario: Indexing emits error event
- **WHEN** indexing fails (e.g. notmuch DB locked, corrupt message)
- **THEN** an event `{"type":"index","status":"error","indexed":<N>,"error":"<message>"}` is emitted

#### Scenario: SyncEvent carries type discriminator
- **WHEN** a sync progress event is emitted
- **THEN** it includes `"type":"sync"` so consumers can distinguish it from `IndexEvent`

---

### Requirement: Indexing progress — desktop UI spinner
The mailbrus desktop frontend SHALL display a spinner in the status bar while indexing or sync is in progress. Clicking the spinner SHALL open a popup panel showing per-account, per-mailbox progress details.

#### Scenario: Spinner appears during active indexing
- **WHEN** an `IndexEvent` with `status:"running"` is received on the SSE stream
- **THEN** a spinner is visible in the status bar

#### Scenario: Spinner disappears after completion
- **WHEN** an `IndexEvent` with `status:"done"` or `status:"error"` is received
- **THEN** the spinner stops and the status bar returns to idle state

#### Scenario: Popup shows progress details
- **WHEN** the user clicks the spinner during active indexing or sync
- **THEN** a popup opens showing per-account and per-mailbox rows with fetched/indexed counts and current status

#### Scenario: Popup shows error details
- **WHEN** an event with `status:"error"` was received and the user opens the popup
- **THEN** the error message is visible in the relevant account/mailbox row
