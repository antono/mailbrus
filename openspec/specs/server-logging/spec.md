## Purpose

Define configurable structured logging for the `mailbrus-server` HTTP server, enabling operators to control verbosity from key events only to full request/response details.

## Requirements

### Requirement: --log-level CLI flag with three levels
The `mailbrus-server` binary SHALL accept a `--log-level <LEVEL>` CLI flag (default: `info`) that sets both the tracing subscriber output level and the verbosity of log messages emitted per request.

#### Scenario: Default log level is info
- **WHEN** user runs `mailbrus-server` without `--log-level` flag
- **THEN** server uses `info` level: only request/response lines (method, path, status) are logged per request

#### Scenario: Debug level enabled
- **WHEN** user runs `mailbrus-server --log-level debug`
- **THEN** server logs at debug level, which includes debug + info + warn output
- **AND** handlers log full response bodies or key metadata for each request

#### Scenario: Warn level enabled
- **WHEN** user runs `mailbrus-server --log-level warn`
- **THEN** only startup events, errors, and non-2xx responses are logged

#### Scenario: Invalid log level rejected
- **WHEN** user runs `mailbrus-server --log-level invalid`
- **THEN** server exits with non-zero code and displays valid options: `debug`, `info`, `warn`

#### Scenario: RUST_LOG overrides --log-level
- **WHEN** user sets `RUST_LOG=debug` and runs `mailbrus-server --log-level warn`
- **THEN** the `RUST_LOG` value takes precedence for the tracing subscriber filter
- **AND** `--log-level` still controls which tracing macro (debug!/info!/warn!) the middleware uses per request

### Requirement: Request/response line at info level
All API requests SHALL produce a single log line with method, path, and status code.

#### Scenario: Logged via debug! at debug level
- **WHEN** log level is `debug` and a client requests any endpoint
- **THEN** middleware emits `[api] <METHOD> <PATH> -> <STATUS>` using `debug!`

#### Scenario: Logged via info! at info level
- **WHEN** log level is `info` and a client requests any endpoint
- **THEN** middleware emits `[api] <METHOD> <PATH> -> <STATUS>` using `info!`

#### Scenario: Only errors logged at warn level
- **WHEN** log level is `warn` and a client receives a 2xx response
- **THEN** no request/response line is emitted
- **WHEN** a client receives a 4xx or 5xx response
- **THEN** middleware emits `[api] <METHOD> <PATH> -> <STATUS>` using `warn!`

### Requirement: Full response body logging at debug level
At debug level, handlers additionally log the full response body before returning it (or key metadata for large payloads that would be impractical to log in full).

#### Scenario: GET /api/maildirs logs full JSON array
- **WHEN** `--log-level debug` and client requests `GET /api/maildirs`
- **THEN** handler logs `[api] GET /api/maildirs body: [{"id":"...","address":"...",...},...]`

#### Scenario: GET /api/maildirs/{id}/folders logs full JSON array
- **WHEN** `--log-level debug` and client requests `GET /api/maildirs/gmail/folders`
- **THEN** handler logs `[api] GET /api/maildirs/gmail/folders body: [{"id":"...","name":"...",...},...]`

#### Scenario: GET /api/maildirs/{id}/folders/{folder}/messages logs messages array with pagination
- **WHEN** `--log-level debug` and client requests `GET /api/maildirs/gmail/folders/INBOX/messages`
- **THEN** handler logs: `[api] GET /api/maildirs/gmail/folders/INBOX/messages body: page M/T count=N messages=[...]`
- **AND** the full messages array (message metadata, not email bodies) is included

#### Scenario: GET /api/messages/search logs messages array with count
- **WHEN** `--log-level debug` and client requests `GET /api/messages/search?q=from%3Amaya`
- **THEN** handler logs `[api] GET /api/messages/search body: count=N messages=[...]`

#### Scenario: GET /api/messages/{id} logs email metadata in YAML style
- **WHEN** `--log-level debug` and client requests `GET /api/messages/abc123`
- **THEN** handler logs the message metadata with each field on its own indented line:
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

#### Scenario: PATCH /api/messages/{id} logs id and operation
- **WHEN** `--log-level debug` and client sends `PATCH /api/messages/abc123`
- **THEN** handler logs `[api] PATCH /api/messages/abc123 op=<operation>`

#### Scenario: DELETE /api/messages/{id} logs id
- **WHEN** `--log-level debug` and client sends `DELETE /api/messages/abc123`
- **THEN** handler logs `[api] DELETE /api/messages/abc123`

