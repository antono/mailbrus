## Context

Mailbrus is a SvelteKit SPA inside a Tauri shell. All UI state lives in components or the root `+page.svelte`; there is no external state store. Keyboard handling is done via `window.addEventListener('keydown', ...)` inside `$effect` blocks — each component registers its own listeners.

Current state of the affected areas:

- **Pagination**: `MailList.svelte` renders `page {page}: {start}–{end} of {count}` in the breadcrumb bar. No animation exists on page change.
- **Reader header**: `is-compact` CSS class is toggled instantly; no transition.
- **Default mode**: The server returns the mode it renders. When no user preference is set, `fetchMessage` is called without a mode argument and the server defaults to `simple` even if a `text/plain` part exists.
- **About logo**: The `<img>` tag and SVG asset (`$lib/assets/mailbrus.svg`) are present in `About.svelte`, but there is no `<style>` block; the image renders at its natural (large) SVG size with no layout constraints.
- **Vimium hints**: No hint overlay exists. `HintBar.svelte` is a bottom status bar for keyboard shortcut legends, not a Vimium-style interactive overlay.

## Goals / Non-Goals

**Goals:**
- Pagination counter shows `{page} / {lastPage}` and the page number flashes on change.
- Reader header collapse/expand is animated (opacity + height).
- First-open mode prefers `text` when the message has a `text/plain` part.
- About dialog logo renders at a fixed size with correct spacing.
- `f` activates a hint overlay in list mode (open message) and reader mode (follow link / trigger attachment).

**Non-Goals:**
- Full Vimium feature set (scroll hints, visual mode, custom key maps).
- Multi-character hint sequences (single a–z letter only; ≤26 items per context).
- Hint overlay in search, compose, or settings screens.
- Any Rust/server changes.

## Decisions

### 1. HintOverlay as a standalone Svelte component

**Decision:** Create `src/lib/components/HintOverlay.svelte`.

**API:**
```ts
let {
  targets,   // { el: HTMLElement; label: string; onActivate: () => void }[]
  onCancel,  // () => void
}: { targets: HintTarget[]; onCancel: () => void } = $props();
```

The overlay renders a fixed-position full-screen transparent backdrop. For each target it reads `getBoundingClientRect()` and places a `<span>` badge at the element's top-left corner using `position: fixed; left: Xpx; top: Ypx`. On keydown it matches the pressed letter (case-insensitive) against the label list and calls `onActivate`; `Escape` calls `onCancel`. The overlay unmounts after activation or cancel.

**Alternatives considered:**
- *Portal / teleport to `<body>`*: Svelte 5 has no built-in portal; a fixed overlay achieves the same stacking without one.
- *Overlay inside MailList/Reader*: coupling the overlay DOM to the scroll container causes badge positions to shift on scroll; fixed positioning avoids this.

### 2. Label assignment

**Decision:** Assign letters `a`–`z` in order of DOM appearance. Cap at 26 visible targets (links beyond index 25 are skipped silently). Label assignment is a pure function: `labels = targets.map((_, i) => String.fromCharCode(97 + i))`.

**Rationale:** Most messages have fewer than 26 links. Keeping it single-character avoids the two-key-sequence UX complexity that single-screen hint counts don't warrant.

### 3. f-key integration in list vs reader mode

**Decision:** `f` hint mode is wired in `+page.svelte`'s global `onKeyDown` handler rather than inside `MailList` or `Reader` individually.

`+page.svelte` already owns the modal/view state (`openMessage`, etc.) and the global keydown handler (lines 477–594). Detecting `f` there and computing the right target set based on current view (`openMessage ? readerHints() : listHints()`) keeps both components dumb — they expose `ref` bindings (already present for `listEl` in `MailList`) so the page can query DOM nodes.

**Reader link targets:** `querySelectorAll('.mb-link')` inside the reader body element (already has `data-testid="reader-body-scroll"`). Each badge's `onActivate` calls `window.open(anchorEl.href, '_blank', 'noopener')`.

**Attachment targets:** `querySelectorAll('[data-testid="attachment-chip"]')` — the activate callback clicks the chip's primary action button.

**List targets:** `querySelectorAll('[data-testid="mail-list.message-row"]')` — activate calls the existing `onOpen(messages[i])` callback routed through the page's handler.

