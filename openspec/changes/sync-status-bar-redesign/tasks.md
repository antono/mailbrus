## 1. Event Log Module

- [ ] 1.1 Create `src/lib/syncEventLog.svelte.ts` module for capturing and persisting events
- [ ] 1.2 Implement event interface: `{ timestamp: string, account: string, event: string, detail?: string, archived?: boolean }`
- [ ] 1.3 Add `addEvent(account, eventType, detail?)` function to capture events in memory
- [ ] 1.4 Implement localStorage persistence: save events on each capture to `mailbrus_sync_events`
- [ ] 1.5 Implement load from localStorage on module initialization
- [ ] 1.6 Implement 2000-line FIFO trim when loading from localStorage
- [ ] 1.7 Add event deduplication check (prevent duplicate events within 100ms)
- [ ] 1.8 Export reactive runes: `allEvents`, `currentRunEvents`, `historyRuns` for UI consumption

## 2. Event Capture Integration

- [ ] 2.1 Integrate event capture into syncState: emit `checking_password`, `password_retrieved_<type>`, `connecting`, `connected` events
- [ ] 2.2 Emit `fetching`, `fetched`, `indexed` events from sync lifecycle
- [ ] 2.3 Emit `sync_completed` or `sync_failed` event on sync finish
- [ ] 2.4 Mark completed runs as archived in syncEventLog for history display
- [ ] 2.5 Test event capture end-to-end with mock sync run (no real mail server)

## 3. StatusBar Component Refactor

- [ ] 3.1 Redesign StatusBar.svelte state machine: add `state: 'idle' | 'button' | 'spinner'` local state
- [ ] 3.2 Implement state transitions: idle → button (click), button → spinner (click), spinner → popup open (click)
- [ ] 3.3 Remove old summary rows (fetched/indexed counts) from popup body
- [ ] 3.4 Add "Sync now" button that only appears in button state
- [ ] 3.5 Ensure spinner returns to idle immediately when sync completes
- [ ] 3.6 Keep popup open after sync completes (allow manual review before closing)

## 4. Event Log Popup Display

- [ ] 4.1 Redesign popup body to show event log instead of per-mailbox summary
- [ ] 4.2 Display 15 latest events from currentRunEvents in reverse chronological order
- [ ] 4.3 Format each event as: `[HH:MM:SS] account: event_type (detail)` in popup
- [ ] 4.4 Add scrollable area for events (max-height 200px if more than fit)
- [ ] 4.5 Display "X more events" indicator if current run has more than 15 events
- [ ] 4.6 Add clickable expand/collapse for historical runs (archived events)
- [ ] 4.7 Add "Copy log" button to copy all visible events as plain text to clipboard
- [ ] 4.8 Add "Clear history" button with confirmation dialog

## 5. Styling and Animations

- [ ] 5.1 Create CSS for idle dot state (~6px circular dot, muted color)
- [ ] 5.2 Create CSS for button state ("Sync now" text, border, padding)
- [ ] 5.3 Create CSS for spinner state (rotated icon or animated spinner, 0.7s rotation)
- [ ] 5.4 Implement CSS transitions for morphing: dot ↔ button ↔ spinner (300ms)
- [ ] 5.5 Implement error state styling (red dot, red border)
- [ ] 5.6 Ensure popup positioning is fixed, below spinner, with proper z-index (50+)
- [ ] 5.7 Test popup positioning on small screens (80vw max width)

## 6. Error Handling and Edge Cases

- [ ] 6.1 Handle password events: ensure detail field only shows type (keyring/file), never password value
- [ ] 6.2 Handle localStorage quota exceeded: gracefully trim or warn if quota approaches
- [ ] 6.3 Handle rapid event arrivals: ensure no loss or duplication
- [ ] 6.4 Handle sync failures: display error in event log and show error-state dot
- [ ] 6.5 Handle race conditions: ensure state transitions don't overlap or cause flickering

## 7. Testing

- [ ] 7.1 Write unit tests for syncEventLog: add event, load from storage, trim on quota
- [ ] 7.2 Write unit tests for state machine: verify idle → button → spinner transitions
- [ ] 7.3 Write E2E test: verify idle dot is visible at startup (openspec/changes/sync-status-bar-redesign/e2e-sync-status-dot.spec.ts)
- [ ] 7.4 Write E2E test: verify clicking idle dot morphs to button and button is clickable
- [ ] 7.5 Write E2E test: verify clicking button starts sync and morphs to spinner
- [ ] 7.6 Write E2E test: verify clicking spinner opens popup with events
- [ ] 7.7 Write E2E test: verify event log displays timestamps, account, and event types correctly
- [ ] 7.8 Write E2E test: verify popup closes and spinner returns to idle after sync completes
- [ ] 7.9 Write E2E test: verify error dot appears on sync failure
- [ ] 7.10 Write E2E test: verify "Clear history" button works with confirmation

## 8. E2E Test Validation and Fixes

- [ ] 8.1 Run full E2E test suite: `deno task test:e2e`
- [ ] 8.2 Fix any failing tests (trace viewer available via `deno task e2e:debug`)
- [ ] 8.3 Verify no regressions in existing tests (status bar, sync, mailbox views)
- [ ] 8.4 Manual smoke test: verify UI feels responsive and smooth in browser

## 9. Cleanup and Verification

- [ ] 9.1 Remove old syncHistory UI code if no longer used elsewhere
- [ ] 9.2 Fix any TypeScript compilation warnings
- [ ] 9.3 Run `deno lint` and fix any style/lint issues
- [ ] 9.4 Verify localStorage keys are consistent and documented in module
- [ ] 9.5 Add JSDoc comments to syncEventLog module exports