#### Scenario: POST /api/send logs message id
- **WHEN** `--log-level debug` and client sends `POST /api/send`
- **THEN** handler logs `[api] POST /api/send msg_id=<id>`

#### Scenario: Push subscription endpoints log account
- **WHEN** `--log-level debug` and client sends `POST /api/push/subscribe`
- **THEN** handler logs `[api] POST /api/push/subscribe account=<account>` then `[api] subscription created for account <account>`

#### Scenario: Push unsubscribe logs account
- **WHEN** `--log-level debug` and client sends `DELETE /api/push/subscribe`
- **THEN** handler logs `[api] DELETE /api/push/subscribe account=<account>` then `[api] unsubscribed account <account>`

#### Scenario: GET /api/push/vapid-key is logged
- **WHEN** `--log-level debug` and client requests `GET /api/push/vapid-key`
- **THEN** handler logs `[api] GET /api/push/vapid-key`

### Requirement: Startup and shutdown logging
Server initialization and graceful shutdown events SHALL be logged at info or warn level regardless of `--log-level`.

#### Scenario: Startup logs configuration
- **WHEN** `mailbrus-server` starts
- **THEN** server logs `[startup] mailbrus-server starting` at info level
- **AND** logs `[startup] log-level: <LEVEL>` at info level

#### Scenario: Listening address logged
- **WHEN** server successfully binds to the listen address
- **THEN** server logs `[startup] listening on http://<ADDR>` at info level

#### Scenario: Public bind without auth is warned
- **WHEN** `--bind` resolves to a non-loopback address and `--auth` is not set
- **THEN** server logs `[startup] server is publicly accessible without authentication` at warn level

#### Scenario: Missing frontend dist is warned
- **WHEN** the `--frontend-dist` path does not exist at startup
- **THEN** server logs `[startup] frontend dist "..." does not exist; GET / will return 404` at warn level

#### Scenario: Browser open logged on startup
- **WHEN** user runs `mailbrus-server --browser`
- **THEN** server logs `[startup] opened browser at <URL>` at info on success
- **AND** logs `[startup] could not open browser at <URL>: <ERROR>` at warn on failure

#### Scenario: Shutdown is logged
- **WHEN** server stops
- **THEN** server logs `[shutdown] server stopped` at info on clean exit
- **AND** logs `[shutdown] server error: <ERROR>` at warn if axum::serve returns an error

### Requirement: Background task logging
The push-polling background task SHALL log its activity.

#### Scenario: Push poller starts
- **WHEN** push poller task is spawned at startup
- **THEN** logs `[push-poller] started polling for new messages` at info level

#### Scenario: Push poller skips when no subscriptions
- **WHEN** poller wakes up and no push subscriptions are registered
- **THEN** logs `[push-poller] no active subscriptions, skipping poll` at debug level

#### Scenario: Push poller logs maildir check
- **WHEN** poller finds active subscriptions and begins checking maildirs
- **THEN** logs `[push-poller] checking N maildir(s) for new messages` at debug level

#### Scenario: Push poller detects new messages
- **WHEN** poller finds new messages for an account since the last poll
- **THEN** logs `[push-poller] N new messages for account <ACCOUNT>` at info level
- **AND** logs `[push-poller] sending notification to <ENDPOINT_PREFIX>` at debug level for each subscriber

#### Scenario: Push poller handles errors
- **WHEN** poller encounters a task or maildir-reader error
- **THEN** logs the error with `[push-poller]` prefix at warn level and continues on the next cycle

### Requirement: Error logging
API-level failures SHALL be logged at warn level with context.

#### Scenario: Blocking task failure logged
- **WHEN** a `spawn_blocking` task panics or is cancelled
- **THEN** handler logs `[api] task error: <ERROR>` at warn level

#### Scenario: Maildir/notmuch operation failure logged
- **WHEN** a maildir reader or notmuch operation returns an error
- **THEN** handler logs `[api] <METHOD> <PATH> error: <ERROR>` at warn level

#### Scenario: Message not found logged
- **WHEN** a requested message id does not exist
- **THEN** handler logs `[api] GET /api/messages/<ID> not found` at warn level

### Requirement: Structured logging prefixes
All log messages SHALL use a bracketed prefix to identify the subsystem.

| Prefix          | Used by                                        |
|-----------------|------------------------------------------------|
| `[api]`         | HTTP middleware and all API endpoint handlers  |
| `[startup]`     | main() initialization before bind              |
| `[shutdown]`    | main() after axum::serve returns               |
| `[push-poller]` | background push-notification polling task      |
| `[pwa]`         | PWA subsystem init (e.g. VAPID key generation) |
