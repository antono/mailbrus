## 1. Quick fixes (no new components)

- [x] 1.1 `About.svelte` — add `<style>` block with `.mb-about-logo { display: flex; justify-content: center; margin-bottom: 0.75rem; }` and `.mb-about-logo-img { width: 64px; height: 64px; object-fit: contain; }`
- [x] 1.2 `Reader.svelte` — add CSS transitions to `.mb-reader-head .meta`: `max-height: 120px; opacity: 1; overflow: hidden; transition: max-height 200ms ease, opacity 180ms ease;` and under `.is-compact .meta`: `max-height: 0; opacity: 0;`
- [x] 1.3 `+page.svelte` — in the `fetchMessage` `.then` callback: after setting `messageHasPlain`, add `if (data.has_plain && !senderOverride && !globalMode) messageMode = 'text';` (re-fetch with text mode)

## 2. Pagination "X / Y" with animation

- [x] 2.1 `Pagination.svelte` — change indicator from `{start}–{end} of {count}` to `{page} / {lastPage}` using a `{#key page}` block around the counter span
- [x] 2.2 `Pagination.svelte` — add `@keyframes pg-flash` CSS animation (background-color pulse using `color-mix(in srgb, currentColor 18%, transparent)`) applied to `.pg-counter` via `animation: pg-flash 400ms ease forwards`
- [x] 2.3 `MailList.svelte` — update breadcrumb indicator from `page {page}: {start}–{end} of {count}` to `{page} / {lastPage}` using the same `{#key page}` + `.pg-counter` pattern and `pg-flash` keyframe

## 3. HintOverlay component

- [x] 3.1 Create `src/lib/components/HintOverlay.svelte` with props `targets: HintTarget[]` and `onCancel: () => void`; export `type HintTarget = { el: HTMLElement; label: string; onActivate: () => void }` from `$lib/hints.ts`
- [x] 3.2 `HintOverlay.svelte` — on mount, read `getBoundingClientRect()` for each target and render `<span class="mb-hint-badge">` at `position: fixed; left: Xpx; top: Ypx` with the label text
- [x] 3.3 `HintOverlay.svelte` — add `window` keydown handler: case-insensitive letter match → call `onActivate()` then `onCancel()`; `Escape` or unrecognised → call `onCancel()` only; `e.preventDefault()` and `e.stopImmediatePropagation()` on all keys while overlay is active
- [x] 3.4 `HintOverlay.svelte` — add badge CSS: ~14 px height, ~18 px width, monospace font, `z-index: 9999`; light mode: `background: #fbbf24; color: #111`; dark mode via `:global(.dark)`: `background: #1c1917; color: #fbbf24; border: 1px solid #fbbf24`
- [x] 3.5 `HintOverlay.svelte` — add `onMount`/`onDestroy` (or `$effect`) to ensure the keydown listener is removed when the component unmounts

## 4. f-key integration — list mode

- [x] 4.1 `+page.svelte` — add `hintMode = $state(false)` and `hintTargets = $state<HintTarget[]>([])` reactive state
- [x] 4.2 `+page.svelte` — in the global `onKeyDown` handler: when phase is list, `e.key === 'f'`, no modal open, focus not in input, `hintMode` is false → compute targets from `listEl.querySelectorAll('[data-testid="mail-list.message-row"]')`, assign labels a–z (max 26), set `hintTargets` with `onActivate: () => onOpen(filteredMessages[i])`, set `hintMode = true`; `e.preventDefault()`
- [x] 4.3 `+page.svelte` — suppress all other list-phase hotkeys when `hintMode === true` (add early-return guard before existing key handlers)
- [x] 4.4 `+page.svelte` — render `{#if hintMode}<HintOverlay targets={hintTargets} onCancel={() => hintMode = false} />{/if}` at the root level

## 5. f-key integration — reader mode

- [x] 5.1 `+page.svelte` — expose a `readerBodyEl` binding from `Reader.svelte`: add a `bind:bodyEl` prop to Reader and `bind:this` on `.mb-reader-body`
- [x] 5.2 `+page.svelte` — in the global `onKeyDown` handler: when phase is reader, `e.key === 'f'`, mode is not html, no modal open → query `readerBodyEl.querySelectorAll('.mb-link')` for link targets and `querySelectorAll('[data-testid="attachment-chip"]')` for attachment targets; merge into one label sequence; `onActivate` for links calls `window.open(el.href, '_blank', 'noopener noreferrer')`; for attachments clicks the chip's button; set `hintMode = true`
- [x] 5.3 `+page.svelte` — ensure reader-mode `Escape` in hint mode is consumed by the overlay (not by the reader close handler): guard reader-close Escape with `if (hintMode) return;`
- [x] 5.4 `Attachments.svelte` — add `data-testid="attachment-chip"` to each attachment item element if not already present

## 6. Keyboard help update

- [x] 6.1 `KeyboardHelp.svelte` — add `f` entry in the list-mode section: "f — open message by hint"
- [x] 6.2 `KeyboardHelp.svelte` — add `f` entry in the reader-mode section: "f — follow link / attachment by hint"

## 7. E2E tests

- [x] 7.1 Add E2E scenario: open folder with ≥3 messages → press `f` → verify hint badges appear (`data-testid="hint-badge"` or similar) → press first badge letter → verify reader opens for that message
- [x] 7.2 Add E2E scenario: open reader in text mode → press `f` → verify link badges appear → press `Escape` → verify reader is still open and badges gone
- [x] 7.3 Add E2E scenario: navigate to page 2 → verify breadcrumb shows "2 / N" format → verify flash animation class is present briefly after page change
- [x] 7.4 Add E2E scenario: open About dialog → verify logo `<img>` has naturalWidth > 0 and rendered width = 64
- [x] 7.5 Add E2E scenario: open a message with plain text part and no mode preference → verify mode toggle shows "Aa" (text) as active
- [x] 7.6 Add E2E scenario: scroll reader body past threshold → verify `.mb-reader-head` has `.is-compact` class → verify `.meta` is not immediately visible (opacity/height transition occurred)
- [x] 7.7 Run full E2E suite (`deno task test:e2e`) and fix any regressions

## 8. Cleanup

- [x] 8.1 Run `deno task build` and resolve all TypeScript compilation errors
- [x] 8.2 Fix any Svelte `svelte-check` warnings introduced by new components or prop changes
- [x] 8.3 Review `HintOverlay.svelte` for a11y warnings and add `role="dialog"` + `aria-label="Hint mode — press a letter or Escape to cancel"` to the overlay container
