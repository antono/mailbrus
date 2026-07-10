## Context

The current `StatusBar.svelte` component displays sync progress via a persistent button showing text + icon, with a large popup containing per-mailbox fetched/indexed counts and status badges. Even after sync completes, the UI lingers in an active state, creating visual clutter and confusion about when the operation is truly done.

The redesign compresses this into a progressive disclosure model: a minimal idle dot expands into a button on demand, then into a spinner on action, and finally into a detailed log popup on click. This requires:
- State machine managing three UI states (idle dot, button, spinner)
- Event log system capturing sync events with timestamps
- localStorage persistence for event history (2000-line retention)
- Morphing animations between states

## Goals / Non-Goals

**Goals:**
- Reduce visual footprint at rest (idle dot only, ~8px)
- Progressive disclosure: button on click, spinner on action, log popup on demand
- Event-driven log with timestamps for all sync phases (checking password, connecting, fetching, indexed, etc.)
- Persistent event history across sessions (2000-line localStorage cap)
- Display 15 latest events in popup; expandable to view older events in current run
- Clear completion state (dot returns to idle immediately after sync finishes)

**Non-Goals:**
- Changing the sync protocol or backend event emission
- Adding real-time streaming visualization or animated charts
- Configurable log verbosity or filtering UI
- Mobile/responsive redesign (desktop-first)

## Decisions

### 1. State Machine: Three-Button States (Idle → Button → Spinner)
**Decision**: Implement a local component state (`state: 'idle' | 'button' | 'spinner'`) that cycles through states on click, and only opens the popup on spinner click.

**Rationale**: Gives users progressive control—they can invoke sync without immediately opening a large popup. The spinner itself becomes clickable to reveal details, reducing information overload at rest.

**Alternatives Considered**:
- Always show button (rejected: wastes space at idle, violates "minimal footprint" goal)
- Dot → popup directly (rejected: no way to invoke sync without opening details)
- Keyboard shortcut to sync (rejected: less discoverable; UI morphing is more tactile)

### 2. Event Log Architecture: In-Stream Events + localStorage
**Decision**: Capture events from `syncState` (password, connecting, fetching, indexed) and store them in a module-level array. Persist to localStorage on each event and load on mount. Display 15 latest; keep full current-run log in memory with older runs archived to localStorage.

**Rationale**: 
- Decouples event capture from UI rendering (events can arrive out of order or quickly)
- localStorage provides cross-session history without needing a backend database
- 2000-line cap prevents unbounded growth; 15-event display keeps popup compact
- Module-level array (reactive) allows popup to show live updates as events arrive

**Alternatives Considered**:
- Stream events directly from server (rejected: adds complexity; client-side buffering is simpler for UI)
- IndexedDB instead of localStorage (rejected: overkill for 2000 lines; localStorage is simpler)
- Unlimited history (rejected: localStorage has practical limits; 2000 lines is ~100KB and safe)

### 3. Event Shape and Timestamps
**Decision**: Each event is `{ timestamp: ISO8601, account: string, event: string, detail?: string }`. Events: "checking_password", "password_retrieved_<type>", "connecting", "connected", "fetching", "fetched", "indexed".

**Rationale**: ISO8601 timestamps are unambiguous and sortable. Account context is needed per-mailbox operations. Event names are CLI-friendly and human-readable.

**Alternatives Considered**:
- Unix milliseconds + per-account logs (rejected: harder to debug; ISO8601 human-readable)
- Numeric event codes (rejected: not self-documenting)

### 4. Popup Lifecycle: Click-to-Open, Auto-Close or Manual?
**Decision**: Popup opens on spinner click and stays open until user clicks the close button (×). The dot returns to idle state immediately after sync finishes, but popup remains visible if already open to allow log review.

**Rationale**: Allows users to review detailed logs after sync completes without rushing. Closing and reopening the popup is cheap; keeping it open respects that reviewing logs is important.

**Alternatives Considered**:
- Auto-close popup 3 seconds after completion (rejected: users may miss log; can be confusing)
- Spinner click toggles popup on/off (rejected: can't re-open easily if already dismissed)

### 5. localStorage Key and Expiry
**Decision**: Use a single key `mailbrus_sync_events` storing a JSON array of `{ timestamp, account, event, detail?, archived: boolean }`. Events marked `archived: true` are past runs. On each new sync, start a new unmarked run. On mount, load from localStorage and trim to 2000 lines (FIFO from oldest).

**Rationale**: Single key simplifies cleanup. Archival flag lets us show "current run" vs "history" without separate storage. 2000-line trim is O(n) but acceptable given infrequency.

**Alternatives Considered**:
- Per-run keys (rejected: harder to enforce 2000-line cap; many keys to manage)
- Immediate trim on each event (rejected: excessive write churn)

### 6. UI Morphing Animations
**Decision**: Use CSS transitions and Svelte reactive classes. Idle → button is a width/opacity transition. Button → spinner swaps content and adds rotation animation. Popup is positioned fixed, overlays with 0.5s slide-in.

**Rationale**: CSS transitions are performant and smooth. No external animation library needed. Keeps component self-contained.

**Alternatives Considered**:
- Framer Motion or gsap (rejected: adds dependency; CSS is sufficient)
- Instant state changes (rejected: jarring; transitions improve UX)

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| **localStorage quota exceeded** | 2000-line cap enforced on load; trim is O(n) but runs infrequently (once per session load). Monitor localStorage size in practice. |
| **Events arrive out of order or duplicate** | Rely on server-side event ordering; if duplicates occur, dedup in event capture logic. Add test coverage. |
| **Popup not visible if button is off-screen** | Fixed positioning relative to viewport; ensure bottom-right corner is always in bounds. Test on small screens. |
| **User confusion if sync completes but popup still shows spinner** | Clarify in log that sync is done (add "sync_completed" event). Dot returns to idle immediately for clarity. |
| **Performance: 2000 events render slowly** | Show only 15 in popup; older events are in expandable section. If needed, virtualize the list later. |

## Migration Plan

1. **Phase 1 (this change)**: Implement new StatusBar with three-state UI and event log. Keep old `syncHistory` module alongside (don't remove yet).
2. **Phase 2 (future)**: Retire old per-mailbox summary display; archive old sync runs. Remove `syncHistory` module if no longer needed.
3. **Rollback**: Keep old StatusBar component in git history. If issues arise, revert to previous version and debug.

## Open Questions

- Should the 15-event display be scrollable, or show a "X more events" link to expand? (Recommend scrollable with max-height 200px)
- Should events be searchable/filterable (e.g., by account)? (Out of scope for now; could be added later)
- Do we need to expose event history via CLI (e.g., `mailbrus log last 50`)? (Out of scope; separate feature)
- Should password events redact sensitive data in the log? (Recommend: yes, log "password_retrieved_storage" not the value itself)
