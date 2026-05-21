## 1. Fix: clearLeader on all modal-open paths

- [ ] 1.1 Call `clearLeader()` when `cmdOpen` is set to true (⌘K handler in +page.svelte)
- [ ] 1.2 Call `clearLeader()` when `composeOpen` is set to true (`c` handler)
- [ ] 1.3 Call `clearLeader()` when any phase transition occurs (`phase = 'account'`, `phase = 'folder'`)

## 2. Resolve ⌘K open question

- [ ] 2.1 Decide: should ⌘K open the command palette during the account or folder picker phase? (see design.md open questions)
- [ ] 2.2 If yes: remove the `account && folder` guard from the ⌘K handler and add "Switch account…" / "Switch folder…" as always-available palette commands

## 3. Verify each spec requirement end-to-end

- [ ] 3.1 Global list keys: j/k/↑/↓ navigate rows, G jumps to bottom
- [ ] 3.2 Enter opens reader; j/k in reader cycle messages; Esc closes reader at same cursor
- [ ] 3.3 `/` opens search; Enter commits query; Esc clears and closes
- [ ] 3.4 `c` opens compose; ⌘↵ sends; ⌘S saves draft; Esc confirms discard when dirty
- [ ] 3.5 g-leader: all follow-ups (i a s d f A g) navigate correctly; timeout clears; unrecognized key clears; indicator visible
- [ ] 3.6 ⌘K opens command palette; all palette commands route correctly
- [ ] 3.7 Palette: ↑/↓, Ctrl+N/P, j/k (search empty), 1–9 (search empty), Enter, Esc all work
- [ ] 3.8 Esc back-navigation: list→folder picker, folder picker (no prior folder)→account picker, folder picker (folder active)→list, account picker (session active)→list
- [ ] 3.9 `?` opens and closes keyboard help overlay; Esc also closes it
- [ ] 3.10 isTyping guard: j/k/c/g/G do not fire when focus is in an input or textarea

## 4. Verify Ctrl+N / Ctrl+P label in HintBar footer

- [ ] 4.1 Confirm that `Ctrl+N`/`Ctrl+P` palette navigation hint appears somewhere visible (KeyboardHelp "Inside palettes" section already lists ↑/↓ — decide if Ctrl+N/P need to be shown separately or are documented enough in KeyboardHelp)
