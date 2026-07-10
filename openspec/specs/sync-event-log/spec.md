# sync-event-log Specification

## Purpose
TBD - created by archiving change sync-status-bar-redesign. Update Purpose after archive.
## Requirements
### Requirement: Event capture with timestamps
The system SHALL capture sync events with ISO8601 timestamps and persist them throughout the session.

#### Scenario: Events include account context
- **WHEN** a sync event occurs
- **THEN** event record contains: timestamp (ISO8601), account ID, event type, optional detail field

#### Scenario: Supported event types
- **WHEN** sync progresses through phases
- **THEN** system captures events: "checking_password", "password_retrieved_<type>", "connecting", "connected", "fetching", "fetched", "indexed"

#### Scenario: Events are stored in session memory
- **WHEN** sync events are captured
- **THEN** events are stored in a module-level reactive array (Svelte rune) for live UI updates

### Requirement: Display 15 latest events in popup
The popup SHALL show the 15 most recent events from the current sync run.

#### Scenario: Latest 15 events shown first
- **WHEN** popup is open
- **THEN** popup body displays events in reverse chronological order (newest at top)

#### Scenario: Each event shows timestamp and type
- **WHEN** popup displays events
- **THEN** each event row shows: formatted time (HH:MM:SS), account, event type, and optional detail

#### Scenario: Events update live during sync
- **WHEN** new events arrive during active sync
- **THEN** popup immediately reflects new events (no manual refresh needed)

### Requirement: Expandable history within current run
Events beyond the 15 latest from the current run SHALL be accessible via expansion without opening another modal.

#### Scenario: Show remaining events count
- **WHEN** more than 15 events exist in current run
- **THEN** popup shows "X more events" indicator or scrollable area

#### Scenario: Scroll or expand to view older events in run
- **WHEN** user scrolls down in popup event list OR clicks expand button
- **THEN** earlier events from current run become visible

### Requirement: Event log persistence to localStorage
The system SHALL persist events to localStorage with a 2000-line total capacity.

#### Scenario: Events saved to localStorage on each arrival
- **WHEN** a sync event is captured
- **THEN** event is appended to `mailbrus_sync_events` localStorage key (within 100ms)

#### Scenario: Load persisted events on app mount
- **WHEN** app initializes
- **THEN** system loads events from `mailbrus_sync_events` localStorage and restores session state

#### Scenario: Trim history to 2000 lines
- **WHEN** persisted events exceed 2000 lines
- **THEN** oldest events are removed (FIFO) until total ≤ 2000 lines

### Requirement: Mark completed sync runs in history
Completed sync runs SHALL be marked and archived in localStorage for historical review.

#### Scenario: Add completion event on sync finish
- **WHEN** sync completes (success or error)
- **THEN** system adds "sync_completed" or "sync_failed" event with result summary

#### Scenario: New runs separated in history
- **WHEN** next sync starts after previous one completed
- **THEN** new events begin a new logical run; prior run is marked archived in localStorage

#### Scenario: Expand historical runs in popup
- **WHEN** user expands "History" section in popup
- **THEN** past completed runs are displayed with time and run summary (e.g., "3 accounts, 150 messages")

### Requirement: Password event sanitization
Password-related events SHALL NOT include sensitive data in the log.

#### Scenario: Password event redacted in log
- **WHEN** "password_retrieved_<type>" event is logged
- **THEN** detail field shows type (e.g., "keyring", "file") but not the password value itself

#### Scenario: No password or credentials in event detail
- **WHEN** any event is persisted to localStorage or displayed in popup
- **THEN** no plaintext passwords, tokens, or credentials appear in any event field

### Requirement: Event log export for debugging
Event logs SHALL be accessible for support/debugging purposes.

#### Scenario: Copy log to clipboard
- **WHEN** user opens popup
- **THEN** there is a "Copy log" button that copies all visible events as plain text to clipboard

#### Scenario: Log export format is human-readable
- **WHEN** events are exported or copied
- **THEN** format is plain text with one event per line: `[HH:MM:SS] account: event_type (detail)`

### Requirement: Clear history action
Users SHALL be able to clear the event history from localStorage.

#### Scenario: Clear history button in popup
- **WHEN** popup is open and history section is visible
- **THEN** a "Clear history" button removes all historical runs from localStorage

#### Scenario: Confirmation before clear
- **WHEN** user clicks "Clear history"
- **THEN** browser confirm dialog appears asking "Clear all sync history? This cannot be undone." before deletion

### Requirement: Handle rapid events without loss
The system SHALL buffer and display events even if they arrive rapidly during sync.

#### Scenario: Events captured in order even if rapid
- **WHEN** multiple events arrive within 100ms
- **THEN** all events are captured and stored in order (no loss, no duplication)

#### Scenario: Popup renders all buffered events
- **WHEN** popup opens after rapid event burst
- **THEN** all events are visible and correctly ordered

