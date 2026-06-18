## Context

The sync status dialog lives in `src/lib/syncState.svelte.ts` (reactive store) and `src/lib/components/StatusBar.svelte` (presentation). Currently:

- `syncState` is a plain `$state` rune with a `rows` map keyed by `account_id + mailbox`. No history, no persistence.
- `isActive()` returns `true` if any row has `syncStatus === 'running'` or `indexStatus === 'running'`. This works but has no guard for stale events after reconnect.
- A `"Sync now"` button calls `requestSync()` which checks `isActive()` then calls `triggerSync()` (`POST /api/sync`). There is no optimistic state — the button's disabled state depends on SSE events arriving, not on the click itself.
- Status bar tests for spinner lifecycle and disabled state are marked `fixme` because the E2E harness lacks a completing IMAP backend — we can still test the frontend logic in isolation or via stubbed SSE.

The user wants:
1. **History**: Keep last 3 completed sync runs visible in the popup, survive page reload (localStorage).
2. **Optimistic "Sync now"**: On click, immediately show "started sync" state and disable the button.
3. **Button disabled while active**: Already partially implemented, but needs the optimistic instant feedback.

## Goals / Non-Goals

**Goals:**
- Persist last 3 sync runs (per-account statuses, counts, timestamps) in `localStorage`
- Show a summary of current + historical runs in the sync popup
- On clicking "Sync now": immediately set an optimistic `started` state flag, disable the button, reset on SSE "running" or "done" events
- Fix `isActive()` to correctly reflect terminal state after SSE reconnect/stale events
- Add "clear history" button to dismiss old logs

**Non-Goals:**
- Do not change the SSE wire format or server-side events
- Do not change the Rust backend
- Do not add real-time elapsed timers (just log timestamps)

## Decisions

### 1. History data model: array of sync runs, not a flat map

**Decision:** Keep the live `syncState.rows` map as-is for the current/latest sync. Add a separate `syncHistory` module that collects completed runs and persists to `localStorage`.

**Rationale:** The live map is ideal for real-time SSE merging. A separate history array avoids coupling the hot event pipeline with serialization. On each "sync done" or "index done" for all rows, snapshot current rows as a "run" and push to the history buffer.

**Alternatives considered:**
- Persist the live map directly — would store intermediate states; harder to distinguish "in-progress" from "completed".
- Extend the broadcast with a `finished` sentinel — would require server changes (explicitly excluded).

### 2. Optimistic "started sync" via a `$state` flag

**Decision:** Add `started: boolean` to `syncState`. `requestSync()` sets `started = true` before the HTTP call. On any incoming SSE event (even the first `running`), clear `started`. The button is disabled when `isActive() || started`.

**Rationale:** The SSE stream is the source of truth — once the first event arrives, the live status overrides the optimistic flag. This gives instant feedback without waiting for the HTTP round-trip + SSE propagation.

**Alternatives considered:**
- Use a Promise-based approach on `requestSync()` — but the server returns 202 immediately, sync runs async. SSE events are the real signal, not the HTTP response.
- Show disabled with no optimistic text — current behavior, which feels unresponsive.

### 3. History eviction: FIFO, max 3 runs

**Decision:** Keep a fixed-size FIFO array of up to 3 completed sync runs. Newest appended to the end. Oldest shifted out. Persisted via `localStorage` key `mailbrus_sync_history`.

**Rationale:** Three runs gives enough context for "what happened recently" without cluttering the popup. FIFO is the simplest eviction policy and matches the user's request.

### 4. "Run" snapshot on `SyncFinished` (authoritative), inference as fallback

