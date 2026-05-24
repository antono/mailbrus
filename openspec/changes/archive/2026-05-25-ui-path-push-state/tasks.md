## 1. URL ↔ state mapping (`src/lib/url.ts`)

- [x] 1.1 Create `src/lib/url.ts` with a `parsePath(url: URL)` that returns a route descriptor `{ folderId?: string; messageId?: string; query?: string }` for `/`, `/folder/:folderId`, `/folder/:folderId/message/:messageId`, and `/search?q=`.
- [x] 1.2 Add `buildPath(descriptor)` (inverse of `parsePath`) that honors `paths.base`, plus `buildFolderUrl`, `buildMessageUrl`, `buildSearchUrl` helpers.
- [x] 1.3 Add unit tests for `parsePath`/`buildPath` round-trips and edge cases (trailing slash, missing/extra segments, empty `q`, URL-encoded ids).

## 2. Routing structure & SPA fallback

- [x] 2.1 `git mv src/routes/+page.svelte src/routes/[...path]/+page.svelte` so a catch-all route renders the shell for every path (including `/`).
- [x] 2.2 Update `svelte.config.js` to `adapter({ fallback: 'index.html' })`.
- [x] 2.3 Update `src/routes/+layout.ts`: set `export const ssr = false;` and `export const prerender = false;` (remove the `prerender = true`).
- [x] 2.4 Verify `deno task build` produces a `build/index.html` SPA shell and that `mailbrus-server` (existing `not_found_service` fallback) serves it for an in-grammar deep path.

## 3. URL-driven view reconciler

- [x] 3.1 In the shell, import `page` from `$app/state` and derive the route descriptor via `parsePath(page.url)` as `$derived`.
- [x] 3.2 Add a single reconciler `$effect` that maps the descriptor onto app state per design D6: resolve account → load folder/messages → set `phase`; open/close the reader for `messageId`; set search state for `query`.
- [x] 3.3 Ensure the reconciler is read-only on the URL (never writes history) to avoid feedback loops, and is idempotent when the descriptor is unchanged.
- [x] 3.4 Resolve the account from persisted/last-used state on deep links (account is not in the path); show the account picker when it cannot be resolved.

## 4. Navigation helpers & wiring transitions

- [x] 4.1 Add nav helpers (`navigateToFolder`, `openMessageRoute`, `closeReaderRoute`, `runSearchRoute`, `goBack`) that compute the target URL and call `pushState`/`replaceState` from `$app/navigation` per design D3.
- [x] 4.2 Route folder selection through `navigateToFolder` (pushState → `/folder/:id`).
- [x] 4.3 Route message open/close through `openMessageRoute`/`closeReaderRoute` (pushState to open; back/replace to close).
- [x] 4.4 Route Esc and other phase-changing keyboard shortcuts through the nav helpers so the URL stays in sync (Esc in list → `/`, Esc in reader → folder URL).
- [x] 4.5 Use `replaceState` for transient refinements (search-as-you-type query edits) so history is not polluted.

## 5. Back/forward & invalid-link handling

- [x] 5.1 Confirm browser Back/Forward reconcile the view via the `page.url` reactive update + reconciler (no separate `popstate` listener needed; add one only if a gap is found).
- [x] 5.2 Handle unresolved deep links (API 404): `replaceState` to the nearest valid view (folder list, else `/`) and surface a notice.

## 6. Search routing

- [x] 6.1 Map `/search?q=` to `searchOpen = true` + `searchQuery` and trigger the search load via the reconciler.
- [x] 6.2 Submit search via `runSearchRoute` (pushState); reflect in-place query edits via `replaceState`.

## 7. Service worker navigation fallback

- [x] 7.1 In `src/sw.ts`, add a `fetch` handler branch for `request.mode === 'navigate'` that serves the cached app shell (`/`) for any in-grammar path so offline deep-link/reload works.
- [x] 7.2 Verify static assets (`/assets/*`, `/icons/*`, `/sw.js`, `/manifest.webmanifest`) are still served directly and not shadowed by the navigation fallback.

## 8. E2E tests (Playwright)

- [x] 8.1 Add a test: opening a folder/message/search updates the URL to the expected path (covers `ui-path-routing` "URL reflects the current view").
- [x] 8.2 Add a test: deep-link/reload of `/folder/:id`, `/folder/:id/message/:mid`, and `/search?q=` restores the matching view.
- [x] 8.3 Add a test: browser Back/Forward navigate between views (folder → message → Back → folder).
- [x] 8.4 Add a test: invalid deep links (`/folder/:id/message/<missing>`, `/folder/<missing>`) fall back gracefully and replace the URL.
- [x] 8.5 Add a test: server serves the SPA shell for an in-grammar deep path while asset requests resolve normally.

## 9. Validation cycle

- [x] 9.1 Run `deno task test:e2e` headless and fix any failures until the suite passes.
- [x] 9.2 Run `openspec validate ui-path-push-state` and reconcile any spec/scenario gaps surfaced by the implementation.

## 10. Warnings cleanup

- [x] 10.1 Run `deno task build` (and `svelte-check`) and fix all Svelte/TypeScript build warnings introduced by the change.
- [x] 10.2 Run `cargo build` for the workspace and confirm no new compilation warnings (server is unchanged, but verify).
