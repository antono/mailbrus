## 1. Backend — SyncFinished event

- [x] 1.1 Add `SyncFinishedEvent` struct and `BroadcastEvent::SyncFinished` variant to `mailbrus-core/src/sync/engine.rs`
- [x] 1.2 Modify `sync_all()` to collect `JoinHandle`s and spawn a background task that awaits all and emits `SyncFinished` with the account list
- [x] 1.3 Add a `SyncFinished` event emission after single-account `sync_account()` completes
- [x] 1.4 Update handler in `mailbrus-server/src/handlers/sync.rs` to handle the new variant (auto‑serialized via serde tag)

## 2. Frontend — syncState store updates

- [x] 2.1 Add `started: boolean` to `syncState`; set `true` in `requestSync()` before HTTP call; clear on first incoming SSE event or `SyncFinished`
- [x] 2.2 Handle `SyncFinished` event in `applyEvent()`: set a `runFinishedAt` timestamp on all rows, trigger history snapshot
- [x] 2.3 Fix `isActive()` to return `false` once `SyncFinished` has been received for the current run (guard against stale reconnect events)
- [x] 2.4 Add `totalDerived()` or similar aggregate computed state (sum fetched, indexed, errors across all rows)

## 3. Frontend — sync history persistence

- [x] 3.1 Create `src/lib/syncHistory.svelte.ts` module with types `SyncRun` and `SyncHistory`
- [x] 3.2 Implement `saveRun(rows, finishedAt)` — snapshots current rows into a `SyncRun` and appends to `localStorage['mailbrus_sync_history']`, evicting oldest when >3
- [x] 3.3 Implement `loadHistory()` — reads and deserializes history from `localStorage`
- [x] 3.4 Implement `clearHistory()` — removes `localStorage['mailbrus_sync_history']` key
- [x] 3.5 Integrate snapshot trigger into `connectSyncStream()` or `applyEvent()` on `SyncFinished`

## 4. Frontend — StatusBar popup restructure

- [x] 4.1 Add summary header row to popup (total fetched, total indexed, total errors) using aggregate derived state
- [x] 4.2 Add history section below current run rows, up to 3 entries, each expandable
- [x] 4.3 Add "Clear history" button (hidden when history is empty)
- [x] 4.4 Display optimistic "Started…" text on sync button immediately on click; re-enable after `SyncFinished`
- [x] 4.5 Ensure toggle button shows idle dot + "Idle" text after `SyncFinished` (spinner stops)

## 5. E2E test validation & fixes

- [x] 5.1 Update `e2e/specs/status-bar.spec.ts` — add scenarios for: optimistic started state; keep spinner/history fixme (need completing IMAP backend)
- [x] 5.2 Update `e2e/specs/sync-trigger.spec.ts` — un‑fixme disabled-during-flight test; add test for optimistic button text
- [x] 5.3 Update `e2e/specs/index-events.spec.ts` — add test for SyncFinished event shape; keep index-done fixme
- [x] 5.4 Update `e2e/specs/sync.spec.ts` — add assertions for SyncFinished event in the SSE stream
- [x] 5.5 Run full E2E suite and fix any regressions (149 passed, 0 failed, 5 skipped — pre-existing fixme only)

## 6. Cleanup

- [x] 6.1 Fix any compilation warnings in Rust and TypeScript/Svelte (no warnings found)
- [x] 6.2 Remove `fixme` markers from spec scenarios that are now implemented (removed from sync-trigger.spec.ts; others need completing IMAP backend)
