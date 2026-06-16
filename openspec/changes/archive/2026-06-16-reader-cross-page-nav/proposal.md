## Why

In the reader, `j`/`k` clamp to the current page's first/last message, so a user
reading down a folder silently stops at the page boundary and cannot continue.
There is also no `Escape`-alternative that returns to the list with the message
they were reading kept in focus, and the reader gives no sense of position
within the folder. This makes reading through a large folder feel like it dead-ends.

## What Changes

- Reader `j`/`k` (and `ArrowDown`/`ArrowUp`) cross page boundaries: at the last
  message of the current page they load the next page and open its first message;
  at the first message they load the previous page and open its last message.
  At the absolute ends of the folder they no-op (as today).
- New reader hotkey **`q`**: exit the reader to the message list with the
  currently-open message selected and scrolled into view — on whichever page it
  now lives, which may differ from the page the reader was entered from.
- Returning to the list (via `q` or `Escape`) selects the current message and
  scrolls it into view, instead of leaving the previously-selected row.
- New reader top-panel counter `[ index / page / total ]`:
  - **index** — absolute 1-based position in the folder (`(page−1)·perPage + selectedIdx + 1`)
  - **page** — current page number
  - **total** — total messages in the folder
  - each number carries a hover hint (`title`): "Message N of T", "Page P of L",
    "T messages in <folder>".

## Capabilities

### New Capabilities
<!-- None — all behavior extends existing reader/hotkey/list specs. -->

### Modified Capabilities
- `ui-hotkeys`: the "Reader navigation keys" requirement changes — `j`/`k` cross
  page boundaries instead of clamping, and a new `q` binding quits the reader to
  the list focused on the current message.
- `sveltekit-ui`: the "Reader screen" requirement adds the `[ index / page / total ]`
  position counter with per-number hover hints; returning to the list focuses and
  scrolls to the current message.

## Impact

- Frontend only. No server, CLI, or core changes; no API changes.
- `src/lib/components/Reader.svelte` — counter UI + `q` in the reader keymap context.
- `src/lib/hotkeys/keymaps/reader.ts` — add `quit` to `ReaderKeymapCtx` and bind `q`.
- `src/routes/[...path]/+page.svelte` — `onNext`/`onPrev` page-crossing logic
  (load adjacent page, open first/last), a quit handler, and list focus-on-return
  (select + scroll `selectedIdx` into view).
- New E2E spec under `e2e/specs/` covering cross-page nav, `q`, and the counter.

## Non-goals

- No infinite scroll or virtualized list; pagination stays page-based.
- No change to the list's own `h`/`l` paging or `j`/`k` clamping behavior.
- No new keyboard shortcuts beyond `q`; `Escape` semantics are unchanged except
  that it now also focuses the current message on return.
- The counter is display-only — clicking its numbers does nothing.
