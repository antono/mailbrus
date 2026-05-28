## ADDED Requirements

### Requirement: Server exposes a sync trigger endpoint
`mailbrus-server` SHALL expose `POST /api/sync` and `POST /api/sync/:account` to
trigger IMAP synchronization.

#### Scenario: Sync all accounts triggered
- **WHEN** `POST /api/sync` is called
- **THEN** the server responds `202 Accepted` with `{"job": "all"}`
- **AND** sync workers are started asynchronously for all configured accounts

#### Scenario: Sync single account triggered
- **WHEN** `POST /api/sync/:account` is called with a valid account id
- **THEN** the server responds `202 Accepted` with `{"job": "<account>"}`

#### Scenario: Sync for unknown account
- **WHEN** `POST /api/sync/:account` is called with an unrecognised account id
- **THEN** the server responds `404` with a JSON error body

#### Scenario: Sync already running
- **WHEN** `POST /api/sync/:account` is called while that account is already syncing
- **THEN** the server responds `409 Conflict` with `{"error": "sync already running"}`

### Requirement: Server streams sync progress via SSE
`mailbrus-server` SHALL expose `GET /api/sync/stream` returning an SSE stream of
sync events.

#### Scenario: SSE stream delivers progress events
- **WHEN** a client connects to `GET /api/sync/stream` and a sync is running
- **THEN** the server emits `data: {"account":"<id>","status":"<status>","count":<n>}`
  events as messages are fetched

#### Scenario: SSE stream delivers completion event
- **WHEN** a sync completes (success or failure)
- **THEN** the server emits a final event with `"status": "done"` or `"status": "error"`

## MODIFIED Requirements

### Requirement: Server reads account list from config file
`mailbrus-server` SHALL load the account list from the mailbrus config file at startup
rather than inferring accounts from the notmuch root directory listing.

#### Scenario: Accounts loaded from config at startup
- **WHEN** the server starts and a valid config file exists
- **THEN** `AppState` contains an account registry built from the parsed `AccountConfig` list
- **AND** `GET /api/maildirs` returns only accounts present in the config file

#### Scenario: No config file at startup
- **WHEN** the server starts and no config file exists
- **THEN** the server starts successfully with an empty account registry
- **AND** `GET /api/maildirs` returns an empty list
- **AND** a warning is logged

#### Scenario: Config path overridden via CLI flag
- **WHEN** the server is started with `--config <path>`
- **THEN** that path is used to load the account config instead of the XDG default