**Decision:** The authoritative trigger for snapshotting a run is the backend
`SyncFinished` event (see Decision 5). The frontend-inference path ("all rows
terminal") is kept **only as a fallback** for the case where `SyncFinished` is
lost (e.g. the SSE connection drops during the brief window between the last
per-row `done` and `SyncFinished`, and the broadcast channel does not replay).
On `SyncFinished`, stamp `finishedAt` on every row whose `accountId` is in the
event's `accounts` list, snapshot those rows into history, and mark the run
closed. Inference is **not** the primary path — Decision 5 supersedes the
original inference-only approach.

**Rationale:** `SyncFinished` gives a single authoritative "this run is closed"
signal. Inference is brittle for the reasons in Decision 5, but cheap to keep as
a safety net for the narrow reconnect-during-teardown window.

**Risk:** Duplicate snapshots if both `SyncFinished` and a later inference pass
fire. Mitigation: a `runClosed: boolean` flag on `syncState`, set by
`SyncFinished` and cleared on the next `requestSync()` or next `running` event.
Inference checks `runClosed` and skips if already closed.

> **Note:** The `tokio::broadcast` channel is fire-and-forget — it does **not**
> replay missed events on reconnect. So "stale events after reconnect" is only a
> risk for the brief overlap where the old receiver is still draining while a new
> `EventSource` opens; it is not a general replay problem. This lowers the
> priority of the inference fallback but does not eliminate it.

### 5. Backend: `SyncFinished` broadcast event

**Decision:** Add a third `BroadcastEvent` variant `SyncFinished` emitted once
all account workers in a given run reach a terminal state. It fires from two
sites:

- `sync_all()`: collect the per-account `JoinHandle`s from the spawned
  `sync_account` tasks and spawn a supervisor that awaits all of them, then
  sends `SyncFinished` with the full account list.
- `sync_account()` single-account path: the existing `run_account_worker`
  already sends a final `SyncEvent` with `Done`/`Error`. After that send, emit
  `SyncFinished { accounts: vec![id.clone()] }` so single-account triggers
  (route `POST /api/sync/<id>`) also close the run on the frontend.

```rust
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum BroadcastEvent {
    Sync(SyncEvent),
    Index(IndexEvent),
    // NOTE: the enum-level `rename_all = "lowercase"` would render this as
    // `"syncfinished"`. Override explicitly to match the wire format the
    // frontend and specs expect.
    #[serde(rename = "sync_finished")]
    SyncFinished(SyncFinishedEvent),
}

#[derive(Debug, Clone, Serialize)]
pub struct SyncFinishedEvent {
    pub accounts: Vec<String>,
}
```

**Edge cases:**
- **No accounts configured:** `sync_all()` spawns zero tasks; the supervisor's
  join set is empty, so `SyncFinished { accounts: vec![] }` fires immediately
  (required by the notmuch-database delta spec).
- **`sync_all()` called while a run is already in flight:** each per-account
  `sync_account` returns `AlreadyRunning` and is logged; no new worker is
  spawned, so no second `SyncFinished` is produced for the rejected call. The
  frontend must clear its optimistic `started` flag on the HTTP response in
  this case (see Edge Cases §"Concurrent/overlapping trigger").
- **`sync_account()` rejected as `AlreadyRunning`:** no worker spawned, no
  `SyncFinished`. Same frontend handling as above.

`sync_all()` currently spawns N tasks and returns immediately — it has no join
handle. Change to collect `JoinHandle`s and await them in a new background task
that sends `SyncFinished` once all complete.

**Alternatives considered:**
- Frontend-only inference — former approach, proven unreliable (the `fixme`
  tests confirm it's not working). Kept only as a fallback (Decision 4).
- Add a counter on the `SyncEngine` decremented per-account — more complex,
  requires atomic shared state; the join-handle supervisor is simpler and
  composes with the existing spawn-per-account structure.

### 6. Presentation: summary header + current + history sections

**Decision:** Restructure the popup into three sections:
1. **Summary header** — total fetched/indexed/errors across all accounts for the current/last run
2. **Current run** — same per-account rows as today, with timestamps showing when sync started
3. **History** — collapsed list of prior runs (max 3), each expandable to show per-account details

**Rationale:** The summary gives a quick "did it work?" answer. The per-account rows remain for detail. History is secondary but accessible.

While a run is in flight, the summary aggregates the live `syncState.rows`.
After `SyncFinished`, the "current run" becomes the "last run"; the summary then
reflects the just-snapshotted run (same numbers, frozen). A new `requestSync()`
or first `running` event flips the summary back to live-aggregation mode.

### 7. `isActive()` state machine

**Decision:** `isActive()` is no longer a pure derive over row statuses. It
becomes a state machine driven by `requestSync`, `running` events, and
`SyncFinished`:

| State | `isActive()` | `started` | Transition on… |
| --- | --- | --- | --- |
| Idle | `false` | `false` | `requestSync()` → Optimistic |
| Optimistic | `true` | `true` | first `running` event → Running; HTTP failure → Idle; SSE drop + timeout → Idle |
| Running | `true` | `false` | `SyncFinished` → Finished |
| Finished | `false` | `false` | next `requestSync()` → Optimistic; next `running` event → Running |

Concretely, add two fields to `syncState`: `started: boolean` (Decision 2) and
`runClosed: boolean`. `isActive()` returns `started || (!runClosed && anyRowRunning)`.
`runClosed` is set `true` on `SyncFinished` and reset to `false` by `requestSync()`
and by any incoming `running` event. This guarantees:

- After `SyncFinished`, the spinner stops even if a stray late `running` event
  for an already-closed account arrives (it would re-open the run — see the
  guard below).
- A genuine new sync (user clicks "Sync now", or a `running` event for an
  account *not* in the last `SyncFinished.accounts` arrives) re-arms the
  spinner.

**Guard against late events reopening a closed run:** when a `running` event
arrives while `runClosed === true`, only transition back to Running if the
event's `account_id` was **not** in the most recent `SyncFinished.accounts`.
Events for accounts that just finished are treated as stragglers and dropped
until a fresh `requestSync()`.

## Edge Cases & Frontend Contract

### Optimistic `started` must always be cleared

`started` is set in `requestSync()` before the HTTP call. It must be cleared by
**any** of:

1. The first `running` SSE event (live state takes over).
2. A `SyncFinished` event (run already done by the time we hear about it).
3. The HTTP call failing (`catch` in `onSyncNow` — surface `triggerError` and
   re-enable the button). Required by the sveltekit-ui delta scenario "Trigger
   failure surfaces an error".
4. A safety timeout: if no SSE event arrives within ~10s of `requestSync()`
   while `syncState.connected === false`, clear `started` and surface a
   "no sync stream" error. (Without this, a dropped SSE connection + a
   successful 202 would hang the button forever.)

### Concurrent / overlapping `sync_all` trigger

If the user double-clicks "Sync now" or triggers it via palette + hotkey near
simultaneously, the second `POST /api/sync` may still return 202 (the per-account
`AlreadyRunning` errors are logged server-side but do not fail the route). The
frontend's `isActive()` / `started` guard already prevents the second click from
firing because the button is disabled. If, however, a programmatic trigger
bypasses the guard, `requestSync()` checks `isActive()` first and no-ops — so no
double optimistic state. Document this contract: `requestSync()` is the only
entry point and it always checks `isActive()`.

### localStorage: schema versioning and SSR guard

- Wrap the persisted object as `{ version: 1, runs: SyncRun[] }`. On load, if
  `version` mismatches or parsing throws, discard and start empty (do **not**
  throw into the UI).
- All `localStorage` access must be guarded by `typeof localStorage !==
  'undefined'` (SvelteKit SSR, and Tauri webview edge cases). Mirror the
  existing `EventSource` guard in `connectSyncStream()`.
- Truncate `error` strings to 200 chars before persisting (Risk #1).

### Run identity

There is no backend-issued run ID. For MVP the `SyncFinished.accounts` list is
the authoritative "these accounts completed together" signal. A frontend
`runId` counter (incremented on each `requestSync()` and stamped on the
snapshot) is used only to dedupe snapshots (Decision 4 risk mitigation), not to
correlate events. If overlap support is ever needed, a backend run ID would have
to be added — explicitly out of scope here.

## E2E Testability

The existing E2E harness (per `AGENTS.md` / `e2e/README.md`) uses a stubbed IMAP
backend that does not complete a full sync, which is why the spinner/history
tests are currently `fixme`'d. Adding `SyncFinished` does not by itself fix
those tests — if the stub never terminates, `SyncFinished` never fires.

Two viable approaches (pick per test; do not mix silently):

1. **Stubbed SSE injection** — for frontend-only tests (optimistic state,
   history persistence, clear-history, aggregate summary), drive `syncState`
   directly via a test-only seam that fakes `SyncEvent`, `IndexEvent`, and
   `SyncFinished` events. This avoids depending on the backend completing.
2. **Completing IMAP stub** — for end-to-end tests (spinner lifecycle stops on
   real `SyncFinished`), extend the harness with a stub that fetches zero
   messages and returns immediately, so `run_account_worker` reaches `Done` and
   the supervisor emits `SyncFinished`. This is the only way to exercise the
   real backend join-handle path.

Tests that un-`fixme` should declare which path they use in their
`// openspec/...` reference comment, per the mailbrus-e2e-author skill.

## Risks / Trade-offs

- **[Risk] localStorage quota** — 3 runs with a handful of accounts is tiny (< 10KB). Mitigation: serialize only essential fields, skip large error messages beyond the first 200 chars; wrap payload as `{ version, runs }` so future shape changes can discard stale data cleanly.
- **[Risk] Stale history after SSE reconnect** — The `tokio::broadcast` channel is fire-and-forget and does **not** replay missed events on reconnect, so the original concern is narrower than it first appears. The remaining risk is the brief overlap where an old receiver is still draining while a new `EventSource` opens. Mitigation: the `runClosed` flag (Decision 7) plus the `runId` dedupe check (Decision 4) prevent duplicate or zombie runs.
- **[Risk] Optimistic `started` hangs** — if the SSE stream is down and `requestSync()` returns 202, `started` would never be cleared by an event. Mitigation: the 10s safety timeout + `connected` check in Edge Cases §"Optimistic `started` must always be cleared".
- **[Risk] E2E tests can't observe `SyncFinished`** — the stubbed IMAP harness does not complete a sync. Mitigation: test-only SSE seam + a completing stub variant; see "E2E Testability".
- **[Trade-off] No server-side history** — History is local-only. If the user switches machines or clears browser data, history is lost. Acceptable for an MVP; could be pushed to server later.
- **[Trade-off] History only shows per-account aggregates, not per-message logs** — The user asked for "logs" but in the context of sync status, per-mailbox stats are the right granularity. Full per-message logs are out of scope.
- **[Trade-off] No backend run ID** — run correlation relies on `SyncFinished.accounts` + a frontend `runId` for dedupe. Overlapping/concurrent runs are not supported (and are already prevented server-side by the `in_flight` guard).
