## Purpose

Define the `mailbrus-server` binary crate that provides an HTTP server bridging the mailbrus-core library and the SvelteKit frontend.
## Requirements
### Requirement: mailbrus-server crate in workspace
A `mailbrus-server` binary crate SHALL exist at `mailbrus-server/` in the workspace root and SHALL be listed in the root `Cargo.toml` `members` array.

#### Scenario: Workspace builds server crate
- **WHEN** user runs `cargo build --workspace`
- **THEN** `target/debug/mailbrus-server` binary is produced with no errors

### Requirement: Server starts and listens on configurable address
`mailbrus-server` SHALL accept a `--bind <ADDR:PORT>` CLI flag (default `127.0.0.1:1371`) and start an HTTP listener on that address.

#### Scenario: Default bind
- **WHEN** user runs `mailbrus-server` with no flags
- **THEN** server listens on `127.0.0.1:1371` and prints `Listening on http://127.0.0.1:1371` to stdout

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
- **THEN** server responds 200 with `{ "messages": [...], "count": N, "page": 1, "per_page": 25 }`

#### Scenario: Default pagination
- **WHEN** client sends `GET /api/maildirs/gmail/folders/inbox/messages` with no query params
- **THEN** server responds 200 with page 1 and per_page 25

#### Scenario: Empty folder
- **WHEN** the folder contains no messages
- **THEN** server responds 200 with `{ "messages": [], "count": 0, "page": 1, "per_page": 25 }`

### Requirement: GET /api/messages/search — search messages
`GET /api/messages/search?q=QUERY` SHALL return a paginated JSON list of messages matching the notmuch query.

#### Scenario: Search results returned
- **WHEN** client sends `GET /api/messages/search?q=from%3Amaya`
- **THEN** server responds 200 with `{ "messages": [...], "count": N, "page": 1, "per_page": 25 }`

#### Scenario: Empty search results
- **WHEN** no messages match the query
- **THEN** server responds 200 with `{ "messages": [], "count": 0, "page": 1, "per_page": 25 }`

#### Scenario: Missing query parameter
- **WHEN** client sends `GET /api/messages/search` with no `q` parameter
- **THEN** server responds 400 with a JSON error body

### Requirement: GET /api/messages/:id — read message
`GET /api/messages/:id` SHALL return the full parsed message as JSON including headers, body, and attachments. Each entry in the `attachments` array SHALL include a `size` field reflecting the actual byte length of the decoded attachment body. A hardcoded `size: 0` is not acceptable.

#### Scenario: Message returned
- **WHEN** client sends `GET /api/messages/abc123`
- **THEN** server responds 200 with a JSON object containing `id`, `headers` (object), `body` (string), `attachments` (array)

#### Scenario: Unknown message id
- **WHEN** the message id does not exist in the notmuch database
- **THEN** server responds 404 with a JSON error body

#### Scenario: Attachment size reflects actual bytes
- **WHEN** a message has an attachment whose decoded body is N bytes
- **THEN** the corresponding `attachments[i].size` field equals N (not 0)

### Requirement: Blocking core calls wrapped in spawn_blocking
All calls to `mailbrus-core` (which is synchronous) SHALL be executed inside `tokio::task::spawn_blocking` to avoid blocking the async executor.

#### Scenario: Concurrent requests handled
- **WHEN** two clients make concurrent API requests
- **THEN** both requests complete without one blocking the other

### Requirement: Startup warning when binding non-loopback without auth
The server SHALL print a warning to stderr when `--bind` resolves to a non-loopback address and `--auth` is not set, and SHALL enforce the token on `/api/*` requests when `--auth` is set (see the `api-origin-validation` capability) rather than leaving the flag a no-op that only affects the startup warning.

#### Scenario: Public bind without auth
- **WHEN** user runs `mailbrus-server --bind 0.0.0.0:1371` without `--auth`
- **THEN** server starts but logs `WARNING: server is publicly accessible without authentication`

#### Scenario: Auth flag is enforced, not just warned
- **WHEN** user runs `mailbrus-server --auth s3cret` and an `/api/*` request omits a matching `Authorization: Bearer` header
- **THEN** the server responds `401 Unauthorized` (the flag gates requests, not only the warning)

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

### Requirement: Server reads account list from config file

`mailbrus-server` SHALL load the account list at startup by scanning the
`accounts/` directory of per-account TOML files (see the `account-config`
capability) rather than reading a single `config.toml` or inferring accounts from
the notmuch root directory listing.

#### Scenario: Accounts loaded from config at startup

- **WHEN** the server starts and the `accounts/` directory contains valid account
  files
- **THEN** `AppState` contains an account registry built from the parsed
  `AccountConfig` list
- **AND** `GET /api/maildirs` returns only accounts present in the `accounts/`
  directory

#### Scenario: No account files at startup

- **WHEN** the server starts and the `accounts/` directory is absent or empty
- **THEN** the server starts successfully with an empty account registry
- **AND** `GET /api/maildirs` returns an empty list
- **AND** `GET /api/accounts` returns an empty list
- **AND** a warning is logged

#### Scenario: Config path overridden via CLI flag

- **WHEN** the server is started with `--config <path>`
- **THEN** the `accounts/` directory under that path is scanned instead of the XDG
  default

### Requirement: Message listing resolves the notmuch folder from the maildir root
When listing a mailbox's messages, the server SHALL build the notmuch `folder:`
query from the account's configured maildir root **relative to the notmuch
database root**, not by assuming the account id sits directly under the database
root. Mailbrus stores accounts under `<db_root>/mail/<id>/`, so the folder term
is `mail/<id>/<folder>`; the query MUST reflect that so synced mail is listed.

