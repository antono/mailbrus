## 1. Backend: expose original recipients (for reply-all)

- [x] 1.1 In `mailbrus-core`, surface the original `To`/`Cc` recipients for a message (parse from the maildir/notmuch message), adding fields to the message detail model.
- [x] 1.2 In `mailbrus-server`, include `to`/`cc` recipient lists in the message-detail HTTP response.
- [x] 1.3 Add/extend Rust unit tests in core covering recipient parsing (multiple To/Cc, missing Cc, own-address present).

## 2. Frontend data layer

- [x] 2.1 Extend the frontend `Message`/message-detail types in `src/lib/data.ts` (and the API client in `src/lib/api.ts`) to carry real `to`/`cc` recipients.
- [x] 2.2 Thread the recipient data through to `Reader.svelte` props.

## 3. Reply/forward/quote helper

- [x] 3.1 Create `src/lib/reply.ts` with pure `buildReply(message, account, body, { all })` and `buildForward(message, account, body, headers)` returning `{ to, cc, subject, body }`.
- [x] 3.2 Implement subject prefixing (`Re:`/`Fwd:`, case-insensitive, no duplication) and `> `-per-line body quoting.
- [x] 3.3 Implement reply-all recipient computation: `To` = sender, `Cc` = union of original `To`/`Cc`, excluding the active account address (dedup).
- [x] 3.4 Unit-test `reply.ts` (subject de-dup, quoting, reply-all dedup + own-address exclusion, forward header block).

## 4. Compose prefill

- [x] 4.1 Add `composePrefill: ComposeDraft | null` to `src/lib/ui-state.svelte.ts`.
- [x] 4.2 Update `Compose.svelte` to seed `to/cc/bcc/subject/body` (and auto-show Cc when present) from `ui.composePrefill` on mount, then clear it.

## 5. Reader actions wiring

- [x] 5.1 Add a clipboard helper (e.g. `src/lib/clipboard.ts`) wrapping `navigator.clipboard.writeText`.
- [x] 5.2 Implement `yankBody` (body only) and `yankHeaders` (From/To/Subject + Date/Cc when present, blank line, body) in `Reader.svelte` using `buildHeaders`.
- [x] 5.3 Implement `reply`/`replyAll`/`forward` in `Reader.svelte` — build draft via `reply.ts`, set `ui.composePrefill`, open compose.
- [x] 5.4 Wire `toggleHeaders` to the existing `showHeaders` state.

## 6. Keymap edits

- [x] 6.1 `src/lib/hotkeys/keymaps/list.ts`: remove `g i`/`g a`/`g s`/`g d` and `g A`; keep `g f`/`g g`/`G`; add `g a` → account picker; prune unused ctx callbacks (`goInbox`/`goArchive`/`goSent`/`goDrafts`) and their wiring in `+page.svelte`.
- [x] 6.2 `src/lib/hotkeys/keymaps/reader.ts`: extend `ReaderKeymapCtx` and add bindings `r`/`R`/`F`/`y`/`Y` and the `['g','h']` leader; keep `f` = hint mode.
- [x] 6.3 Verify keyboard help renders the new reader bindings and no longer shows removed list leaders (single-source-of-truth; no hard-coded list).

## 7. E2E tests (use mailbrus-e2e-author skill)

- [x] 7.1 Update/extend page objects and manifest for compose prefill assertions and reader actions; add the `// openspec/...` reference comment to each spec.
- [x] 7.2 Spec: `g f` opens folder picker, `g a` opens account picker, `g g` jumps to top, `G` jumps to bottom; assert removed leaders (`g i`/`g s`/`g d`) are no-ops.
- [x] 7.3 Spec: reader `r` opens compose with `To` = sender, `Re:` subject (no dup), body quoted with `> `.
- [x] 7.4 Spec: reader `R` populates `To`/`Cc` from participants and excludes the active account address.
- [x] 7.5 Spec: reader `F` opens compose with empty `To`, `Fwd:` subject, forwarded headers+body; `f` still activates hint mode.
- [x] 7.6 Spec: reader `y` / `Y` copy body / headers+body (grant `clipboard-read`/`clipboard-write`; assert via `navigator.clipboard.readText()`).
- [x] 7.7 Spec: reader `g h` toggles the headers popover open/closed.

## 8. Validation & cleanup

- [x] 8.1 Run `deno task test:e2e`; debug failures via traces and fix until green.
- [x] 8.2 Run the hotkeys unit tests (`dispatcher-core.test.ts` + new `reply.ts` tests) and ensure they pass.
- [x] 8.3 Fix all compilation/lint warnings (Rust `cargo build` warnings, `deno task build`/svelte-check warnings).

## 9. Post-review fixes (reader g-leader)

- [x] 9.1 Add `g f` (folder picker) and `g a` (account picker) to `reader.ts` keymap + `Reader.svelte` wiring (use existing `onFolder`/`onAccount` props), so they work in the reader, not just the list.
- [x] 9.2 Make the `+page.svelte` g-leader indicator scope-aware: reader shows `f folder · a account · g top · h headers`; list keeps `… · h prev-page · l next-page`.
- [x] 9.3 E2E: reader `g f` opens the folder picker and `g a` opens the account picker.
