## Why

The sync status dialog shows per-mailbox progress stats during sync, but provides no aggregate view, no history after sync completes, and no persistence across sessions. The spinner also fails to reliably stop when sync finishes, leaving users uncertain whether sync is still running.

## What Changes

- **Show aggregate stats** in the sync popup (total fetched, indexed, errors) instead of or in addition to per-row counts, with a summary header line
- **Fix spinner lifecycle** so it always stops when every account's sync and indexing reaches `done` or `error` status — ensure `isActive()` correctly reflects terminal state
- **Persist sync history** to `localStorage` so the last N sync runs and their per-account results survive page reloads / window close & reopen
- **Add a "clear history" action** in the popup so users can dismiss old logs manually

## Capabilities

### New Capabilities
- `sync-history-persistence`: Persist sync run logs (per-account status, counts, errors, timestamps) to `localStorage`; display historical runs in the popup alongside the current/last-run; provide a clear-history button

### Modified Capabilities
- `notmuch-database`: Update REQUIREMENTS for spinner behavior — ensure spinner stops when all sync+index events are terminal (fix `isActive()` semantics and add explicit tests)
- `sveltekit-ui`: Update REQUIREMENTS for the sync status popup — show aggregate summary stats (total fetched/indexed/errors), restructure the popup layout to show a summary header + per-account details, add history from prior sync runs

## Impact

- **Frontend**: `src/lib/syncState.svelte.ts` — replace flat `$state` map with a time-stamped history structure; add read/write from `localStorage`; fix `isActive()` semantics; add aggregate derived state. `src/lib/components/StatusBar.svelte` — restructure popup with summary header, history list, and clear button. New module `src/lib/syncHistory.svelte.ts` if history logic warrants extraction.
- **E2E tests**: Update/remove `fixme` on spinner- and history- related specs in `e2e/specs/status-bar.spec.ts`, `e2e/specs/sync-trigger.spec.ts`, `e2e/specs/index-events.spec.ts`; add new tests for history persistence and aggregate stats.
- **Specs**: Delta spec `notmuch-database` for spinner fix; delta spec `sveltekit-ui` for popup restructure.
