## Purpose

Define configurable structured logging for the `mailbrus-server` HTTP server, enabling operators to control verbosity from key events only to full request/response details.

## Requirements

### Requirement: --log-level CLI flag with three levels
The `mailbrus-server` binary SHALL accept a `--log-level` CLI flag with three distinct verbosity levels (default: `info`).

#### Scenario: Default log level is info
- **WHEN** user runs `mailbrus-server` without `--log-level` flag
- **THEN** server uses `info` level and logs only request/response metadata (method, path, status code)

#### Scenario: Debug level enabled
- **WHEN** user runs `mailbrus-server --log-level debug`
- **THEN** server logs full request details and response payloads at each endpoint

#### Scenario: Warn level enabled
- **WHEN** user runs `mailbrus-server --log-level warn`
- **THEN** server only logs startup events, shutdown status, and errors (non-2xx status codes)

#### Scenario: Invalid log level rejected
- **WHEN** user runs `mailbrus-server --log-level invalid`
- **THEN** server exits with non-zero code and displays valid options (debug, info, warn)

### Requirement: Request/response logging at info level and above
All API endpoints SHALL log their HTTP method, path, and status code at info level or above.

#### Scenario: GET request logged at info level
- **WHEN** a client requests `GET /api/maildirs`
- **THEN** middleware logs `[api] GET /api/maildirs -> 200` at info level

#### Scenario: POST request logged at info level
- **WHEN** a client sends `POST /api/push/subscribe` 
- **THEN** middleware logs `[api] POST /api/push/subscribe -> 200` at info level

#### Scenario: DELETE request logged at info level
- **WHEN** a client sends `DELETE /api/messages/abc123`
- **THEN** middleware logs `[api] DELETE /api/messages/abc123 -> 200` at info level

#### Scenario: Non-success status logged at info level
- **WHEN** a client requests a non-existent maildir `GET /api/maildirs/notfound/folders`
- **THEN** middleware logs `[api] GET /api/maildirs/notfound/folders -> 404` at info level

### Requirement: Full response body logging at debug level
At debug level, endpoints additionally log the full response body (or key metadata for large payloads).

#### Scenario: GET /api/maildirs logs full response body
- **WHEN** a client requests `GET /api/maildirs` at debug level
- **THEN** server logs `[api] GET /api/maildirs body: [{"id":"...","address":"...",...},...]` with the complete JSON array
- **AND** also logs the info-level `[api] GET /api/maildirs -> 200`

#### Scenario: GET /api/maildirs/{id}/folders logs full response body
- **WHEN** a client requests `GET /api/maildirs/gmail/folders` at debug level
- **THEN** server logs `[api] GET /api/maildirs/gmail/folders body: [{"id":"...","name":"...",...},...]` with the complete JSON array

#### Scenario: GET /api/maildirs/{id}/folders/{folder}/messages logs full messages array
- **WHEN** a client requests `GET /api/maildirs/gmail/folders/INBOX/messages?page=2&per_page=50` at debug level
- **THEN** server logs `[api] GET /api/maildirs/.../messages body: page M/T count=N messages=[...]` including the full messages array with message metadata

#### Scenario: GET /api/messages/search logs full messages array
- **WHEN** a client requests `GET /api/messages/search?q=from%3Amaya` at debug level
- **THEN** server logs `[api] GET /api/messages/search body: count=N messages=[...]` with the full messages array

#### Scenario: GET /api/messages/{id} logs key headers in YAML style
- **WHEN** a client requests `GET /api/messages/abc123` at debug level
- **THEN** server logs the message metadata with each field on its own indented line:
  ```
  [api] GET /api/messages/abc123
    from: Alice <alice@example.com>
    to: Bob <bob@example.com>
    subject: Hello World
    date: Mon, 1 Jan 2024 12:00:00 +0000
    attachments: 2
    body_len: 4096
  ```
- **AND** the email body text itself is not logged (may be arbitrarily large)

#### Scenario: PATCH /api/messages/{id} logs operation
- **WHEN** a client sends `PATCH /api/messages/abc123` with operation type at debug level
- **THEN** server logs `[api] PATCH /api/messages/abc123 op=<operation>` at debug level

#### Scenario: DELETE /api/messages/{id} logs operation
- **WHEN** a client sends `DELETE /api/messages/abc123` at debug level
- **THEN** server logs `[api] DELETE /api/messages/abc123` at debug level

#### Scenario: POST /api/send logs message details
- **WHEN** a client sends `POST /api/send` with message id at debug level
- **THEN** server logs `[api] POST /api/send msg_id=<id>` at debug level

#### Scenario: Push subscription endpoints log account
- **WHEN** a client sends `POST /api/push/subscribe` with account at debug level
- **THEN** server logs `[api] POST /api/push/subscribe account=<account>` and `subscription created for account <account>` at debug level

