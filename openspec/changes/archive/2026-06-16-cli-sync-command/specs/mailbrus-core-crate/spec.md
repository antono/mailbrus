## ADDED Requirements

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
