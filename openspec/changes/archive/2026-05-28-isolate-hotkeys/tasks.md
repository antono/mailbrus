## 1. Scope store, dispatcher, Global keymap (no behavior change yet)

- [x] 1.1 Create `src/lib/hotkeys/scope.svelte.ts` with `Scope` union (`list` | `reader` | `compose` | `palette` | `modal` | `hint`), a rune-backed `scopeStack: Scope[]`, and `pushScope(s)` / `popScope(s)` helpers (pop asserts top equals `s`, throws in dev, logs in release).
- [x] 1.2 Create `src/lib/hotkeys/types.ts` with `Binding` and `Keymap` types (`keys`, `group`, `description`, `when?`, `handler`).
- [x] 1.3 Create `src/lib/hotkeys/registry.svelte.ts` with `registerKeymap(km): () => void` returning a disposer; expose a derived `activeBindings` view (Global + bindings of `scopeStack[at(-1)]`).
- [x] 1.4 Create `src/lib/hotkeys/dispatcher.ts` with `installDispatcher()`: one capture-phase `window` keydown listener that applies the typing guard, tries Global, then active-scope bindings, and short-circuits on exclusive scopes (`palette` | `modal` | `hint`). No fall-through to lower stack entries. (File named `dispatcher.svelte.ts` because the leader-prefix state uses `$state`.)
- [x] 1.5 Implement leader-sequence support in the dispatcher (1.2 s timeout, pending-prefix state); expose the current pending prefix as reactive state for the existing leader indicator to read.
- [x] 1.6 Create `src/lib/hotkeys/global.ts` declaring the Global keymap (`Ctrl+K`, `Ctrl+,`, `?`, `Escape` back-stack). Wire it into app boot via `+layout.svelte` so it registers once and the dispatcher is installed; leave the existing per-component listeners untouched at this step. (Escape lives in each per-scope keymap rather than Global — see [design notes](design.md). Page-level overlay state migrated to `$lib/ui-state.svelte.ts` so Global handlers can drive it.)
- [x] 1.7 Unit-test (`vitest`) the scope store: push/pop happy path, pop-mismatch throws, base scope is `list`. (Implemented with `Deno.test` to match the project's existing `url.test.ts` convention; vitest is not configured here. Pure scope logic extracted to `scope-core.ts`.)
- [x] 1.8 Unit-test the dispatcher: typing guard skips plain keys, modifier combos bypass guard, exclusive scope short-circuits, leader sequence fires on prefix+key within timeout and cancels on timeout/unknown follow-up. (Pure dispatcher logic extracted to `dispatcher-core.ts` and tested with `Deno.test`; `_resetForTests` helpers added to runtime modules.)

## 2. Port the list scope

- [x] 2.1 Create `src/lib/hotkeys/keymaps/list.ts` declaring the list keymap (`j`/`k`/`↓`/`↑`, `Enter`, `G`, `g g`, `g i|a|s|d|f|A`, `h`, `l`, `/`, `c`, `r`/`u`, `d`/`#`, `f` for hints) with `group` labels matching today's help groupings.
- [x] 2.2 In `src/routes/[...path]/+page.svelte`, push `list` on mount of the list view and pop on unmount; call `registerKeymap(listKeymap)` with the same lifetime. (`list` is the base scope — never popped. The list keymap is gated by a `$effect` that registers it only while the list surface is genuinely active and unregisters it whenever the reader / a modal / compose / hint mode is in focus.)
- [x] 2.3 Delete the list branches from the page-level `onKey` handler in `+page.svelte` (the keys now owned by the list keymap), keeping only the parts that still belong to other scopes (temporarily).

## 3. Port the reader scope

- [x] 3.1 Create `src/lib/hotkeys/keymaps/reader.ts` declaring reader bindings (`j`/`k`/`↓`/`↑`, `Enter`, `J`/`K`, `PageDown`/`PageUp`, `g g`, `G`, `f` for hints, `Escape`).
- [x] 3.2 In the reader view, push `reader` on mount and pop on unmount; register the reader keymap with the same lifetime.
- [x] 3.3 Delete the reader branch from `+page.svelte`'s `onKey` handler AND remove the standalone `window` keydown listener in `src/lib/components/Reader.svelte` (its `J`/`K`/`PageUp`/`PageDown` logic moves into the reader keymap handlers). This deletion must land in the same commit as steps 3.1-3.2 to avoid regressing the "J scrolls reader body, does not advance message" guarantee.

## 4. Port the compose scope

- [x] 4.1 Create `src/lib/hotkeys/keymaps/compose.ts` declaring compose bindings (`Ctrl+Enter` send, `Ctrl+S` save draft, `Escape` discard-with-confirmation, `Tab` / `Shift+Tab` field focus). (Tab/Shift+Tab omitted from the keymap — they are native browser focus traversal and the existing code never overrode them; introducing keymap entries would only register no-op help rows.)
- [x] 4.2 In `src/lib/components/Compose.svelte`, push `compose` on mount and pop on unmount; register the compose keymap; remove the existing `window` keydown listener.

## 5. Port the palette and modal scopes

- [x] 5.1 Create `src/lib/hotkeys/keymaps/palette.ts` declaring the shared palette bindings (`↑`/`↓`, `Ctrl+N`/`Ctrl+P`, `j`/`k` when search empty, `1`–`9` when search empty, `Enter`, `Escape`). (Bindings opt into `bypassTypingGuard` so they still fire while the palette search input is focused — a new flag added to `Binding` for this case.)
- [x] 5.2 Push `palette` from the command palette, account picker, and folder picker on mount; pop on unmount; register the palette keymap once per open instance. (Done in `Palette.svelte` once — `CommandPalette`, `AccountPicker`, and `FolderPicker` all render through it, so a single place owns the scope.)
- [x] 5.3 Create `src/lib/hotkeys/keymaps/modal.ts` declaring the minimal modal keymap (`Escape` to close, `?` reserved as Global to toggle help closed).
- [x] 5.4 Push `modal` from `KeyboardHelp.svelte`, `About.svelte`, `HeadersPopover.svelte`, and the settings panel on mount; pop on unmount; register the modal keymap; remove the per-component `window`/`document` keydown listeners these components currently install.

## 6. Port the hint scope

- [x] 6.1 Create `src/lib/hotkeys/keymaps/hint.ts` declaring the hint-mode keymap (label characters, `Backspace` to delete a label char, `Escape` to cancel). (Added a new `fallback?: boolean` flag to `Binding` so the keymap can cancel on any unrecognised keypress per the existing `vimium-link-hints` spec. `Backspace` cancels for now — there is no incremental-label entry to "delete a character of".)
- [x] 6.2 In `src/lib/components/HintOverlay.svelte`, push `hint` on mount and pop on unmount; register the hint keymap; remove the standalone capture-phase `window` keydown listener once dispatch is going through the central dispatcher.
- [x] 6.3 Verify `Escape` cancels hint mode only (does not also close the reader) by inspecting the stack: with stack `[list, reader, hint]`, `Escape` pops only `hint`. (Guaranteed by construction: the hint keymap's `Escape` binding calls `onCancel` which flips the `hintMode` rune on the page; the `HintOverlay` then unmounts and only the `hint` scope pops. The reader's own `Escape` binding cannot fire because the active scope is `hint`, not `reader`.)

## 7. Per-view keyboard help

- [x] 7.1 Rewrite `src/lib/components/KeyboardHelp.svelte` to render exactly two sections: **Global** (from the Global keymap) and the active scope's section (read from the registry, bucketed by each binding's `group`). Remove the hard-coded `sections` array. (Renders the **host** scope — i.e. the scope underneath the `modal` scope that the help itself pushes — so the user sees the bindings of the view they were just in. Rows merge alternative key specs that share a description (e.g. `j` + `ArrowDown`).)
- [x] 7.2 Ensure `?` is part of the Global keymap and works to open help in `list`, `reader`, and `compose` scopes (subject to the typing guard). Confirm `?` is suppressed in `palette`/`modal`/`hint` (exclusive scopes do not fall through to Global toggle on `?`; behavior is: Global runs first, so `?` still toggles help — verify against the spec scenario "Open help from list/reader/compose" only).
- [x] 7.3 Verify `KeyboardHelp.svelte`'s own `?`/`Esc` listener is removed; toggling and closing are now driven by the Global keymap and the modal scope respectively.

