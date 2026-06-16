## Why

The desktop app can display sync and indexing progress (the `StatusBar` added
in `mailbrus-notmuch-database`), but there is **no way to start a sync from the
UI**. Sync is only reachable via `POST /api/sync` / `POST /api/sync/<account>`
over HTTP. A user running the desktop app has to drop to a terminal and `curl`
to fetch new mail — and the StatusBar's spinner/popup can never light up from
in-app action. This closes that gap.

## What Changes

- Add a `triggerSync(accountId?)` helper to the frontend data layer that calls
  `POST /api/sync` (all accounts) or `POST /api/sync/<account>` (one account).
- Add a **"Sync now"** action to the `StatusBar` popup that triggers a sync for
  all configured accounts and reflects progress through the existing SSE stream.
- Add a global **command-palette entry** and a **hotkey** to trigger a sync
  without opening the popup.
- Disable the trigger (and show the spinner) while a sync is already in flight,
  using the existing `syncState` store.

The server API is unchanged — the endpoints already exist. This is a
frontend-only change.

## Capabilities

### Modified Capabilities
- `sveltekit-ui`: The status bar gains a sync trigger; a command-palette entry
  and a hotkey also start an on-demand sync.

## Impact

- `mailbrus-frontend`: `src/lib/api.ts` (new helper), `StatusBar.svelte`
  (trigger button + disabled/in-flight state), command palette + global keymap.
- No changes to `mailbrus-core`, `mailbrus-server`, or `mailbrus-cli`.
- E2E: a new spec asserting the trigger issues `POST /api/sync` and the spinner
  reacts; the deeper "sync completes" path stays gated behind the same live-IMAP
  limitation noted in `mailbrus-notmuch-database` (`test.fixme`).
