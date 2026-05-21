## Why

The message list and search results are capped at 25 items with no way to navigate further — large mailboxes are effectively inaccessible. Both the server API and frontend UI need consistent pagination so users can browse all messages.

## What Changes

- Server response envelope for message list and search changes field name `total` → `count` (alignment with user-facing naming)
- Server response for both endpoints returns `{ messages, page, per_page, count }` consistently
- Frontend `fetchMessages` and `searchMessages` return full pagination envelope including `page`, `per_page`, `count`
- Message list UI gains pagination controls (previous/next page, current page indicator, per-page selector)
- Search results UI uses the same pagination controls

## Capabilities

### New Capabilities
- `message-pagination-ui`: Svelte pagination control component used in message list and search results; handles page navigation state, emits page-change events, displays current position (e.g. "26–50 of 312")

### Modified Capabilities
- `mailbrus-server-crate`: Response envelope for `GET /api/maildirs/:id/folders/:folder/messages` and `GET /api/messages/search` changes `total` → `count`; both endpoints must accept `?page=N&per_page=N` query params and echo them back in the response
- `frontend-data-layer`: `fetchMessages` and `searchMessages` return `Promise<{ messages: Message[], page: number, per_page: number, count: number }>`; callers receive full pagination metadata, not just the message array

## Impact

- `mailbrus-server/src/` — message list and search handlers: rename `total` field, ensure params are parsed and echoed
- `src/lib/api.ts` — return type update for both fetch functions
- `src/routes/` or message list Svelte component — add pagination controls and page state
- No breaking changes to message `id`, envelope structure, or other endpoints