## 8. Cleanup

- [x] 8.1 Grep `src/` for `addEventListener('keydown'` and confirm only the dispatcher in `src/lib/hotkeys/dispatcher.svelte.ts` remains.
- [x] 8.2 Remove now-dead helpers from `+page.svelte` (`isTyping`, ad-hoc leader timer state, etc.) that are superseded by the central dispatcher. (Deleted: the legacy `$effect` that owned the `window` keydown listener, the local `leader` / `leaderTimer` state, and the `startLeader` / `clearLeader` helpers. The leader-indicator template now reads `leaderKey()` from the dispatcher via a `$derived` named `leader`.)
- [x] 8.3 Update any inline code comments that reference the old "phase !== 'list'" pattern to instead reference the active scope. (No surviving comments use that pattern — the single remaining `phase !== 'list'` reference at `+page.svelte:246` is unrelated URL-routing state.)

## 9. E2E coverage for the new requirements

- [x] 9.1 Add `e2e/specs/hotkeys-help-per-view.spec.ts` covering: opening `?` in list shows Global + List only; opening `?` in reader shows Global + Reader only and does not include list-only bindings (`/`, `c`, `g i`); opening `?` in compose shows Global + Compose only; `?` is suppressed inside text inputs.
- [x] 9.2 Add `e2e/specs/hotkeys-isolation.spec.ts` covering: pressing `/` in the reader does not open the search bar; pressing `J` on the list does not scroll the (absent) reader body and does not move selection; pressing `Ctrl+S` on the list does nothing; pressing `j` inside the compose body types the character; pressing `j` while the settings modal is open does nothing.
- [x] 9.3 Add `e2e/specs/hotkeys-hint-scope.spec.ts` covering: in the reader, pressing `f` activates hint mode; while hint mode is active, `j` does not advance to the next message; `Escape` cancels hint mode only and the reader stays open.
- [x] 9.4 Update any existing Playwright spec that asserts the "All hotkeys" union view in keyboard help to assert the per-view sections instead. (No existing spec referenced the old union view — no-op confirmed by grep across `e2e/`.)

## 10. Validation and warning cycle

- [x] 10.1 Run `deno task test:e2e` headless; iterate on failures until green. Capture any new flake patterns in the relevant spec's retry settings (do not blanket-retry). (Full chromium suite: 115 passed, 1 pre-existing `test.fixme` skipped — no regressions. One initial failure in the new "j typed in compose body" spec was a real race with the To-input's auto-focus; fixed in-spec by `click()`+`expect(toBeFocused())` before typing.)
- [x] 10.2 Run `deno task build` and confirm zero TypeScript / Svelte compiler warnings.
- [x] 10.3 Run `cargo check --workspace` (no Rust changes expected, but verify nothing in `src-tauri` regressed) and confirm zero new warnings.
- [x] 10.4 Run `openspec validate isolate-hotkeys` one final time and confirm it reports the change as valid.
