## 1. Server — rename `total` → `count`

- [ ] 1.1 In `mailbrus-server/src/main.rs` rename `"total": total` → `"count": total` in the `list_messages` handler response (line ~253)
- [ ] 1.2 In `mailbrus-server/src/main.rs` rename `"total": total` → `"count": total` in the `search_messages` handler response (line ~288)
- [ ] 1.3 In `mailbrus-server/src/main.rs` rename `"total": 0` → `"count": 0` in both empty-result fallback responses (lines ~174, ~207)
- [ ] 1.4 Build `mailbrus-server` and confirm it compiles (`cargo build -p mailbrus-server`)

## 2. Frontend API layer — update return types

- [ ] 2.1 In `src/lib/api.ts` change return type of `fetchMessages` from `Promise<{ messages: Message[]; total: number }>` to `Promise<{ messages: Message[]; page: number; per_page: number; count: number }>`
- [ ] 2.2 In `src/lib/api.ts` change return type of `searchMessages` from `Promise<{ messages: Message[]; total: number }>` to `Promise<{ messages: Message[]; page: number; per_page: number; count: number }>`
- [ ] 2.3 Run TypeScript check (`npm run check`) and fix any type errors caused by callers that referenced `total`

## 3. Pagination component

- [ ] 3.1 Create `src/lib/components/Pagination.svelte` accepting props `page: number`, `perPage: number`, `count: number`
- [ ] 3.2 Render position indicator text (e.g. "26–50 of 312")
- [ ] 3.3 Render previous and next buttons; disable previous on page 1, disable next on last page
- [ ] 3.4 Dispatch `pageChange` event with the new page number on button click
- [ ] 3.5 Hide the component entirely when `count <= perPage`

## 4. Wire pagination into message list

- [ ] 4.1 In `+page.svelte` add reactive state variables `currentPage`, `totalCount`, `currentPerPage` (default 1, 0, 25)
- [ ] 4.2 Update the `fetchMessages` call to pass `currentPage` and store `page`, `per_page`, `count` from the response
- [ ] 4.3 Reset `currentPage = 1` when the selected folder changes
- [ ] 4.4 Only cache messages when `currentPage === 1` (skip `cacheMessages` for pages > 1)
- [ ] 4.5 Render `<Pagination>` below the message list, passing `currentPage`, `currentPerPage`, `totalCount`
- [ ] 4.6 Handle `pageChange` event: set `currentPage` and call `fetchMessages` with the new page

## 5. Wire pagination into search results

- [ ] 5.1 In `+page.svelte` add a separate `searchPage` state variable (default 1)
- [ ] 5.2 Update the `searchMessages` call to pass `searchPage` and store pagination metadata
- [ ] 5.3 Reset `searchPage = 1` when the search query changes before calling `searchMessages`
- [ ] 5.4 Render `<Pagination>` below search results, passing `searchPage`, `currentPerPage`, `totalCount`
- [ ] 5.5 Handle `pageChange` event in search context: set `searchPage` and re-run search

## 6. Smoke test

- [ ] 6.1 Start server and open a folder with more than 25 messages; confirm page 2 loads correctly
- [ ] 6.2 Run a search with more than 25 results; confirm pagination controls appear and next page loads
- [ ] 6.3 Confirm switching folders resets to page 1
- [ ] 6.4 Confirm a new search query resets to page 1
