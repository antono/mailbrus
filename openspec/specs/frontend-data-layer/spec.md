## Purpose

Define the frontend data layer that replaces static mock data with async API calls to the mailbrus-server HTTP backend.

## Requirements

### Requirement: API client module replaces mock data constants
`src/lib/api.ts` SHALL export async functions that fetch from `/api/...` endpoints, replacing the static mock constants in `src/lib/data.ts`. The mock `data.ts` file SHALL be removed or emptied of hardcoded data.

#### Scenario: API module exports fetch functions
- **WHEN** a Svelte component imports from `$lib/api`
- **THEN** it receives typed async functions: `fetchMaildirs()`, `fetchFolders(maildirId)`, `fetchMessages(maildirId, folderId, page?, perPage?)`, `searchMessages(query, page?, perPage?)`, `fetchMessage(id)`

### Requirement: fetchMaildirs returns Account array
`fetchMaildirs()` SHALL call `GET /api/maildirs` and return a `Promise<Account[]>` using the existing `Account` TypeScript interface.

#### Scenario: Accounts loaded from server
- **WHEN** the AccountPicker component mounts
- **THEN** `fetchMaildirs()` is awaited and the returned accounts populate the picker list

#### Scenario: Network error handled
- **WHEN** `GET /api/maildirs` fails with a network error or non-2xx response
- **THEN** `fetchMaildirs()` throws an error; the caller is responsible for handling it

### Requirement: fetchFolders returns Folder array
`fetchFolders(maildirId)` SHALL call `GET /api/maildirs/:id/folders` and return a `Promise<Folder[]>`.

#### Scenario: Folders loaded from server
- **WHEN** the FolderPicker component mounts with a selected account
- **THEN** `fetchFolders(account.id)` is awaited and the returned folders populate the picker list

### Requirement: fetchMessages returns paginated message list
`fetchMessages(maildirId, folderId, page?, perPage?)` SHALL call `GET /api/maildirs/:id/folders/:folder/messages` and return `Promise<{ messages: Message[], total: number }>`.

#### Scenario: Message list loaded from server
- **WHEN** the MailList component mounts with a selected account and folder
- **THEN** `fetchMessages(account.id, folder.id)` is awaited and the returned messages replace the mock list

### Requirement: searchMessages returns filtered message list
`searchMessages(query, page?, perPage?)` SHALL call `GET /api/messages/search?q=...` and return `Promise<{ messages: Message[], total: number }>`.

#### Scenario: Search results displayed
- **WHEN** user types a search query in the MailList search bar
- **THEN** `searchMessages(query)` is awaited and the results replace the current message list

### Requirement: fetchMessage returns full message
`fetchMessage(id)` SHALL call `GET /api/messages/:id` and return a `Promise<MessageBody>` where `MessageBody` extends `Message` with `body: string` and `attachments: Attachment[]`.

#### Scenario: Full message loaded in reader
- **WHEN** user opens a message in the Reader component
- **THEN** `fetchMessage(message.id)` is awaited and the body and attachments are rendered

### Requirement: Loading and error states in page shell
`+page.svelte` SHALL handle loading and error states when fetching data from the API, showing appropriate UI feedback.

#### Scenario: Data loading indicator
- **WHEN** an API call is in-flight
- **THEN** the UI shows a loading indicator or the previous content until data arrives

#### Scenario: API unreachable
- **WHEN** the server is not running and an API call fails
- **THEN** the UI shows an error message rather than a blank screen or unhandled exception
