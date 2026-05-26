## 1. Scope store, dispatcher, Global keymap (no behavior change yet)

- [ ] 1.1 Create `src/lib/hotkeys/scope.svelte.ts` with `Scope` union (`list` | `reader` | `compose` | `palette` | `modal` | `hint`), a rune-backed `scopeStack: Scope[]`, and `pushScope(s)` / `popScope(s)` helpers (pop asserts top equals `s`, throws in dev, logs in release).
- [ ] 1.2 Create `src/lib/hotkeys/types.ts` with `Binding` and `Keymap` types (`keys`, `group`, `description`, `when?`, `handler`).
- [ ] 1.3 Create `src/lib/hotkeys/registry.svelte.ts` with `registerKeymap(km): () => void` returning a disposer; expose a derived `activeBindings` view (Global + bindings of `scopeStack[at(-1)]`).
- [ ] 1.4 Create `src/lib/hotkeys/dispatcher.ts` with `installDispatcher()`: one capture-phase `window` keydown listener that applies the typing guard, tries Global, then active-scope bindings, and short-circuits on exclusive scopes (`palette` | `modal` | `hint`). No fall-through to lower stack entries.
- [ ] 1.5 Implement leader-sequence support in the dispatcher (1.2 s timeout, pending-prefix state); expose the current pending prefix as reactive state for the existing leader indicator to read.
- [ ] 1.6 Create `src/lib/hotkeys/global.ts` declaring the Global keymap (`Ctrl+K`, `Ctrl+,`, `?`, `Escape` back-stack). Wire it into app boot via `+layout.svelte` so it registers once and the dispatcher is installed; leave the existing per-component listeners untouched at this step.
- [ ] 1.7 Unit-test (`vitest`) the scope store: push/pop happy path, pop-mismatch throws, base scope is `list`.
- [ ] 1.8 Unit-test the dispatcher: typing guard skips plain keys, modifier combos bypass guard, exclusive scope short-circuits, leader sequence fires on prefix+key within timeout and cancels on timeout/unknown follow-up.

## 2. Port the list scope

- [ ] 2.1 Create `src/lib/hotkeys/keymaps/list.ts` declaring the list keymap (`j`/`k`/`↓`/`↑`, `Enter`, `G`, `g g`, `g i|a|s|d|f|A`, `h`, `l`, `/`, `c`, `r`/`u`, `d`/`#`, `f` for hints) with `group` labels matching today's help groupings.
- [ ] 2.2 In `src/routes/[...path]/+page.svelte`, push `list` on mount of the list view and pop on unmount; call `registerKeymap(listKeymap)` with the same lifetime.
- [ ] 2.3 Delete the list branches from the page-level `onKey` handler in `+page.svelte` (the keys now owned by the list keymap), keeping only the parts that still belong to other scopes (temporarily).

## 3. Port the reader scope

- [ ] 3.1 Create `src/lib/hotkeys/keymaps/reader.ts` declaring reader bindings (`j`/`k`/`↓`/`↑`, `Enter`, `J`/`K`, `PageDown`/`PageUp`, `g g`, `G`, `f` for hints, `Escape`).
- [ ] 3.2 In the reader view, push `reader` on mount and pop on unmount; register the reader keymap with the same lifetime.
- [ ] 3.3 Delete the reader branch from `+page.svelte`'s `onKey` handler AND remove the standalone `window` keydown listener in `src/lib/components/Reader.svelte` (its `J`/`K`/`PageUp`/`PageDown` logic moves into the reader keymap handlers). This deletion must land in the same commit as steps 3.1-3.2 to avoid regressing the "J scrolls reader body, does not advance message" guarantee.

## 4. Port the compose scope

- [ ] 4.1 Create `src/lib/hotkeys/keymaps/compose.ts` declaring compose bindings (`Ctrl+Enter` send, `Ctrl+S` save draft, `Escape` discard-with-confirmation, `Tab` / `Shift+Tab` field focus).
- [ ] 4.2 In `src/lib/components/Compose.svelte`, push `compose` on mount and pop on unmount; register the compose keymap; remove the existing `window` keydown listener.

## 5. Port the palette and modal scopes

