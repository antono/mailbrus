## ADDED Requirements

### Requirement: mailbrus-server crate in workspace
A `mailbrus-server` binary crate SHALL exist at `mailbrus-server/` in the workspace root and SHALL be listed in the root `Cargo.toml` `members` array.

#### Scenario: Workspace builds server crate
- **WHEN** user runs `cargo build --workspace`
- **THEN** `target/debug/mailbrus-server` binary is produced with no errors

### Requirement: Server starts and listens on configurable address
`mailbrus-server` SHALL accept a `--bind <ADDR:PORT>` CLI flag (default `127.0.0.1:8080`) and start an HTTP listener on that address.

#### Scenario: Default bind
- **WHEN** user runs `mailbrus-server` with no flags
- **THEN** server listens on `127.0.0.1:8080` and prints `Listening on http://127.0.0.1:8080` to stdout

#### Scenario: Custom bind address
- **WHEN** user runs `mailbrus-server --bind 0.0.0.0:9000`
- **THEN** server listens on all interfaces on port 9000

#### Scenario: Port already in use
- **WHEN** the specified port is already bound by another process
- **THEN** server exits with a non-zero code and prints a descriptive error to stderr

### Requirement: Server serves SvelteKit frontend static files
The server SHALL serve files from the directory specified by `--frontend-dist <PATH>` (default `./build`) at the root path `/`.

#### Scenario: Frontend assets served
- **WHEN** browser requests `GET /`
- **THEN** server responds with the `index.html` from the frontend dist directory

#### Scenario: Missing frontend dist directory
- **WHEN** the `--frontend-dist` path does not exist at startup
- **THEN** server starts but logs a warning; `GET /` returns 404 until the directory is present

#### Scenario: SPA fallback
- **WHEN** browser requests a path that is not a static file (e.g. `/inbox`)
- **THEN** server responds with `index.html` so SvelteKit client-side routing handles the path

### Requirement: GET /api/maildirs — list maildirs
`GET /api/maildirs` SHALL return a JSON array of configured maildirs from the notmuch database.

#### Scenario: Maildirs returned
- **WHEN** client sends `GET /api/maildirs`
- **THEN** server responds 200 with `Content-Type: application/json` and a JSON array of maildir objects with at minimum `id`, `address`, `maildir`, `unread`, `total` fields

#### Scenario: No maildirs configured
- **WHEN** notmuch database has no maildirs
- **THEN** server responds 200 with an empty JSON array `[]`

### Requirement: GET /api/maildirs/:id/folders — list folders
`GET /api/maildirs/:id/folders` SHALL return a JSON array of Maildir++ folders for the specified maildir.

#### Scenario: Folders returned
- **WHEN** client sends `GET /api/maildirs/gmail/folders`
- **THEN** server responds 200 with a JSON array of folder objects with at minimum `id`, `name`, `unread`, `total` fields

#### Scenario: Unknown maildir id
- **WHEN** the maildir id does not exist
- **THEN** server responds 404 with a JSON error body

### Requirement: GET /api/maildirs/:id/folders/:folder/messages — list messages
`GET /api/maildirs/:id/folders/:folder/messages` SHALL return a paginated JSON list of messages.

#### Scenario: Messages returned with pagination
- **WHEN** client sends `GET /api/maildirs/gmail/folders/inbox/messages?page=1&per_page=25`
- **THEN** server responds 200 with `{ "messages": [...], "total": N, "page": 1, "per_page": 25 }`

#### Scenario: Default pagination
- **WHEN** client sends `GET /api/maildirs/gmail/folders/inbox/messages` with no query params
- **THEN** server responds 200 with page 1 and per_page 25

#### Scenario: Empty folder
- **WHEN** the folder contains no messages
- **THEN** server responds 200 with `{ "messages": [], "total": 0, "page": 1, "per_page": 25 }`

### Requirement: GET /api/messages/search — search messages
`GET /api/messages/search?q=QUERY` SHALL return a paginated JSON list of messages matching the notmuch query.

#### Scenario: Search results returned
- **WHEN** client sends `GET /api/messages/search?q=from%3Amaya`
- **THEN** server responds 200 with messages matching the notmuch query, same envelope as list endpoint

#### Scenario: Empty search results
- **WHEN** no messages match the query
- **THEN** server responds 200 with `{ "messages": [], "total": 0, "page": 1, "per_page": 25 }`

#### Scenario: Missing query parameter
- **WHEN** client sends `GET /api/messages/search` with no `q` parameter
- **THEN** server responds 400 with a JSON error body

### Requirement: GET /api/messages/:id — read message
`GET /api/messages/:id` SHALL return the full parsed message as JSON including headers, body, and attachments.

#### Scenario: Message returned
- **WHEN** client sends `GET /api/messages/abc123`
- **THEN** server responds 200 with a JSON object containing `id`, `headers` (object), `body` (string), `attachments` (array)

#### Scenario: Unknown message id
- **WHEN** the message id does not exist in the notmuch database
- **THEN** server responds 404 with a JSON error body

### Requirement: Blocking core calls wrapped in spawn_blocking
All calls to `mailbrus-core` (which is synchronous) SHALL be executed inside `tokio::task::spawn_blocking` to avoid blocking the async executor.

#### Scenario: Concurrent requests handled
- **WHEN** two clients make concurrent API requests
- **THEN** both requests complete without one blocking the other

### Requirement: Startup warning when binding non-loopback without auth
When `--bind` resolves to a non-loopback address and `--auth` is not set, the server SHALL print a warning to stderr.

#### Scenario: Public bind without auth
- **WHEN** user runs `mailbrus-server --bind 0.0.0.0:8080` without `--auth`
- **THEN** server starts but logs `WARNING: server is publicly accessible without authentication`
