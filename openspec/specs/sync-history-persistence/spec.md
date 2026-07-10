# sync-history-persistence Specification

## Purpose
TBD - created by archiving change ui-sync-status. Update Purpose after archive.
## Requirements
### Requirement: Sync run history in localStorage

The frontend SHALL keep a history of the last 3 completed sync runs in `localStorage` under the key `mailbrus_sync_history`. Each run SHALL store a `finishedAt` ISO-8601 timestamp and per-account `accountId`, `syncStatus`, `indexStatus`, `fetched`, `indexed`, and optional `error`. Runs SHALL be evicted FIFO when the count exceeds 3.

#### Scenario: Run saved on SyncFinished
- **WHEN** a `SyncFinished` event is received on the SSE stream
- **THEN** the current per-account rows are snapshotted with a `finishedAt` timestamp and appended to `localStorage['mailbrus_sync_history']`

#### Scenario: Only 3 runs retained
- **WHEN** a 4th `SyncFinished` event arrives
- **THEN** the oldest run is removed from the history so that exactly 3 runs remain

#### Scenario: History survives page reload
- **WHEN** the user closes and reopens the window
- **THEN** the `mailbrus_sync_history` in `localStorage` is read back and the last 3 runs are displayed in the sync status popup

#### Scenario: Empty history before first sync
- **WHEN** the app loads and no sync has ever run
- **THEN** the history section shows no entries and the popup shows "No sync activity yet."

### Requirement: Clear history action

The sync status popup SHALL include a "Clear history" control that removes all persisted sync runs from `localStorage` and clears the in-memory history.

#### Scenario: Clear history removes persisted entries
- **WHEN** the user clicks "Clear history" in the popup
- **THEN** `localStorage['mailbrus_sync_history']` is removed and the in-memory history array is emptied

#### Scenario: Clear history is hidden when history is empty
- **WHEN** no sync runs exist (fresh install or history already cleared)
- **THEN** no "Clear history" control is shown in the popup

