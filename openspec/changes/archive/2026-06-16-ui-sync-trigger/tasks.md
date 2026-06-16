## 1. Frontend data layer

- [x] 1.1 Add `triggerSync(accountId?: string): Promise<void>` to `src/lib/api.ts` — `POST /api/sync` when no id, `POST /api/sync/<account>` otherwise; reject on non-2xx with the server's error message
- [x] 1.2 Treat `202` as success (fire-and-forget); do not await sync completion

## 2. StatusBar trigger

- [x] 2.1 Add a "Sync now" button to the `StatusBar` popup (`data-testid="status-bar.sync-btn"`)
- [x] 2.2 Disable the button while `isActive()` is true (sync in flight)
- [x] 2.3 On click, call `triggerSync()`; surface any rejection as an inline error in the popup
- [x] 2.4 Verify the spinner lights up from the first `running` SSE event (not from the POST resolving)

## 3. Command palette + hotkey

- [x] 3.1 Add a "Sync mail" entry to the command palette that calls `triggerSync()`
- [x] 3.2 Register a global hotkey in `src/lib/hotkeys/global.ts` that calls `triggerSync()` (choose a key with no existing binding; verify against the current keymap)
- [x] 3.3 Make the palette entry / hotkey a no-op while a sync is already in flight

## 4. E2E + validation

- [x] 4.1 Add an E2E spec: clicking "Sync now" issues `POST /api/sync` (assert via intercepted request or a follow-on SSE `sync` frame)
- [x] 4.2 Keep the "sync completes / spinner during real index" assertion as `test.fixme` (same live-IMAP limitation as `mailbrus-notmuch-database`)
- [x] 4.3 `deno task build` succeeds and the new Svelte passes the `svelte-autofixer`
- [ ] 4.4 Run the affected E2E specs (`deno task test:e2e status-bar`)
