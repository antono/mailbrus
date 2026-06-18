## Why

The current sync status bar is visually bloated and confusing—it always shows a large pill badge ("Syncing…", "Started…") and a detailed popup with per-mailbox rows, fetched/indexed counts, and status badges. Even after sync completes on the backend, the UI lingers in a "running" state. Users need a more compact, progressively-disclosed experience: minimal at rest, action-oriented on demand, and information-rich only when explicitly requested.

## What Changes

- **Idle state**: Show only a compact status dot (minimal footprint, right-aligned bottom corner)
- **Progressive disclosure**: Clicking the dot morphs inline to a "Sync now" button; clicking the button morphs to a spinner; clicking the spinner opens the popup
- **Event log**: Replace per-mailbox summary rows with a timestamped event log. Events include:
  - `checking password`
  - `password retrieved from storage <type>`
  - `connecting`
  - `connected`
  - `fetching`
  - `fetched`
  - `indexed`
- **Log display & persistence**:
  - Popup shows 15 latest events with timestamps
  - Additional events from current sync run kept in localStorage (expandable)
  - Total 2000 history lines retained in localStorage for past sync runs
- **State clarity**: Remove ambiguity around completion—the popup closes automatically or requires explicit dismissal, and the dot returns to idle state immediately after sync finishes

## Capabilities

### New Capabilities
- `sync-status-compact-ui`: Redesigned sync status display with three-state morphing control (idle dot → button → spinner → popup)
- `sync-event-log`: Timestamped event log with localStorage persistence (15 latest events displayed, 2000-line total history retained)

### Modified Capabilities
- `ui-sync-status`: Spec-level behavior changes to the sync status bar rendering, state transitions, and information display

## Impact

- **Components**: `src/lib/components/StatusBar.svelte` (complete redesign of UI and state machine)
- **Stores/Modules**: `src/lib/syncState.svelte.ts`, `src/lib/syncHistory.svelte.ts` (event log filtering/formatting, localStorage persistence for 2000-line event history)
- **Storage**: localStorage for current sync events and up to 2000 historical event lines
- **Styling**: Significant CSS changes for compact toggle button, morphing states, and simplified popup
- **No breaking changes**: This is a UI-only refinement; API and backend behavior remain unchanged

## Non-goals

- Changing how sync is triggered or the underlying sync protocol
- Modifying the server-side sync logic or event emission
- Adding configurable UI themes or density settings for this component
