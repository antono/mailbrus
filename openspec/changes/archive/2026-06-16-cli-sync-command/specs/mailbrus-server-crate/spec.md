## ADDED Requirements

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