### 4. Pagination counter format and animation

**Decision:** Change breadcrumb text from `page {page}: {start}–{end} of {count}` to `{page} / {lastPage}` and add a CSS `@keyframes` highlight pulse on the counter `<span>` triggered by a Svelte key block that re-mounts the span on page change.

```svelte
{#key page}
  <span class="count pg-counter">{page} / {lastPage}</span>
{/key}
```

The CSS uses `@keyframes pg-flash` — brief background-color highlight fading to transparent — applied to `.pg-counter` with `animation-fill-mode: backwards`. Works for both light and dark themes by using `color-mix(in srgb, currentColor 18%, transparent)` so no explicit dark override is needed.

**Alternative considered:** JS `setTimeout` to add/remove a class — more code, same result.

### 5. Reader header collapse animation

**Decision:** Add a CSS transition to `.meta` inside `.mb-reader-head`. When `.is-compact` is applied the `.meta` block is hidden. Replace the current abrupt hide with:

```css
.mb-reader-head .meta {
  overflow: hidden;
  max-height: 120px;
  opacity: 1;
  transition: max-height 200ms ease, opacity 180ms ease;
}
.mb-reader-head.is-compact .meta {
  max-height: 0;
  opacity: 0;
}
```

`max-height` transition is used because `height: auto` is not animatable. The value `120px` is a safe upper bound for the 3-line meta block; it never causes layout issues since the real height is always smaller.

**Trade-off:** `max-height` transitions can feel slightly non-linear if the actual height is much less than the max. At 200 ms the difference is imperceptible.

### 6. Plain-text-first default mode

**Decision:** After `fetchMessage` resolves, if no user preference was set (`senderOverride === null && globalMode === undefined`) and `data.has_plain` is true, set `messageMode = 'text'` regardless of what the server returned.

This is a one-line addition in the `then` callback at `+page.svelte:362`. The server still renders `simple` or `html` on the wire; the client overrides the displayed mode and re-fetches with `mode=text` automatically via `handleModeChange`.

**Alternative considered:** Pass `mode=text` in `fetchMessage` when no preference exists and `has_plain` is unknown — but `has_plain` isn't known before the first fetch, so a two-round-trip approach would be needed. Overriding after the fact is a single round-trip.

### 7. About logo CSS

**Decision:** Add a `<style>` block to `About.svelte` with explicit sizing for `.mb-about-logo-img`:

```css
.mb-about-logo {
  display: flex;
  justify-content: center;
  margin-bottom: 0.75rem;
}
.mb-about-logo-img {
  width: 64px;
  height: 64px;
  object-fit: contain;
}
```

The SVG asset and import already exist; only the CSS is missing.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Hint badges placed behind scroll container | Use `position: fixed` with coordinates from `getBoundingClientRect()` |
| Reader link badges shift if body scrolls while overlay is open | Re-compute badge positions on `scroll` inside the reader scroll element, or close hint mode on scroll (simpler) |
| `max-height` animation feels laggy if meta block grows taller than assumed | Cap at `150px` and test; if ever needed, switch to a JS `height` measurement + CSS variable |
| Plain-text re-fetch adds a second network request on first open | Acceptable — plain-text bodies are smaller; the alternative (guessing mode before fetch) requires server changes |
| `querySelectorAll('.mb-link')` hits links inside iframe | Reader body `data-testid="reader-body-scroll"` is the container for plain/simple mode; iframe is only in HTML mode where link hints are not scoped into the frame |

## Migration Plan

All changes are purely additive frontend CSS/JS. No database migrations, no server changes, no URL changes. Deployment is a static SPA build — no rollback concerns beyond reverting the commit.

## Open Questions

- Should hints in reader mode also cover the mode toggle buttons (Aa / ≈ / </>) as hintable targets? (Probably not — they already have keyboard shortcuts via the mode toggle.)
- Desired hint badge visual style: Vimium uses a yellow pill. Should it follow the `--mb-accent` color instead to match the app theme? To decide during implementation.
- Should `f` in reader mode be suppressed when focus is inside the HTML iframe? (Yes — iframe captures keys before the page; no special handling needed.)
