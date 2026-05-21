## Context

A keyboard-first email client needs reliable, context-aware hotkeys. A partial implementation already exists in `src/routes/+page.svelte` (single `window.addEventListener('keydown', onKey)` inside a `$effect`). Some overlay components (Compose, KeyboardHelp, About, HeadersPopover) register their own `keydown` listeners locally. The design must describe this architecture, its invariants, and the gaps it leaves open.

## Goals / Non-Goals

**Goals:**
- Document the dispatch architecture so future keys can be added consistently
- Specify how context guards work (which keys are active in which view)
- Cover the leader-key state machine
- Clarify which component owns which escape

**Non-Goals:**
- Rebindable hotkeys — keys are hard-coded for now
- Hotkey persistence or user configuration (that belongs in the Tweaks panel)
- IME / non-Latin keyboard compatibility

## Decisions

### 1. Single global dispatcher in `+page.svelte`

All application-level keys are captured by one `window.addEventListener('keydown', onKey)` registered in the root `$effect`. The handler reads Svelte `$state` directly to determine context (`phase`, `openMessage`, `cmdOpen`, `composeOpen`, `helpOpen`, `aboutOpen`, `searchOpen`, `leader`).

**Alternatives considered:**
- A dedicated `hotkeys.svelte.ts` store — adds indirection; the state it would read lives in +page.svelte anyway, so the coupling would have to go somewhere.
- Svelte `onkeydown` prop on `.mb-app` — misses keys when focus is in a portal/overlay.

**Why the current approach:** Keeps all routing logic in one place. The handler is short (≤ 80 lines) and readable. Adding a key means one `if` block, not wiring a new store subscriber.

### 2. Context as implicit Svelte state (no explicit enum)

Context is determined by reading multiple `$state` booleans rather than a single `context: 'list' | 'reader' | 'compose' | ...` enum. The handler guards are evaluated top-to-bottom:

1. `⌘K` / `Ctrl+K` — always first (works in any view)
2. `?` — list phase only, no modals
3. Early return if modals own keyboard (`phase !== 'list' || cmdOpen || composeOpen || helpOpen || aboutOpen`)
4. Reader block (when `openMessage` is set)
5. `isTyping` guard (skip alpha keys when a text input is focused)
6. Leader-key block
7. List navigation

**Alternatives considered:** Explicit context enum would make the guard expression `if (ctx !== 'reader') return` cleaner but requires keeping the enum in sync with all state combinations. The current implicit approach matches how Svelte state already models the UI.

### 3. Leader-key state machine with `setTimeout`

`startLeader(key)` sets `leader = key` and starts a 1200ms `setTimeout`. A visual indicator renders when `leader === 'g' && phase === 'list'`. The follow-up handler clears the leader immediately after matching. An unrecognized key also clears it.

This is a minimal state machine: two states (idle / waiting), one event (key press), one timeout. No library needed.

### 4. Per-component escape for overlays

Components that render as full-screen overlays (Compose, KeyboardHelp, About) and anchored popovers (HeadersPopover) register their own `keydown` listener with `capture: true`. This lets them intercept `Escape` before the global handler sees it, ensuring the overlay closes itself rather than triggering a phase transition.

`Palette.svelte` handles its own navigation keys (`↑/↓`, `Ctrl+N/P`, `j/k`, `1–9`, `Enter`) via `onkeydown` on the search input. The global handler never reaches these — the input's event is handled first.

### 5. `isTyping` guard placement

The `isTyping` check is placed *after* the reader block so that `Escape`, `j`, `k` work in the reader regardless of focus. This is intentional: the reader has no text inputs of its own, and those keys must always cycle messages.

## Risks / Trade-offs

- **Multiple listeners on the same event** — Compose, KeyboardHelp, About, and HeadersPopover each add their own `keydown` listener. If a new overlay forgets `capture: true`, its `Escape` will also trigger the global handler's phase transitions.
  → Mitigation: the global handler guards against all known overlay booleans; adding a new overlay requires adding a corresponding guard.

- **Leader timeout is not persisted across navigation** — if the user presses `g` then opens a modal before 1200ms, `clearLeader()` is not called and the leader silently expires. This is benign but could cause a 1.2s delay before the next `g` is usable.
  → Mitigation: call `clearLeader()` in all modal-open paths (already done for `cmdOpen`).

- **`⌘K` guard: requires account + folder** — the command palette is unreachable until an account and folder are selected. This means `⌘K` is dead during the account/folder picker phase.
  → Accepted: the palette's actions are all list-level actions; showing it before a list exists is confusing.

## Open Questions

- Should `⌘K` be available during the folder-picker phase to allow "switch account" without going through account picker?
- Should `r` / `R` trigger reply / reply-all once compose-from-message is built (§7 non-goals)?
- Should `?` work inside the reader (currently blocked by the early modal-guard return)?
