## Context

Today hotkey handling is split across at least five sibling listeners (`src/routes/[...path]/+page.svelte`,
`Reader.svelte`, `Compose.svelte`, `HintOverlay.svelte`, `HeadersPopover.svelte`, plus `KeyboardHelp.svelte`'s
own `?`/`Esc` listener). The page-level handler in `+page.svelte` is ~170 lines and disambiguates
list-vs-reader-vs-modal at runtime with `if (phase !== 'list' || cmdOpen || composeOpen || helpOpen) return;`
branches. `Reader.svelte` *also* attaches its own `window` listener for `J`/`K`/`PageUp`/`PageDown` that runs
in parallel and uses `stopImmediatePropagation` to win — which means the rules for which key wins where are
spread across files and only knowable by tracing each listener.

`KeyboardHelp.svelte` hard-codes a single 7-section list and is only opened from the list phase
(`+page.svelte:503`). Reader and Compose users can't reach help via `?`.

Stakeholders: this is frontend-only. No `mailbrus-server` or `mailbrus-core` changes. All work lives under
`src/` and `e2e/`.

## Goals / Non-Goals

**Goals:**

- One source of truth for "which view is active" (an *active scope*), with one top-level dispatcher.
- Each view's keymap declared next to that view, registered when the view mounts, unregistered when it
  unmounts. No leakage across scopes.
- `KeyboardHelp.svelte` renders Global keys + the active scope's keys, generated from the same keymap
  declarations the dispatcher uses (help and behavior cannot drift).
- `?` opens help from any non-typing context in any scope.
- Existing keys, bindings, leader behavior, escape back-stack, and hint-mode capture all keep working.

**Non-Goals:**

- No rebinding, no user-configurable keymaps, no new shortcuts.
- No accessibility/focus-trap rework beyond what scope isolation already implies.
- No third-party hotkey library.
- No change to the `vimium-link-hints` capability beyond making its scope push/pop explicit.

## Decisions

### 1. Scope model: a small stack of named scopes

```ts
type Scope = 'list' | 'reader' | 'compose' | 'palette' | 'modal' | 'hint';
// Pickers (account, folder, command) share 'palette'.
// Settings panel, About, KeyboardHelp itself share 'modal'.
// Hint mode is its own scope so it can be exclusive without entangling reader/list logic.
```

A single Svelte 5 rune-backed store (`src/lib/hotkeys/scope.svelte.ts`) holds a stack:

```ts
export const scopeStack = $state<Scope[]>(['list']);
export function pushScope(s: Scope) { scopeStack.push(s); }
export function popScope(s: Scope)  { /* assert top === s, then pop */ }
```

The top of the stack is the active scope. Each view pushes on mount and pops on unmount via `$effect`
cleanup. Stack (not just a single value) is needed because hint mode and modals layer over an underlying
view; popping returns to the previous scope without the view having to remember it.

**Alternative considered**: a single `activeScope` string set by each view. Rejected — every view that opens
a modal would need to save/restore the previous value, and any missed restore silently breaks isolation.

### 2. Keymap declarations: data, not closures-on-window

Each view exports a `Keymap`:

```ts
type Binding = {
  keys: string[];        // e.g. ['j'] or ['g', 'g'] (leader sequence) or ['Ctrl+K']
  group: string;         // help section label, e.g. 'Navigation'
  description: string;   // help row text
  when?: () => boolean;  // optional extra guard (e.g. !leader, currentPage > 1)
  handler: (e: KeyboardEvent) => void;
};
type Keymap = { scope: Scope; bindings: Binding[] };
```

Views call `registerKeymap(keymap)` on mount and the returned disposer on unmount. The Global keymap is
registered once at app boot (`Ctrl+K`, `Ctrl+,`, `?`, the Escape back-stack).

**Alternative considered**: keep ad-hoc `if (e.key === …)` blocks per component. Rejected — help has to be
generated from these declarations to satisfy the per-view help requirement, so they must be data anyway.

### 3. Dispatcher: one top-level listener

A single `window` keydown listener (capture phase) lives in a root layout effect. On each event it:

1. If focus is in `input`/`textarea`/`contenteditable`, only Global bindings whose `keys` include a modifier
   may fire. Plain keys like `j`/`?` are skipped (preserves current `isTyping` behavior).
