## ADDED Requirements

### Requirement: Trigger sync from the UI
The desktop frontend SHALL provide an in-app affordance to start an on-demand
mail sync without leaving the app. Triggering a sync SHALL issue `POST /api/sync`
(all accounts) or `POST /api/sync/<account>` (one account) and SHALL reflect
progress through the existing `/api/sync/stream` SSE channel.

#### Scenario: Sync now from the status bar
- **WHEN** the user opens the status-bar popup and activates "Sync now"
- **THEN** the frontend issues `POST /api/sync` and the status bar enters its active (spinner) state once a `running` event is received

#### Scenario: Sync via command palette
- **WHEN** the user runs the "Sync mail" command from the command palette
- **THEN** the frontend issues `POST /api/sync` for all configured accounts

#### Scenario: Sync via hotkey
- **WHEN** the user presses the sync hotkey while not typing in an input field
- **THEN** the frontend issues `POST /api/sync` for all configured accounts

#### Scenario: Trigger is disabled while a sync is in flight
- **WHEN** a sync is already running (any row has `status:"running"`)
- **THEN** the "Sync now" control is disabled until the in-flight sync reaches a terminal `done`/`error` state

#### Scenario: Trigger failure surfaces an error
- **WHEN** the sync request returns a non-2xx response (e.g. `503` no sync engine configured)
- **THEN** the UI surfaces the error and does not leave the control stuck in a pending state
