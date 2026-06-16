## Context

`mailbrus-notmuch-database` added the read-only `StatusBar` (spinner + per-account
progress popup) and the `syncState` SSE store. The server already exposes
`POST /api/sync` and `POST /api/sync/<account>` (both return `202 Accepted` and
run in the background). What's missing is a frontend trigger; today sync is only
reachable by `curl`.

## Goals / Non-Goals

**Goals:**
- A discoverable in-app way to start a sync (status-bar button + command palette
  + hotkey).
- Reuse the existing `syncState` store for in-flight detection and progress; no
  new state machine.
- No backend changes.

**Non-Goals:**
- Per-account trigger UI in the popup (all-accounts is enough for the MVP; the
  `triggerSync(accountId?)` helper leaves the door open).
- Auto-sync on an interval or on app focus (separate concern).
- Changing the SSE event shape or the server API.

## Decisions

### D1: Trigger entry points
**Decision:** Three entry points, all calling one `triggerSync()` helper:
1. A **"Sync now"** button in the `StatusBar` popup (primary, discoverable).
2. A **command-palette** entry ("Sync mail").
3. A **global hotkey** registered in the existing keymap.

Rationale: matches how other actions in the app are exposed (palette + hotkey),
and the status-bar button puts the trigger where progress is already shown.

### D2: In-flight handling
**Decision:** Derive "is a sync running" from `isActive()` in `syncState`. While
active, the "Sync now" button is disabled and the palette/hotkey are no-ops
(the server already returns `409` per account, but the client should not spam).

Rationale: single source of truth; avoids a second pending flag that could
desync from the SSE state.

### D3: Error handling
**Decision:** `triggerSync()` rejects on non-2xx; callers surface the message
(e.g. a transient line in the popup). A `503` (no sync engine) is shown as
"No accounts configured".

## Risks / Trade-offs

- **`202` is fire-and-forget** → the button can't await completion; progress
  comes from SSE. Mitigation: flip to the spinner on the first `running` event,
  not on the POST resolving.
- **Hotkey collisions** → pick a key not already bound in `global.ts`; validate
  against the existing keymap.

## Migration Plan

Frontend-only; no data migration. Ship the helper, then the three entry points,
then the E2E spec.
