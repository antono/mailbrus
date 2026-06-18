# notmuch-database Delta Specification

## ADDED Requirements

### Requirement: SyncFinished event on SSE stream

After all account sync workers complete (whether `done` or `error`), the backend SHALL emit a single `SyncFinished` event on the `/api/sync/stream` SSE channel. The event SHALL carry `{"type":"sync_finished","accounts":["<id1>","<id2>",…]}` with the list of all account IDs that were part of the sync run.

#### Scenario: SyncFinished emitted after all accounts complete
- **WHEN** `sync_all()` spawns workers for all accounts and every worker reaches terminal status (`done` or `error`)
- **THEN** a `{"type":"sync_finished","accounts":["work","personal"]}` event is emitted on the SSE stream

#### Scenario: SyncFinished emitted even when no accounts are configured
- **WHEN** `sync_all()` is called but no accounts are configured
- **THEN** a `{"type":"sync_finished","accounts":[]}` event is emitted immediately

#### Scenario: SyncFinished emitted for single-account sync via `sync_account`
- **WHEN** `sync_account("work")` finishes and the worker reaches terminal status
- **THEN** a `{"type":"sync_finished","accounts":["work"]}` event is emitted

## MODIFIED Requirements

### Requirement: Indexing progress — desktop UI spinner

The mailbrus desktop frontend SHALL display a spinner in the status bar while indexing or sync is in progress. The spinner SHALL stop and the status bar SHALL return to idle when every account has reached a terminal state (i.e. a `SyncFinished` event has been received and no row has `status:"running"`). Clicking the spinner SHALL open a popup panel showing per-account, per-mailbox progress details along with aggregate stats and sync history.

#### Scenario: Spinner appears during active indexing
- **WHEN** an `IndexEvent` with `status:"running"` is received on the SSE stream
- **THEN** a spinner is visible in the status bar

#### Scenario: Spinner disappears after SyncFinished
- **WHEN** a `SyncFinished` event is received and all rows are terminal (`done` or `error`)
- **THEN** the spinner stops and the status bar returns to idle state

#### Scenario: Spinner disappears after single-account error
- **WHEN** a `SyncFinished` event is received and any account reported `error`
- **THEN** the spinner stops (idle state with error indicator)

#### Scenario: Popup shows progress details
- **WHEN** the user clicks the spinner during active indexing or sync
- **THEN** a popup opens showing per-account and per-mailbox rows with fetched/indexed counts and current status

#### Scenario: Popup shows aggregate stats
- **WHEN** the popup is open and at least one sync run exists
- **THEN** a summary header in the popup displays total fetched, total indexed, and total errors across all accounts for the current/last run

#### Scenario: Popup shows sync history
- **WHEN** the popup is open and prior sync runs exist
- **THEN** a history section lists up to 3 prior runs, each expandable to show per-account details

#### Scenario: Popup shows error details
- **WHEN** an event with `status:"error"` was received and the user opens the popup
- **THEN** the error message is visible in the relevant account/mailbox row

#### Scenario: Spinner stops on all accounts done
- **WHEN** a `SyncFinished` event is received
- **THEN** the spinner stops even if stale replica events arrive later (EventSource reconnect does not restart the spinner)

#### Scenario: Clear history button dismisses old logs
- **WHEN** the user clicks "Clear history" in the popup
- **THEN** all prior sync runs are removed and the popup shows only the current session
