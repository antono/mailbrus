## Reference

All prototype source files are in `reference/`. Primary files for implementation:

- **`reference/app.jsx`** — state machine, keyboard handler, top-level component tree → maps to `src/routes/+page.svelte`
- **`reference/screens.jsx`** — every screen component (Palette, MailList, Reader, Compose, About, KeyboardHelp, HintBar, Avatar, Breadcrumbs, RecipientInput, Attachments, HeadersPopover) → each becomes a `.svelte` file
- **`reference/tweaks-panel.jsx`** — Tweaks panel (draggable, all controls) → `TweaksPanel.svelte`
- **`reference/colors_and_type.css`** — shadcn token layer; copy verbatim, import globally
- **`reference/styles.css`** — all Mailbrus component styles; copy verbatim, import globally
- **`reference/data.js`** — sample data; port to `src/lib/data.ts`
- **`reference/REQUIREMENTS.md`** — authoritative product requirements; consult for any ambiguity

## Context

The Mailbrus Tauri + SvelteKit desktop app currently has a two-line placeholder page. A complete design handoff (React prototype) has been delivered by Claude Design (`reference/`), specifying every screen, interaction, and visual token pixel-precisely. The prototype is ~1500 lines of React/JSX + ~1350 lines of CSS. The goal is to port this to idiomatic Svelte, keeping the visual output identical.

The prototype relies on: global CSS custom properties (shadcn token system), a `data-accent` attribute and `.dark` class on `<html>` for theming, and a single-SPA state machine (no routing). No framework-specific idioms are used for state — React `useState` maps 1:1 to Svelte stores or `$state`.

## Goals / Non-Goals

**Goals:**
- Pixel-faithful port of the React prototype to SvelteKit components
- All keyboard interactions implemented (j/k, g-leader, Esc, /, c, ⌘K)
- Three list density modes (dense / twoline / spacious)
- Full Tweaks panel (dark, accent, font, density, hintBar) with `localStorage` persistence
- Gravatar + SHA-256 avatar resolution with in-memory cache
- All modals: AccountPicker, FolderPicker, CommandPalette, About, KeyboardHelp
- Reader with signature dimming, headers popover, attachment pills
- Compose with recipient autocomplete, word/char count, ⌘↵ send stub
- g-leader indicator overlay

**Non-Goals:**
- Real maildir I/O — sample data only in this phase
- Tauri IPC / Rust backend integration
- SSR — static adapter only, SPA

## Decisions

### 1. Component granularity: one `.svelte` file per React component

Each React component (Palette, MailList, Reader, Compose, etc.) becomes its own `.svelte` file in `src/lib/components/`. Shared logic (Gravatar, time formatting, contact building) moves to `src/lib/utils.ts`.

**Why**: mirrors the prototype structure exactly, makes the diff reviewable, and allows incremental Tauri wiring later.

**Alternative considered**: A single monolithic page component. Rejected — too hard to navigate and test.

### 2. State management: Svelte 5 `$state` runes (no stores)

App-level state (phase, account, folder, selectedIdx, openMessage, etc.) lives in `+page.svelte` using Svelte 5 `$state`. Tweaks use a single `$state` object persisted to `localStorage` via `$effect`.

**Why**: Svelte 5 runes remove the need for writable stores for local component state. Direct reactivity is simpler and avoids import boilerplate.

**Alternative considered**: Svelte writable stores. Rejected — runes are the idiomatic Svelte 5 approach and the project is new.

### 3. CSS strategy: global stylesheet + scoped component styles

`colors_and_type.css` and `styles.css` are imported in `src/app.css` (global). Component-specific tweaks use `<style>` blocks inside `.svelte` files only where the global stylesheet is insufficient. The `.mb-scroll`, `.kbd`, `.mb-wordmark` etc. utility classes remain global.

**Why**: The prototype CSS is already well-organised and uses BEM-like class names. Scoping everything into CSS modules would require renaming hundreds of classes.

**Alternative considered**: CSS modules per component. Rejected — excessive churn with no benefit given the existing naming discipline.

### 4. Keyboard handling: single `window` listener in `+page.svelte`

All global keyboard events are handled in a single `onMount`/`$effect` listener in `+page.svelte`, matching the React prototype's single `useEffect`. Modal components emit `onCancel` / `onSelect` callbacks; they don't capture global keys except for their own Esc.

**Why**: Avoids event-listener ordering conflicts and makes the full keyboard map visible in one place.

### 5. Tweaks persistence: `localStorage`

Tweaks are serialized to `localStorage["mailbrus-tweaks"]` as JSON. On mount, they're read back with defaults applied for missing keys.

**Why**: Simple, no Tauri store needed, survives hot reload, and matches what the prototype's `__edit_mode_set_keys` protocol was simulating.

## Risks / Trade-offs

- **Svelte 5 rune SSR caveat** → `adapter-static` with `prerender = false` (SPA mode) avoids any SSR rune issues.
- **Web Crypto availability** → Gravatar SHA-256 uses `crypto.subtle.digest`; this is available in all modern browser contexts including Tauri's WebView.
- **Font loading flash** → Geist is loaded via Google Fonts CDN; in Tauri offline builds the font will fall back to system sans. Acceptable for this phase.
- **CSS custom property cascade** → `data-accent` and `.dark` must be on `<html>`, not on `#svelte`. The `$effect` in `+page.svelte` sets them on `document.documentElement` matching the prototype exactly.

## Migration Plan

1. Copy `colors_and_type.css` and `styles.css` from the handoff into `src/` and import them in `src/app.css`.
2. Create `src/lib/data.ts` with the sample data (typed version of `data.js`).
3. Create utility module `src/lib/utils.ts` (gravatar, time formatting, initials, bytes formatting).
4. Create component files bottom-up: shared primitives first (Wordmark, Avatar, Breadcrumbs, Palette), then screens (MailList, Reader, Compose), then overlays (About, KeyboardHelp).
5. Rewrite `src/routes/+page.svelte` as the app shell with state machine and keyboard handler.
6. Run `deno task dev` and verify all screens visually against the prototype.

No rollback risk — the placeholder page has no users.

## Open Questions

- Should the Tweaks panel be kept (it's a Claude Design host feature)? Keeping it is fine for dev; it can be hidden behind a `?tweaks` query param later.
- Tauri drag-to-move: the status line area could become the drag region when running inside Tauri. Not needed in this phase.
