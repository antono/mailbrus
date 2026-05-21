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
`fetchMessages(maildirId, folderId, page?, perPage?)` SHALL call `GET /api/maildirs/:id/folders/:folder/messages` and return `Promise<{ messages: Message[], page: number, per_page: number, count: number }>`.

#### Scenario: Message list loaded from server
- **WHEN** the MailList component mounts with a selected account and folder
- **THEN** `fetchMessages(account.id, folder.id)` is awaited and the returned messages, page, per_page, and count replace the previous state

### Requirement: searchMessages returns filtered message list
`searchMessages(query, page?, perPage?)` SHALL call `GET /api/messages/search?q=...` and return `Promise<{ messages: Message[], page: number, per_page: number, count: number }>`.

#### Scenario: Search results displayed
- **WHEN** user types a search query in the MailList search bar
- **THEN** `searchMessages(query)` is awaited and the results plus pagination metadata replace the current state

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

### Requirement: IndexedDB stores are initialized on app boot
On first load the data layer SHALL open an IndexedDB database `mailbrus` and create the following object stores if they do not exist: `outbox`, `mutations`, `messages`, `frecency`, `settings`. Schema version upgrades SHALL be handled via `onupgradeneeded`.

#### Scenario: IDB initialized on first visit
- **WHEN** the user visits the app for the first time
- **THEN** the `mailbrus` IndexedDB database exists with all required stores

### Requirement: Settings are loaded from IDB on boot and written through on change
At app startup the data layer SHALL read all keys from `idb:settings` into the settings Svelte store. Any subsequent change to the settings store SHALL be persisted to IDB within the same microtask. The `theme` key SHALL additionally be mirrored to `localStorage` for pre-JS flash prevention.

#### Scenario: Last folder restored on reload
- **WHEN** the user had folder `Work/Inbox` open, closes the tab, and reopens the app
- **THEN** the app opens on `Work/Inbox`

#### Scenario: Search history persists across sessions
- **WHEN** the user performs searches in one session
- **THEN** previous queries appear in the search history dropdown in the next session

#### Scenario: Sort order persists across sessions
- **WHEN** the user changes sort order to "Oldest first"
- **THEN** that sort order is active on the next app launch

#### Scenario: Theme stored in localStorage
- **WHEN** the user sets theme to `dark`
- **THEN** `localStorage.getItem('theme')` returns `'dark'` immediately

### Requirement: Message metadata is cached in idb:messages
When the data layer fetches a message list from `/api/messages`, it SHALL upsert each message's metadata (UID, subject, sender, date, read state, folder) into `idb:messages`. The UI SHALL read the message list from `idb:messages` first, then update when a network response arrives.

#### Scenario: Messages shown from cache while loading
- **WHEN** the user opens a folder while online
- **THEN** cached messages appear instantly while the network fetch completes in the background

#### Scenario: Messages shown from cache when offline
- **WHEN** the user opens a folder while offline
- **THEN** the last-cached message list for that folder is displayed

### Requirement: Read state and deletions are applied optimistically to idb:messages
When the user marks a message read/unread or deletes it, the data layer SHALL update `idb:messages` immediately before any network call. The UI store SHALL reflect the change without waiting for server confirmation.

#### Scenario: Mark read reflects instantly
- **WHEN** the user marks a message as read
- **THEN** the message's read state in the UI changes within the same interaction, with no perceptible delay

#### Scenario: Deleted message removed from list instantly
- **WHEN** the user deletes a message
- **THEN** it disappears from the message list before the server responds

### Requirement: Frecency weights are stored and queried for modal pickers
The data layer SHALL expose `recordVisit(store, key)` and `getRanked(store, prefix?)` functions backed by `idb:frecency`. `getRanked` SHALL return items sorted by descending frecency score (Mozilla bucket algorithm). Each item SHALL store at most the last 20 visit timestamps.

#### Scenario: Folder picker ranks recently-used folder first
- **WHEN** the user has visited the `Work/Inbox` folder 5 times in the last 3 days
- **THEN** `Work/Inbox` appears at or near the top of the folder picker

#### Scenario: Contact autocomplete ranks frequent recipients
- **WHEN** the user has sent 10 emails to `alice@example.com` in the past month
- **THEN** `alice@example.com` ranks above contacts with fewer interactions

#### Scenario: Cold-start falls back to alphabetical
- **WHEN** no frecency data exists for a store
- **THEN** items are returned in alphabetical order

### Requirement: Logging for all IDB operations, toggled at runtime
All reads and writes to `idb:outbox`, `idb:mutations`, `idb:messages`, `idb:frecency`, and `idb:settings` SHALL emit `console.debug` logs with the operation name, store, and key when `localStorage.getItem('mailbrus:debug') === 'true'`. Logging is available in both development and production builds.

#### Scenario: Settings write logged in dev
- **WHEN** `last_folder` is written to `idb:settings` in a dev build
- **THEN** `[settings] write last_folder={value}` appears in the console

#### Scenario: Frecency recorded logged in dev
- **WHEN** `recordVisit('folders', 'INBOX')` is called in a dev build
- **THEN** `[frecency] folders:INBOX visits={n} score={s}` appears in the console
