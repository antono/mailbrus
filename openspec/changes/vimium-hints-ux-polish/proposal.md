## Why

Keyboard-driven workflows in Mailbrus lack the speed of tools like Vimium: there is no way to open a message or follow a link without touching the mouse. Several smaller UX rough edges (pagination counter, header animation, default render mode, missing about-page logo) have accumulated and deserve a single focused pass.

## What Changes

- **Pagination**: display "X / Y" instead of just a page number; animate the `X` counter with a brief highlight pulse on page change (works in both dark and light themes).
- **Reader sticky header**: collapse/expand transition is now animated (height + opacity ease).
- **Default render mode**: when a message has a `text/plain` part, prefer `text` mode on first open instead of `simple`.
- **About page logo**: restore the logo mark that was removed during a previous refactor.
- **Vimium-style hints — list mode**: pressing `f` overlays a lettered badge on each visible message row; pressing the corresponding letter opens that message (pressing `Escape` or any non-hint key cancels).
- **Vimium-style hints — reader mode**: pressing `f` overlays lettered badges on every in-body link and on each attachment chip; pressing the corresponding letter follows the link in a new tab (or triggers the attachment action); `Escape` cancels.

## Capabilities

### New Capabilities
- `vimium-link-hints`: keyboard hint overlay system (f-key activation, badge rendering, letter dispatch) shared between list and reader contexts.

### Modified Capabilities
- `message-pagination-ui`: add "X / Y" label format and animated counter highlight on navigation.
- `ui-hotkeys`: extend hotkey table with `f` hint-mode entries for list and reader contexts; document cancellation behaviour.
- `sveltekit-ui`: reader sticky-header collapse animation; plain-text-first default mode selection; about-page logo restoration.

## Impact

- `src/lib/components/Reader.svelte` — default mode logic, header animation CSS.
- `src/lib/components/About.svelte` — logo restoration.
- `src/lib/components/` (new) — `HintOverlay.svelte` for the vimium hint layer.
- `src/lib/hotkeys.ts` (or equivalent) — `f` key handler wiring for list and reader modes.
- Pagination component (existing) — counter label and CSS pulse animation.
- No backend / server changes required.
- No breaking changes to public APIs or URL routing.

## Non-goals

- Full Vimium feature parity (no `g`/`G`, `d`/`u` scroll, visual mode, etc.).
- Multi-letter hint sequences (single a–z letter is sufficient for typical message/link counts).
- Custom hint key remapping via settings.
