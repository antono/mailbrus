## Context

The server already accepts `?page=N&per_page=N` on both message endpoints and returns `{ messages, total, page, per_page }`. The frontend `api.ts` already passes and receives these params. However:

- The response field is named `total`; the agreed name is `count`.
- `+page.svelte` ignores all pagination metadata — only `data.messages` is used.
- No UI exists to navigate between pages; users are silently capped at 25 messages.

The change is therefore: a **one-field rename** on the server + **wiring up** the already-present frontend params to actual UI controls.

## Goals / Non-Goals

**Goals:**
- Rename `total` → `count` in both server handlers (list and search)
- Return type in `api.ts` updated to `{ messages, page, per_page, count }`
- New `Pagination.svelte` component: prev/next buttons, "X–Y of Z" indicator
- Page resets to 1 on folder switch or new search query
- Per-page stays at 25 (default); no user-selectable per-page in this change

**Non-Goals:**
- Jump-to-page input
- User-configurable per-page setting
- Infinite scroll / virtual list
- Caching paginated results (cache is per-folder; pagination changes the slice)

## Decisions

### 1. `total` → `count` (not additive)
Rename the field rather than adding `count` alongside `total`. There are no external consumers of this API — it is a local server serving one client. Keeping both would leave dead weight.

### 2. Single `Pagination.svelte` component
Both list and search share `+page.svelte`, so one component handles both modes. It receives `{ page, perPage, count }` as props and emits a `pageChange` event. The parent decides whether to call `fetchMessages` or `searchMessages`.

### 3. Page state lives in `+page.svelte`, not the URL
The current app uses no URL routing for folder/message state. Keeping pagination state in reactive Svelte variables (`currentPage`, `totalCount`) is consistent with the existing pattern. URL-based pagination is a separate concern.

### 4. Cache key must include page
The existing `cacheMessages(folderId, data.messages)` call silently overwrites on every page load. Fix: skip caching for pages > 1, or include page in the cache key. Simplest: **only cache page 1** (the default landing view).

## Risks / Trade-offs

- **Stale cache on folder revisit** → Only cache page 1; evict on folder switch (already happens via `currentMessages` reassignment).
- **`count` may be approximate** in notmuch for large queries → Acceptable; display as "~N" if needed, but out of scope here.
- **Search page state not reset on new query** → Reset `currentPage = 1` whenever `searchQuery` changes before calling `searchMessages`.

## Migration Plan

1. Rename `total` → `count` in `main.rs` (4 occurrences: 2 live responses + 2 empty-result fallbacks)
2. Update `api.ts` return types
3. Add `Pagination.svelte` component
4. Wire pagination state into `+page.svelte` (list + search paths)
5. Manual smoke test: navigate to page 2 of a large folder; run a search and page through results
