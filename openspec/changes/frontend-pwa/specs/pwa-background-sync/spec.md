## ADDED Requirements

### Requirement: Outgoing messages are queued when offline and marked "not sent"
When the user sends a message and the network is unavailable (or `POST /api/send` fails with a network error), the message SHALL be written to `idb:outbox` with `status: 'queued'` and displayed in the message list with a "Not sent" badge. The message SHALL NOT be discarded.

#### Scenario: Send attempted offline
- **WHEN** the user taps Send and the device is offline
- **THEN** the message appears in Sent/Outbox with a "Not sent" badge and `status: 'queued'`

#### Scenario: Queued message visible after refresh
- **WHEN** the user refreshes the page after queueing an offline message
- **THEN** the queued message is still visible with its "Not sent" badge

---

### Requirement: Outbox is flushed automatically when connectivity returns
The SW SHALL register a Background Sync tag `outbox-sync`. When the `sync` event fires for that tag, the SW SHALL process all `idb:outbox` entries with `status: 'queued'`, attempt `POST /api/send` for each, and update their status to `sent` or `failed`. On completion the SW SHALL post a `outbox-updated` message to all clients.

#### Scenario: Outbox flushes on reconnect (Chromium)
- **WHEN** the device comes back online and Background Sync fires
- **THEN** all `status: 'queued'` outbox entries are attempted and their status updated

#### Scenario: Failed send marked as failed
- **WHEN** `POST /api/send` returns a 5xx or network error during flush
- **THEN** the outbox entry is updated to `status: 'failed'` with the error message

---

### Requirement: Outbox flush fallback for Firefox and Safari
When `SyncManager` is unavailable, the app's main thread SHALL trigger outbox flush on the `online` event and on `visibilitychange` (when transitioning to `visible`). The flush logic SHALL be shared code invoked from both the SW sync path and the main-thread fallback path.

#### Scenario: Outbox flushes on window focus (Firefox)
- **WHEN** Firefox user goes offline, composes a message, then comes back online and focuses the tab
- **THEN** the queued message is sent automatically

---

### Requirement: Read-state and deletion mutations are queued when offline
When the user marks a message read/unread or deletes a message while offline, the action SHALL be written to `idb:mutations` with appropriate `op` and `status: 'queued'`, and applied optimistically to `idb:messages` immediately. A `mutations-sync` Background Sync tag SHALL be registered.

#### Scenario: Mark read offline — optimistic update
- **WHEN** the user marks a message as read while offline
- **THEN** the message appears as read in the UI immediately, and a mutation entry exists in `idb:mutations`

#### Scenario: Delete offline — message hidden immediately
- **WHEN** the user deletes a message while offline
- **THEN** the message disappears from the list immediately and a `delete` mutation is queued

---

### Requirement: Mutation queue is compacted before flush
Before flushing `idb:mutations`, the SW SHALL compact the queue per `message_id`: retain only the latest read-state mutation per message; if a `delete` mutation exists for a message, drop all prior read-state mutations for that message.

#### Scenario: Duplicate mark-read compacted
- **WHEN** the user marks the same message read twice while offline
- **THEN** only one `PATCH` request is sent to the server on flush

#### Scenario: Delete supersedes mark-read
- **WHEN** the user marks a message read and then deletes it while offline
- **THEN** only `DELETE /api/messages/:id` is sent; no `PATCH` is sent

---

### Requirement: Mutation conflicts resolve to server state
If the server returns 404 or a conflict response during mutation flush, the mutation SHALL be marked `failed`, the corresponding `idb:messages` entry SHALL be corrected to the server state, and the UI SHALL display a non-blocking "Some changes could not be applied" notice.

#### Scenario: Message deleted remotely — local delete conflict
- **WHEN** a `delete` mutation is flushed but the server returns 404
- **THEN** the mutation is marked `failed` and the message entry is removed from `idb:messages`

#### Scenario: Read-state conflict notice shown
- **WHEN** a `mark_read` mutation fails on flush
- **THEN** the user sees a brief non-blocking error notice

---

### Requirement: Logging for all sync operations, toggled at runtime
The app SHALL emit `console.debug` logs for every outbox and mutation lifecycle event (enqueue, flush start, compact, per-entry result) when `localStorage.getItem('mailbrus:debug') === 'true'`. Logging is available in both development and production builds. See design Decision 8 for exact format.

#### Scenario: Outbox enqueue logged
- **WHEN** a message is written to `idb:outbox` in a dev build
- **THEN** `[outbox] queued {id}` appears in the console

#### Scenario: Mutation compact logged
- **WHEN** the mutation queue is compacted before flush in a dev build
- **THEN** `[mutations] compact {n}→{m}` appears in the console
