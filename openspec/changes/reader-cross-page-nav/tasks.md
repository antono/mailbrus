## 1. Reader keymap: `q` binding

- [ ] 1.1 Add `quit: () => void` to `ReaderKeymapCtx` in `src/lib/hotkeys/keymaps/reader.ts`
- [ ] 1.2 Bind `q` (group "Actions", description "Quit to list") to `ctx.quit` in `createReaderKeymap`
- [ ] 1.3 Wire `quit` in `Reader.svelte`'s `useScopedKeymap` context to a new `onQuit` prop

## 2. Cross-page navigation in +page.svelte

- [ ] 2.1 In `onNext`, when `selectedIdx === currentMessages.length - 1` and `currentPage < Math.ceil(totalCount / currentPerPage)`, call `loadMessages(account.id, folder.id, currentPage + 1, (msgs) => openMessageRoute(folder.id, msgs[0].id))`; otherwise keep the in-page advance
- [ ] 2.2 In `onPrev`, when `selectedIdx === 0` and `currentPage > 1`, call `loadMessages(account.id, folder.id, currentPage - 1, (msgs) => openMessageRoute(folder.id, msgs[msgs.length - 1].id))`; otherwise keep the in-page step
- [ ] 2.3 Ensure both handlers no-op at the absolute first/last message of the folder

## 3. Quit + focus-on-return

- [ ] 3.1 Add a `quitReader()` handler in `+page.svelte` that calls `closeReaderRoute(folder.id)` then `await tick()` and scrolls the selected row (`listEl.querySelector('[data-msg-idx="<selectedIdx>"]')`) into view with `{ block: 'nearest' }`
- [ ] 3.2 Pass `quitReader` to `Reader` as `onQuit`
- [ ] 3.3 Apply the same scroll-into-view on `Escape` close so both paths focus the current message

## 4. Reader position counter

- [ ] 4.1 Compute `msgIndex = (currentPage - 1) * currentPerPage + selectedIdx + 1`, `pageNum = currentPage`, `lastPage = Math.ceil(totalCount / currentPerPage)`, `total = totalCount` in `+page.svelte` and pass to `Reader` as props
- [ ] 4.2 Render the `index / page / total` counter in `Reader.svelte`'s breadcrumb `right` snippet
- [ ] 4.3 Add per-number `title` hints: "Message <index> of <total>", "Page <page> of <lastPage>", "<total> messages in <folder>"
- [ ] 4.4 Add `data-testid` attributes for each counter number (e.g. `reader.counter-index`, `reader.counter-page`, `reader.counter-total`)

## 5. Keyboard help

- [ ] 5.1 Verify `q` appears in the keyboard help overlay under the reader scope (driven by the keymap description; no extra wiring expected)

## 6. E2E test validation and fixes

- [ ] 6.1 Author an E2E spec (use the `mailbrus-e2e-author` skill) covering: cross-page `j` opens the next page's first message, cross-page `k` opens the previous page's last message, and no-op at folder ends — use the `Archive` folder (27 messages > PER_PAGE) for cross-page coverage
- [ ] 6.2 Add E2E coverage for `q`: after crossing into a later page, `q` returns to the list on that page with the current message selected
- [ ] 6.3 Add E2E coverage for the counter: correct `index / page / total` values and the three `title` hint strings
- [ ] 6.4 Run the full E2E suite, fix regressions, until green

## 7. Cleanup

- [ ] 7.1 Run the build/lint and fix all compilation and Svelte/TypeScript warnings introduced by this change