2. Try Global bindings.
3. Try the active scope's bindings (top of stack).
4. If the top scope is **exclusive** (`palette`, `modal`, `hint`), stop here. Otherwise stop too — there is
   no fallback through the stack. This is what enforces isolation.

`stopImmediatePropagation` is used inside the dispatcher only when a binding matches, so legacy
component-level listeners (during migration) won't double-fire. Once all listeners are migrated, this is
defensive only.

**Alternative considered**: dispatch via DOM bubbling and per-component listeners with a scope guard.
Rejected — exclusive scopes (modal) need to consistently swallow everything that isn't theirs, which is hard
to guarantee when listeners are scattered.

### 4. Leader keys stay; modeled as binding sequences

`['g', 'g']` and `['g', 'i']` are sequences. The dispatcher owns the 1.2 s timeout and a small "pending
prefix" state. The visual leader indicator listens to this state (no behavior change for the user).

### 5. `KeyboardHelp.svelte` reads from the registry

The component subscribes to `scopeStack` and the registered keymaps, then renders exactly two `<section>`s:
**Global** and the active scope's `group`-bucketed bindings. The hard-coded `sections` array goes away. The
component opens via the Global `?` binding, which pushes the `modal` scope; it pops on close.

### 6. Migration order (intra-PR, but staged commits)

1. Land scope store + dispatcher + Global keymap (no UI behavior change yet; old listeners stay).
2. Port list scope; remove the list branches of `+page.svelte`'s keydown.
3. Port reader scope; remove `+page.svelte`'s reader branch *and* `Reader.svelte`'s standalone listener.
4. Port compose, palette, modal, hint scopes.
5. Rewrite `KeyboardHelp.svelte` to render from registry; remove the hard-coded sections.
6. Update Playwright specs that depend on help content; add isolation specs.

### 7. Test strategy

- **E2E** (Playwright, per existing harness): for each scope, open `?`, assert only `Global` + scope
  section render; assert at least one scope-specific binding and at least one Global binding present.
- **E2E isolation**: in compose, press `j` inside the body field — assert character typed, no selection
  change. In modal (settings), press `j` — assert no selection change.
- **E2E layering**: in reader, press `f` → assert hint scope active and `j` does not advance message.
- **Unit** (`vitest`, where the scope store/dispatcher can be exercised without DOM mounting): stack
  push/pop assertions, exclusive-scope short-circuit, leader-sequence timeout.

## Risks / Trade-offs

- [Refactor touches every keyboard-facing UI path] → Stage commits per scope (Decision 6) so each commit
  is independently testable; keep the full Playwright suite green at every step.
- [A view that forgets to pop its scope on unmount silently breaks isolation forever] → `registerKeymap`
  returns a disposer wired into `$effect` cleanup; `popScope(s)` asserts `top === s` and throws in dev so
  the bug surfaces immediately. Add a unit test for pop-mismatch.
- [Reader's `stopImmediatePropagation` trick exists because the page listener also ran — removing one
  before the other could reintroduce the very leak it was masking] → Migrate reader scope in the same
  commit that removes the page-level reader branch (Decision 6, step 3). Add a regression Playwright spec
  for "J scrolls reader body, does not advance message".
- [Help is now generated at runtime — if a scope hasn't mounted, its keys can't appear in its own help] →
  Acceptable by design (help is per active scope), and a scope's keymap is always registered before that
  scope can become active.
- [Some Mac-style modifiers (`⌘`) are still rendered in the current help] → Out of scope for this change;
  the proposal already excludes display normalization. Existing handlers already accept both `metaKey` and
  `ctrlKey` for the few global combos.

## Migration Plan

Rollout is a single PR with the staged commits from Decision 6. No data migration, no server changes, no
flag gating — the change is local UI behavior. Rollback = revert the PR; there is no persisted state.

## Resolved Questions

- `?` is suppressed while focus is in a text input (`isTyping` guard applies to it like `j`/`k`).
  Help opens only when focus is outside inputs.
- Command palette and account/folder pickers share the single `palette` scope (identical key surface today).
  Revisit if a future binding diverges.
