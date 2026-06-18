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

### 4. "Run" snapshot on all-terminal state

**Decision:** After every `applyEvent()`, check if all rows are terminal (`status !== 'running'` for both sync and index on every row). If so, clone the current rows as a "run" with a `finishedAt` timestamp, push to history, and persist.

**Rationale:** This naturally captures each sync run once it's fully complete. If the user triggers a new sync while old terminal rows are still visible, those rows belong to the previous run — the new sync creates fresh rows.

**Risk:** If SSE reconnects and re-emits old "done" events, it could create duplicate runs. Mitigation: deduplicate by comparing row contents before pushing, or add a monotonic run counter.

### 5. Backend: `SyncFinished` broadcast event

**Decision:** Add a third `BroadcastEvent` variant `SyncFinished { accounts: Vec<String>, timestamp: String }` emitted by `sync_all()` after all spawned account workers complete.

**Rationale:** Without a terminal signal, the frontend must infer "everyone is done" by watching per-row statuses, which is error-prone (misses accounts that were never started, race conditions on reconnect). A dedicated event gives a single authoritative signal.

`sync_all()` currently spawns N tasks and returns immediately — it has no join handle. Change to collect `JoinHandle`s and await them in a new background task that sends `SyncFinished` once all complete.

```rust
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum BroadcastEvent {
    Sync(SyncEvent),
    Index(IndexEvent),
    SyncFinished(SyncFinishedEvent),
}

#[derive(Debug, Clone, Serialize)]
pub struct SyncFinishedEvent {
    pub accounts: Vec<String>,
}
```

**Alternatives considered:**
- Frontend-only inference — current approach, proven unreliable (the `fixme` tests confirm it's not working)
- Add a counter on the `SyncEngine` decremented per-account — more complex, requires atomic shared state

### 6. Presentation: summary header + current + history sections

**Decision:** Restructure the popup into three sections:
1. **Summary header** — total fetched/indexed/errors across all accounts for the current/last run
2. **Current run** — same per-account rows as today, with timestamps showing when sync started
3. **History** — collapsed list of prior runs (max 3), each expandable to show per-account details

**Rationale:** The summary gives a quick "did it work?" answer. The per-account rows remain for detail. History is secondary but accessible.

## Risks / Trade-offs

- **[Risk] localStorage quota** — 3 runs with a handful of accounts is tiny (< 10KB). Mitigation: serialize only essential fields, skip large error messages beyond the first 200 chars.
- **[Risk] Stale history after SSE reconnect** — If the SSE connection drops mid-sync and reconnects, the server may re-send events from a fresh sync, confusing the run boundary detection. Mitigation: use a monotonic `runId` counter in the frontend; only snapshot rows whose `runId` matches the current run.
- **[Trade-off] No server-side history** — History is local-only. If the user switches machines or clears browser data, history is lost. Acceptable for an MVP; could be pushed to server later.
- **[Trade-off] History only shows per-account aggregates, not per-message logs** — The user asked for "logs" but in the context of sync status, per-mailbox stats are the right granularity. Full per-message logs are out of scope.