- [ ] 5.1 Create `src/lib/hotkeys/keymaps/palette.ts` declaring the shared palette bindings (`↑`/`↓`, `Ctrl+N`/`Ctrl+P`, `j`/`k` when search empty, `1`–`9` when search empty, `Enter`, `Escape`).
- [ ] 5.2 Push `palette` from the command palette, account picker, and folder picker on mount; pop on unmount; register the palette keymap once per open instance.
- [ ] 5.3 Create `src/lib/hotkeys/keymaps/modal.ts` declaring the minimal modal keymap (`Escape` to close, `?` reserved as Global to toggle help closed).
- [ ] 5.4 Push `modal` from `KeyboardHelp.svelte`, `About.svelte`, `HeadersPopover.svelte`, and the settings panel on mount; pop on unmount; register the modal keymap; remove the per-component `window`/`document` keydown listeners these components currently install.

## 6. Port the hint scope

- [ ] 6.1 Create `src/lib/hotkeys/keymaps/hint.ts` declaring the hint-mode keymap (label characters, `Backspace` to delete a label char, `Escape` to cancel).
- [ ] 6.2 In `src/lib/components/HintOverlay.svelte`, push `hint` on mount and pop on unmount; register the hint keymap; remove the standalone capture-phase `window` keydown listener once dispatch is going through the central dispatcher.
- [ ] 6.3 Verify `Escape` cancels hint mode only (does not also close the reader) by inspecting the stack: with stack `[list, reader, hint]`, `Escape` pops only `hint`.

## 7. Per-view keyboard help

- [ ] 7.1 Rewrite `src/lib/components/KeyboardHelp.svelte` to render exactly two sections: **Global** (from the Global keymap) and the active scope's section (read from the registry, bucketed by each binding's `group`). Remove the hard-coded `sections` array.
- [ ] 7.2 Ensure `?` is part of the Global keymap and works to open help in `list`, `reader`, and `compose` scopes (subject to the typing guard). Confirm `?` is suppressed in `palette`/`modal`/`hint` (exclusive scopes do not fall through to Global toggle on `?`; behavior is: Global runs first, so `?` still toggles help — verify against the spec scenario "Open help from list/reader/compose" only).
- [ ] 7.3 Verify `KeyboardHelp.svelte`'s own `?`/`Esc` listener is removed; toggling and closing are now driven by the Global keymap and the modal scope respectively.

## 8. Cleanup

- [ ] 8.1 Grep `src/` for `addEventListener('keydown'` and confirm only the dispatcher in `src/lib/hotkeys/dispatcher.ts` remains.
- [ ] 8.2 Remove now-dead helpers from `+page.svelte` (`isTyping`, ad-hoc leader timer state, etc.) that are superseded by the central dispatcher.
- [ ] 8.3 Update any inline code comments that reference the old "phase !== 'list'" pattern to instead reference the active scope.

## 9. E2E coverage for the new requirements

- [ ] 9.1 Add `e2e/specs/hotkeys-help-per-view.spec.ts` covering: opening `?` in list shows Global + List only; opening `?` in reader shows Global + Reader only and does not include list-only bindings (`/`, `c`, `g i`); opening `?` in compose shows Global + Compose only; `?` is suppressed inside text inputs.
- [ ] 9.2 Add `e2e/specs/hotkeys-isolation.spec.ts` covering: pressing `/` in the reader does not open the search bar; pressing `J` on the list does not scroll the (absent) reader body and does not move selection; pressing `Ctrl+S` on the list does nothing; pressing `j` inside the compose body types the character; pressing `j` while the settings modal is open does nothing.
- [ ] 9.3 Add `e2e/specs/hotkeys-hint-scope.spec.ts` covering: in the reader, pressing `f` activates hint mode; while hint mode is active, `j` does not advance to the next message; `Escape` cancels hint mode only and the reader stays open.
- [ ] 9.4 Update any existing Playwright spec that asserts the "All hotkeys" union view in keyboard help to assert the per-view sections instead.

## 10. Validation and warning cycle

- [ ] 10.1 Run `deno task test:e2e` headless; iterate on failures until green. Capture any new flake patterns in the relevant spec's retry settings (do not blanket-retry).
- [ ] 10.2 Run `deno task build` and confirm zero TypeScript / Svelte compiler warnings.
- [ ] 10.3 Run `cargo check --workspace` (no Rust changes expected, but verify nothing in `src-tauri` regressed) and confirm zero new warnings.
- [ ] 10.4 Run `openspec validate isolate-hotkeys` one final time and confirm it reports the change as valid.
