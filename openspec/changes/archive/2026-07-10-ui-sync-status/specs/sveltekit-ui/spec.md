# sveltekit-ui Delta Specification

## MODIFIED Requirements

### Requirement: Trigger sync from the UI

The desktop frontend SHALL provide an in-app affordance to start an on-demand mail sync without leaving the app. Triggering a sync SHALL issue `POST /api/sync` (all accounts) or `POST /api/sync/<account>` (one account) and SHALL reflect progress through the existing `/api/sync/stream` SSE channel. On click, the UI SHALL immediately show an optimistic "started sync" state and disable the trigger control until a complete run (all accounts terminal or `SyncFinished` event) concludes.

#### Scenario: Sync now — optimistic started state
- **WHEN** the user activates "Sync now" in the status-bar popup
- **THEN** the button immediately changes to "Started…" and is disabled, before the SSE stream delivers any event

#### Scenario: Sync now event overrides optimistic state
- **WHEN** the first SSE event (e.g. `{"type":"sync","status":"running"}`) arrives after optimistic start
- **THEN** the button shows "Syncing…" (still disabled) and the spinner appears in the toggle

#### Scenario: Sync via command palette
- **WHEN** the user runs the "Sync mail" command from the command palette
- **THEN** the frontend issues `POST /api/sync` for all configured accounts and the status bar shows optimistic started state

#### Scenario: Sync via hotkey
- **WHEN** the user presses the sync hotkey while not typing in an input field
- **THEN** the frontend issues `POST /api/sync` for all configured accounts and the status bar shows optimistic started state

#### Scenario: Trigger is disabled while a sync is in flight
- **WHEN** any sync is running (optimistic `started` flag set, or any row has `status:"running"`)
- **THEN** the "Sync now" control is disabled until the in-flight sync reaches a terminal state (all rows `done`/`error` or `SyncFinished` received)

#### Scenario: Optimistic state cleared on SyncFinished
- **WHEN** a `SyncFinished` event is received
- **THEN** the optimistic state is cleared and the control returns to idle/enabled

#### Scenario: Trigger failure surfaces an error
- **WHEN** the sync request returns a non-2xx response (e.g. `503` no sync engine configured)
- **THEN** the UI surfaces the error, clears the optimistic state, and leaves the control enabled