#### Scenario: Push unsubscribe logs account
- **WHEN** a client sends `DELETE /api/push/subscribe` for an account at debug level
- **THEN** server logs `[api] DELETE /api/push/subscribe account=<account>` and `unsubscribed account <account>` at debug level

#### Scenario: GET /api/push/vapid-key logs at debug level
- **WHEN** a client requests `GET /api/push/vapid-key` at debug level
- **THEN** server logs `[api] GET /api/push/vapid-key` at debug level

### Requirement: Startup and shutdown logging
Server initialization and graceful shutdown events SHALL be logged with context.

#### Scenario: Startup logs configuration
- **WHEN** `mailbrus-server` starts
- **THEN** server logs `[startup] mailbrus-server starting` and `[startup] log-level: <LEVEL>` at info level
- **AND** logs frontend dist validation status at info level
- **AND** logs public accessibility warning at warn level if non-loopback binding without auth

#### Scenario: Browser open logged on startup
- **WHEN** user runs `mailbrus-server --browser`
- **THEN** server logs `[startup] opened browser at <URL>` on success
- **AND** logs warning if browser open fails

#### Scenario: Listening address logged
- **WHEN** server successfully binds to the listen address
- **THEN** server logs `[startup] listening on http://<ADDR>` at info level

#### Scenario: Shutdown is logged
- **WHEN** server gracefully shuts down
- **THEN** server logs `[shutdown] server stopped` on success
- **AND** logs `[shutdown] server error: <ERROR>` if shutdown encounters error

### Requirement: Background task logging
Long-running tasks (push polling) SHALL log their activity.

#### Scenario: Push poller starts
- **WHEN** `mailbrus-server` initializes the push notification poller
- **THEN** server logs `[push-poller] started polling for new messages` at info level

#### Scenario: Push poller skips empty subscriptions
- **WHEN** push poller wakes up but no accounts are subscribed
- **THEN** server logs `[push-poller] no active subscriptions, skipping poll` at debug level

#### Scenario: Push poller detects new messages
- **WHEN** push poller finds N new messages for an account
- **THEN** server logs `[push-poller] N new messages for account <ACCOUNT>` at info level
- **AND** logs each push notification send at debug level

#### Scenario: Push poller handles errors
- **WHEN** push poller encounters an error listing maildirs
- **THEN** server logs the error with `[push-poller]` prefix at warn level
- **AND** continues polling on next cycle

### Requirement: Error and warning logging
API errors and warning conditions SHALL be logged at appropriate levels.

#### Scenario: 4xx and 5xx responses logged
- **WHEN** an endpoint returns a 4xx or 5xx status code
- **THEN** server logs `[api] METHOD PATH -> STATUS` at warn level

#### Scenario: Blocking operation failures logged
- **WHEN** a task (spawned via spawn_blocking) fails
- **THEN** server logs `[endpoint] task error: <ERROR>` at warn level

#### Scenario: Database access failures logged
- **WHEN** maildir reader or notmuch operations fail
- **THEN** server logs error description and relevant context at warn level

### Requirement: Structured logging tags
All log messages SHALL use consistent prefixes to identify context.

#### Scenario: API endpoint logs use [api] prefix
- **WHEN** any API handler or middleware logs a message
- **THEN** the message begins with `[api]`

#### Scenario: Startup logs use [startup] prefix
- **WHEN** initialization code logs a message
- **THEN** the message begins with `[startup]`

#### Scenario: Shutdown logs use [shutdown] prefix
- **WHEN** graceful shutdown logs a message
- **THEN** the message begins with `[shutdown]`

#### Scenario: Push poller logs use [push-poller] prefix
- **WHEN** push polling task logs a message
- **THEN** the message begins with `[push-poller]`

#### Scenario: PWA logs use [pwa] prefix
- **WHEN** PWA-related initialization logs (like VAPID key)
- **THEN** the message begins with `[pwa]`

### Requirement: Integration with RUST_LOG environment variable
The logging system SHALL respect the `RUST_LOG` environment variable for fine-grained control.

#### Scenario: RUST_LOG filter applied
- **WHEN** user runs `RUST_LOG=debug mailbrus-server --log-level warn`
- **THEN** server respects both the CLI flag and RUST_LOG filter
- **AND** filters are applied according to tracing-subscriber rules

### Requirement: Log level state stored in AppState
The configured log level SHALL be available to all handlers via AppState.

#### Scenario: Log level accessible in middleware
- **WHEN** logging middleware processes a request
- **THEN** it can read `state.log_level` to determine verbosity
- **AND** adapts logging output accordingly

#### Scenario: Log level accessible in endpoint handlers
- **WHEN** an endpoint handler needs to log conditionally
- **THEN** it can read `state.log_level` if needed for context-specific logging
