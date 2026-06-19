## Why

The reader has no keyboard actions for the most common email operations — reply,
reply-all, forward, copy message text — forcing mouse use for everyday tasks. At the
same time the list g-leader carries five direct folder-jump bindings (`g i`/`g a`/`g s`/`g d`
plus `g A`) that overlap with the folder picker and crowd the namespace. This change
trims the g-leader to navigation primitives and gives the reader a vim-flavoured action
set.

## What Changes

- **List g-leader cleanup** — **BREAKING**: remove `g i` (Inbox), `g a` (Archive),
  `g s` (Sent), `g d` (Drafts), and `g A` (account picker). Keep `g f` (folder picker),
  `g g` (top), and `G` (bottom). Rebind the account picker from `g A` to `g a`.
- **Reader actions** (reader scope, new):
  - `r` — reply to sender (opens compose prefilled).
  - `R` — reply to all.
  - `F` — forward (keeps `f` = hint mode; no collision).
  - `y` — yank: copy the message body text to the clipboard.
  - `Y` — yank with headers: copy `From`, `To`, `Subject` and other common headers
    plus the body.
  - `g h` — open the headers menu (the existing `HeadersPopover`).
  - `g f` / `g a` — open the folder / account picker from the reader (mirrors the
    list g-leader so navigation works without first quitting to the list).
- **Keyboard help** updates automatically from the keymaps (single-source-of-truth);
  removed bindings drop out, new reader bindings appear in the Reader section.
- **E2E coverage** — new specs validating `g f` (folder selector), `g a` (account
  selector), `g g` (top), and `G` (bottom).

## Capabilities

### New Capabilities
- `reader-message-actions`: reply / reply-all / forward (open compose prefilled and
  quoted) and yank / yank-with-headers (clipboard copy) and headers-menu toggle,
  invoked from the reader.

### Modified Capabilities
- `ui-hotkeys`: trim the g-leader keymap (remove `g i`/`g a`/`g s`/`g d`/`g A`,
  rebind account picker to `g a`), add reader-scope bindings `r`/`R`/`F`/`y`/`Y`/`g h`,
  and require E2E coverage of the retained navigation leaders.

## Impact

- Frontend keymaps: `src/lib/hotkeys/keymaps/list.ts`, `keymaps/reader.ts`.
- Reader wiring: `src/lib/components/Reader.svelte`, `HeadersPopover.svelte`, compose
  prefill path, clipboard helper.
- E2E: new specs under `e2e/specs/` plus page-object/manifest support.
- No backend or server-API changes anticipated; reply/forward reuse the existing
  compose + SMTP path.

## Non-goals

- No threaded/conversation reply view; reply opens the existing compose screen.
- No configurable/user-remappable keybindings.
- No list-scope reply/forward (`r` stays "mark read" on the list).
- No rich clipboard formats (HTML/markdown); yank copies plain text.
