## Why

The current `ui-hotkeys` capability mixes list, reader, compose, and palette shortcuts in a single
dispatch path, and the `KeyboardHelp` overlay shows the union of every shortcut regardless of which
view the user is in. That makes it easy for handlers to leak across views (e.g. a list key firing while
the reader is open) and forces the user to read sections that don't apply right now to find the keys
that do. Splitting hotkeys and help by view sharpens the boundary and shortens the help screen the
user actually sees.

## What Changes

- Define a single source of truth for which view (a.k.a. *scope*: `list`, `reader`, `compose`,
  `palette`) is active, and route every non-global key through that scope.
- Move each view's keymap into a dedicated module/handler that only registers while that view is
  active; global keys (`Ctrl+K`, `?`, `Escape` back-stack) stay in a small global handler.
- A key bound to one scope SHALL NOT fire in another scope, even if no handler claims it (no
  cross-view fallbacks).
- **BREAKING (UX-only)**: `?` opens help in every view, not just the list. The help overlay shows
  exactly two sections: **Global** (always-on keys) and the current view's scoped keys. The
  catch-all "All hotkeys" view is removed.
- Help content is generated from the same per-scope keymap definitions used by the handlers, so help
  and behavior cannot drift.
- Palette/modal scopes continue to fully capture input as today; entering hint mode pushes a
  transient scope that suppresses the underlying view's keys (already specified, made explicit).

## Capabilities

### New Capabilities

_(none — this restructures existing behavior.)_

### Modified Capabilities

- `ui-hotkeys`: introduce an explicit **active scope** concept; require per-scope isolation of
  non-global keys; replace the single keyboard-help requirement with a per-view help requirement
  (Global + active scope only); require help content to be derived from the same keymap source as
  the handlers.

## Non-goals

- No new shortcuts, no rebinding, no user-configurable keymaps.
- No changes to the `vimium-link-hints` capability beyond keeping its existing scope-suppression
  behavior; hint mode stays as specified.
- No refactor of unrelated UI state machines (palette stack, escape back-navigation behavior is
  preserved as-is).
- No accessibility/focus-trap rework beyond what isolation already implies.

## Impact

- **Specs**: delta to `openspec/specs/ui-hotkeys/spec.md` (scope model + per-view help requirement,
  replacing the single "Keyboard help toggle" and "Keyboard help documents f hint mode"
  requirements).
- **Code**: `src/lib/components/KeyboardHelp.svelte` becomes scope-aware (accepts the active scope,
  renders Global + that scope). The keydown handlers currently spread across the route page and
  reader/compose components consolidate around a small scope-router; per-view keymaps live next to
  their views. No backend (`mailbrus-server`, `mailbrus-core`) changes.
- **Tests**: Playwright specs that assert help content (`e2e/specs/…`) will need updates to open
  help from each view and check that only Global + scoped sections render. Hotkey-isolation specs
  added per view.
- **Docs**: none beyond the spec delta.
