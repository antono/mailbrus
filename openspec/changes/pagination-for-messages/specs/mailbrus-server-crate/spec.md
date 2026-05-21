## MODIFIED Requirements

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
