# Proposal: ui-fixes

## Why

Several UI rough edges reduce daily usability: dates are raw machine strings in the mail list, the Reader header is cluttered with the date buried in the subject line, the From field sometimes duplicates the email address, attachments are completely invisible despite full backend support, and keyboard navigation in the list is missing page-turning and vim-style scroll shortcuts.

## What Changes

**Date formatting**
- Apply `expandTime()` (already in `utils.ts`) to every date rendered in `MailList.svelte` — all three density layouts show raw `m.time` strings (e.g. `5m`, `today`, `Mon 10`) instead of expanded labels.
- Adjust `expandTime()` threshold/output: recent dates (< ~24 h) render as relative ("2 minutes ago", "3 hours ago"); older dates render as ISO `YYYY-MM-DD HH:MM` (24-hour).
- When a relative label is shown, wrap it in a `<time>` element with `title={iso}` so the full timestamp appears on hover.

**Reader layout**
- Remove the date from the subject line (`[{ago.label}]` bracket suffix currently appended after the subject text).
- Display the date as a separate row below the From/To block, styled consistently with the other meta rows.
- Reduce subject font size while keeping `font-weight: bold`.

**From field deduplication**
- `message.from` can be a bare email address, and `message.addr` can be the same value, causing `Name <email>` to render as `email <email>`. Fix the guard so `<addr>` is only appended when `message.addr` is non-empty and differs from `message.from`.

**Attachments — frontend**
- `+page.svelte` calls `fetchMessage()` which returns `MessageBody` (includes `attachments: Attachment[]`) but the `attachments` field is discarded and never passed to `<Reader>`.
- Wire the data: pass `attachments` as a prop from `+page.svelte` → `<Reader>` → `<Attachments>`.

**Attachments — backend**
- `mime.rs` builds attachment metadata with `"size": 0` (hardcoded). Compute actual byte length from the part body.

**Hotkeys — list mode**
- `h` → previous page (calls `handleListPageChange(page - 1)`; no-op on page 0).
- `l` → next page (calls `handleListPageChange(page + 1)`; no-op on last page).
- Update the `g`-leader hint bar to include these keys.

**Hotkeys — vim scroll (`gg` / `G`)**
- `gg` (g-leader + g) in **list mode**: currently moves selection to first item. Extend to also scroll the list viewport to the top.
- `G` in **list mode**: currently moves selection to last item. Extend to also scroll the list viewport to the bottom.
- `gg` in **reader mode**: scroll the message body to the top.
- `G` in **reader mode**: scroll the message body to the bottom.
- Both chords must work in reader mode via the existing phase guard in `+page.svelte`.
- Update `KeyboardHelp.svelte` and `openspec/specs/ui-hotkeys/spec.md` to document the new bindings.

## Capabilities

### New Capabilities
*(none)*

### Modified Capabilities
- `sveltekit-ui`: date display behaviour changes (relative vs. absolute threshold, hover tooltip), Reader header layout restructured, subject font size, From dedup logic, attachments prop wired end-to-end.
- `ui-hotkeys`: new bindings `h`/`l` for pagination, `gg`/`G` scroll in reader mode; list-mode `gg`/`G` extended to also scroll viewport.
- `mailbrus-server-crate`: attachment size field must reflect real byte count instead of 0.

## Impact

| File | Change |
|------|--------|
| `src/lib/utils.ts` | Adjust `expandTime()` for relative/absolute threshold and format |
| `src/lib/components/MailList.svelte` | Use `expandTime()` on `m.time` in all density layouts |
| `src/lib/components/Reader.svelte` | Move date row, shrink subject, fix From dedup |
| `src/routes/[account]/[folder]/[id]/+page.svelte` | Pass `attachments` prop to `<Reader>` |
| `src/routes/+page.svelte` | Add `h`/`l` page hotkeys; extend `gg`/`G` list handlers to scroll viewport; add reader-mode `gg`/`G` scroll handlers |
| `src/lib/components/KeyboardHelp.svelte` | Document new bindings |
| `openspec/specs/ui-hotkeys/spec.md` | Update spec with new bindings |
| `mailbrus-server/src/mime.rs` | Compute real attachment size from part body bytes |
