## ADDED Requirements

### Requirement: Server-side flag changes propagate to stored messages
When a message already present in local state has different flags on the server,
the IMAP worker SHALL update the local copy's flags rather than ignoring the
message. A UID reported as changed SHALL NOT be discarded merely because its body
is already stored.

#### Scenario: Message marked read on another client
- **WHEN** a UID already in stored state is reported by the server with the
  `\Seen` flag set, and stored state records it as unseen
- **THEN** the local maildir entry for that UID is updated to carry the `S` flag
- **AND** the message is re-indexed so a notmuch query for unread mail no longer
  returns it
- **AND** the new flag set is recorded in stored state for that UID

#### Scenario: Message unflagged on another client
- **WHEN** a UID already in stored state is reported by the server without a flag
  that stored state records as present
- **THEN** that flag is removed from the local maildir entry
- **AND** the new flag set is recorded in stored state for that UID

#### Scenario: Flag change preserves message identity
- **WHEN** a stored message's flags are updated
- **THEN** its stable maildir identifier is unchanged
- **AND** its stored `(account_id, mailbox_name, uid)` row is updated in place
  rather than deleted and re-inserted
- **AND** the message body is not re-fetched from the server

#### Scenario: Unchanged flags cause no write
- **WHEN** a UID is reported as changed but its flag set matches stored state
- **THEN** no maildir rename occurs
- **AND** no re-index is performed for that message

## MODIFIED Requirements

### Requirement: New messages are written to maildir and indexed in notmuch
The IMAP worker SHALL write fetched messages to the account's maildir path and index
them in the notmuch database. Delivery SHALL follow the maildir delivery protocol:
a message SHALL NOT be observable in its destination directory until all of its
bytes have been written. The destination filename SHALL NOT be derived from the
IMAP UID; the worker SHALL record the identifier assigned at delivery time.

#### Scenario: New message written and indexed
- **WHEN** the worker fetches a message not yet in the local maildir
- **THEN** the raw RFC 822 bytes are first written under
  `<maildir_root>/<mailbox>/tmp/` and then moved into the destination directory
  by an atomic rename
- **AND** the message's flags are encoded in the delivered filename per the
  maildir convention
- **AND** `notmuch Database::index_file()` is called for the new file
- **AND** the tag `account:<account-id>` is applied to the indexed message

#### Scenario: Concurrent reader never observes a partial message
- **WHEN** a reader lists the destination directory while a delivery is in
  progress
- **THEN** the in-progress message is either absent or present in full
- **AND** no partially written file is visible in the destination directory

#### Scenario: Deleted message handled
- **WHEN** a UID present in stored state is absent from the server's UID set
- **THEN** the maildir entry identified by that UID's stored identifier is removed,
  regardless of the flags currently encoded in its filename
- **AND** the notmuch message is updated with `tag:deleted`

### Requirement: Sync state is persisted in SQLite
The IMAP worker SHALL persist per-mailbox sync cursors in a SQLite database at
`$XDG_DATA_HOME/mailbrus/sync.db`. Per-message state SHALL key each UID to the
stable identifier assigned at delivery, not to a filename that encodes mutable
flags, and SHALL record the last-known server flag set and a content revision for
each stored message.

#### Scenario: State persisted after successful sync
- **WHEN** a mailbox sync completes without error
- **THEN** `highest_modseq`, `uid_validity`, and `last_sync_at` are written to
  `imap_mailbox_state` for `(account_id, mailbox_name)`

#### Scenario: State database created on first run
- **WHEN** `sync.db` does not exist
- **THEN** it is created with the schema applied before the first sync begins

#### Scenario: Per-message state records identifier, flags and revision
- **WHEN** a message is delivered to the maildir
- **THEN** its stored row records the delivery identifier, the server flag set
  applied at delivery, and a content revision
- **AND** the identifier remains valid after a subsequent flag change

#### Scenario: Revision detects a local edit before overwrite
- **WHEN** a stored message's on-disk content no longer matches its recorded
  revision
- **THEN** the worker SHALL report the divergence rather than silently
  overwriting the local copy

#### Scenario: Existing databases migrate by full resync
- **WHEN** a `sync.db` written before per-message identifiers were recorded is
  opened
- **THEN** the schema is upgraded and stored per-message state is discarded for
  every mailbox
- **AND** the next sync re-fetches and re-delivers those messages through the
  atomic delivery path
- **AND** per-mailbox `uid_validity` and `highest_modseq` cursors are reset so no
  message is skipped
