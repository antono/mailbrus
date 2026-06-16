## ADDED Requirements

### Requirement: SyncEngine dispatches per-account IMAP workers
`mailbrus-core` SHALL expose a `SyncEngine` that accepts an account registry and
dispatches an async IMAP sync worker per configured account.

#### Scenario: Sync all accounts
- **WHEN** `SyncEngine::sync_all()` is called
- **THEN** one async task is spawned per configured IMAP account
- **AND** each task runs independently; a failure in one account SHALL NOT abort others

#### Scenario: Sync single account
- **WHEN** `SyncEngine::sync_account(id)` is called with a valid account id
- **THEN** only that account's worker is started
- **AND** the method returns an error if the account id is unknown

#### Scenario: Concurrent sync guard
- **WHEN** `sync_account(id)` is called while a sync for that account is already running
- **THEN** the call returns a `SyncError::AlreadyRunning` error immediately
- **AND** the existing sync continues unaffected

### Requirement: IMAP worker performs delta sync via CONDSTORE
The IMAP worker SHALL use IMAP CONDSTORE (`CHANGEDSINCE highestModSeq`) when the
server advertises the `CONDSTORE` capability.

#### Scenario: Delta sync with CONDSTORE
- **WHEN** the IMAP server supports CONDSTORE and a previous `highestModSeq` is stored
- **THEN** the worker fetches only messages changed since that modseq
- **AND** updates `highestModSeq` in the sync state DB after a successful fetch

#### Scenario: Full sync fallback without CONDSTORE
- **WHEN** the IMAP server does not advertise CONDSTORE
- **THEN** the worker performs a full UID scan to detect new and deleted messages
- **AND** logs a warning indicating CONDSTORE is unavailable

#### Scenario: UIDVALIDITY change triggers full resync
- **WHEN** the server returns a `UIDVALIDITY` that differs from the stored value
- **THEN** the worker discards all stored UIDs and modseq for that mailbox
- **AND** performs a full resync of that mailbox

### Requirement: New messages are written to maildir and indexed in notmuch
The IMAP worker SHALL write fetched messages to the account's maildir path and index
them in the notmuch database.

#### Scenario: New message written and indexed
- **WHEN** the worker fetches a message not yet in the local maildir
- **THEN** the raw RFC 822 bytes are written to `<maildir_root>/<mailbox>/cur/<uid>:2,`
- **AND** `notmuch Database::index_file()` is called for the new file
- **AND** the tag `account:<account-id>` is applied to the indexed message

#### Scenario: Deleted message handled
- **WHEN** a UID present in stored state is absent from the server's UID set
- **THEN** the corresponding maildir file is removed
- **AND** the notmuch message is updated with `tag:deleted`

### Requirement: Sync state is persisted in SQLite
The IMAP worker SHALL persist per-mailbox sync cursors in a SQLite database at
`$XDG_DATA_HOME/mailbrus/sync.db`.

#### Scenario: State persisted after successful sync
- **WHEN** a mailbox sync completes without error
- **THEN** `highest_modseq`, `uid_validity`, and `last_sync_at` are written to
  `imap_mailbox_state` for `(account_id, mailbox_name)`

#### Scenario: State database created on first run
- **WHEN** `sync.db` does not exist
- **THEN** it is created with the schema applied before the first sync begins

### Requirement: notmuch database is opened read-write only during sync
The notmuch database SHALL be opened in `ReadWrite` mode only for the duration of a
sync operation, to avoid contention with the HTTP API (which uses read-only access).

#### Scenario: Write lock released after sync
- **WHEN** an IMAP sync completes (success or failure)
- **THEN** the notmuch `ReadWrite` handle is dropped before the worker task exits