#### Scenario: Messages stored under `mail/<id>` are listed
- **WHEN** an account's mail is synced to `<db_root>/mail/<id>/<folder>/` and the UI requests that folder's messages
- **THEN** the server queries `folder:"mail/<id>/<folder>"` and returns the messages (not an empty list)

#### Scenario: Flat clone layout still works
- **WHEN** an account's maildir root is directly under the database root (e.g. an E2E clone at `<db_root>/<id>/`)
- **THEN** the resolved query is `folder:"<id>/<folder>"` and the messages are returned

---

### Requirement: Reads tolerate a concurrent sync writing the database
Server read endpoints (message list, search, message body) SHALL tolerate a
concurrent sync committing to the notmuch database. When a read races a write
and notmuch returns a transient error (Xapian "database modified" / lock), the
server SHALL reopen the database and retry a bounded number of times before
surfacing an error, so a mailbox does not momentarily render empty during a sync.

#### Scenario: Listing during an active sync does not return empty
- **WHEN** a `mailbrus sync` (or the in-app trigger) is indexing into the database and the UI requests a folder's messages
- **THEN** the server reopens/retries on a transient error and returns the committed messages rather than an empty list or an error

---

### Requirement: API responses are not cached by the browser
All `/api` responses SHALL be served with `Cache-Control: no-store`. API
payloads (maildirs, folders, message lists, search) reflect the live notmuch
index and change on every sync; without this header the browser HTTP cache can
serve a stale response (e.g. an empty inbox captured before the first sync),
which presents as data loss until the cache is manually disabled.

#### Scenario: Message list is never served from a stale browser cache
- **WHEN** the UI requests a folder's messages after a sync has added messages
- **THEN** the response carries `Cache-Control: no-store` and the browser fetches the current list rather than replaying an earlier empty response

---

### Requirement: Folder and account listings report real message counts
The `GET /api/maildirs/{id}/folders` and `GET /api/maildirs` responses SHALL
report each folder's (and account's) `total` and `unread` message counts derived
from the notmuch index, not hardcoded zero. A folder's `total` is the count of
`folder:"<prefix>/<folder>"` and its `unread` is that query intersected with
`tag:unread`, where `<prefix>` is the account's maildir root relative to the
database root (matching how synced mail is stored). An account's counts are the
sum of its folders' counts. If the index cannot be opened the counts SHALL fall
back to zero rather than failing the request.

#### Scenario: Inbox shows its real total in the folder picker
- **WHEN** the open-folder dialog lists an account whose Inbox holds N indexed messages
- **THEN** the Inbox entry reports `total` = N (not 0), so the picker and breadcrumb show the real count

#### Scenario: Counting never breaks the listing
- **WHEN** the notmuch database cannot be opened
- **THEN** `GET /api/maildirs` still returns the configured accounts with `total`/`unread` of 0 rather than an error

### Requirement: GET /api/accounts — list configured accounts

`mailbrus-server` SHALL expose `GET /api/accounts` returning a JSON array of
account summaries reflecting the configured accounts, independent of sync state.
Each summary SHALL include at minimum `id`, `email`, `protocol`, and
`display_name`. The secret SHALL never be included in the response.

#### Scenario: Accounts listed regardless of sync state

- **WHEN** client sends `GET /api/accounts` and one account is configured but has
  never synced
- **THEN** the server responds `200` with a one-element array containing that
  account's summary

#### Scenario: No accounts configured

- **WHEN** no accounts are configured
- **THEN** the server responds `200` with an empty JSON array `[]`

#### Scenario: Secret never exposed

- **WHEN** an account summary is returned
- **THEN** the response contains no password/secret field

### Requirement: POST /api/accounts — create an account

`mailbrus-server` SHALL expose `POST /api/accounts` that creates one account from
a JSON body of account fields plus the secret. The handler SHALL validate the
settings against the real servers (IMAP login and SMTP `AUTH`, no message sent)
before persisting. On success it SHALL store the credential, write
`accounts/<email>.toml`, reload the account registry, and respond `201` with the
account summary. The id (email address) SHALL be percent-decoded/encoded
consistently where it appears in route paths.

#### Scenario: Valid account created

- **WHEN** `POST /api/accounts` is called with settings whose IMAP and SMTP
  servers authenticate
- **THEN** the credential is stored, `accounts/<email>.toml` is written, and the
  server responds `201` with the account summary

#### Scenario: Validation failure is reported without persisting

- **WHEN** the supplied settings fail to authenticate (e.g. bad password or
  unreachable host)
- **THEN** the server responds `422` with a JSON body naming the offending field
  and reason
- **AND** no account file is written and no credential is stored

#### Scenario: Duplicate account rejected

- **WHEN** `POST /api/accounts` is called for an email that already has an account
- **THEN** the server responds `409` with a JSON error body
- **AND** the existing account file is left unchanged

#### Scenario: Validation is time-bounded

- **WHEN** a target server hangs during validation
- **THEN** the handler times out and responds `422` rather than blocking
  indefinitely

### Requirement: Account registry reloads without a server restart

After an account is created, `mailbrus-server` SHALL make it active without a
restart: the account registry SHALL be reloaded, its maildir root registered in
the notmuch config, and the sync engine SHALL be (re)built so the new account is
syncable. The common case is the transition from zero accounts (sync engine
disabled) to one account (sync engine enabled).

#### Scenario: New account is syncable immediately after creation

- **WHEN** an account is created on a server that started with zero accounts
- **THEN** a subsequent `POST /api/sync/<id>` for that account is accepted
  (`202`) without restarting the server

#### Scenario: New account appears in listings after creation

- **WHEN** an account is created
- **THEN** a subsequent `GET /api/accounts` includes the new account

