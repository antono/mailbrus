## MODIFIED Requirements

### Requirement: fetchMessages returns paginated message list
`fetchMessages(maildirId, folderId, page?, perPage?)` SHALL call `GET /api/maildirs/:id/folders/:folder/messages` and return `Promise<{ messages: Message[], page: number, per_page: number, count: number }>`.

#### Scenario: Message list loaded from server
- **WHEN** the MailList component mounts with a selected account and folder
- **THEN** `fetchMessages(account.id, folder.id)` is awaited and the returned messages, page, per_page, and count replace the previous state

### Requirement: searchMessages returns filtered message list
`searchMessages(query, page?, perPage?)` SHALL call `GET /api/messages/search?q=...` and return `Promise<{ messages: Message[], page: number, per_page: number, count: number }>`.

#### Scenario: Search results displayed
- **WHEN** user types a search query in the MailList search bar
- **THEN** `searchMessages(query)` is awaited and the results plus pagination metadata replace the current state
