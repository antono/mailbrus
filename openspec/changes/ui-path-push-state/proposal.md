## Why

All navigation state lives only in in-memory `+page.svelte` state (the `account → folder → list → reader` phase machine, plus search). The URL never changes, so a reload always drops the user back at the account picker, no view can be bookmarked or shared, and the browser back/forward buttons do nothing. For a web/PWA email client this breaks basic navigation expectations and makes deep linking impossible.

## What Changes

- Reflect the current view in the URL path via the History API (SvelteKit `pushState`/`replaceState` shallow routing) for: folder/mailbox, thread/conversation, single message, and search query.
- Parse the URL on initial load and hydrate the phase machine to the matching view (deep-link and restore-on-reload), instead of always starting at `account`.
- Drive browser back/forward (`popstate`) into phase transitions instead of ignoring them.
- Add an SPA fallback so deep paths served by `mailbrus-server` resolve to the app shell rather than 404.

Illustrative path shapes (finalized in design):

- `/folder/:folderId` — folder list
- `/folder/:folderId/t/:threadId` — thread
- `/folder/:folderId/t/:threadId/message/:messageId` — single message
- `/search?q=…` — search results

## Capabilities

### New Capabilities

- `ui-path-routing`: The URL path encodes and restores navigation state (folder, thread, message, search). Deep links and reloads restore the matching view, and browser back/forward navigates between views.

### Modified Capabilities

- `sveltekit-ui`: The "App shell and phase state machine" requirement changes — phase transitions update the URL, and the initial phase is derived from the URL rather than always starting at `account`.

## Impact

- **Frontend code**: `src/routes/+page.svelte` (phase transitions, init-from-URL, `popstate` handling); a new `src/lib/url.ts` (path ↔ state mapping); possibly `src/routes/+layout.ts`.
- **Build**: `svelte.config.js` static adapter `fallback` option for SPA deep paths.
- **Server**: `mailbrus-server` static serving must fall back to the app shell for unknown paths.
- **Tests**: Playwright E2E — add deep-link, reload-restore, and back/forward scenarios.
- **Dependencies**: none new (uses `$app/navigation` and `$app/state`).

## Non-goals

- No server-side rendering or per-route SvelteKit page files — the app stays a single-page shell.
- No changes to data-fetching, API endpoints, or pagination behavior.
- No deep-linking of the compose flow — compose remains an overlay, not a routable view (can be revisited later).
