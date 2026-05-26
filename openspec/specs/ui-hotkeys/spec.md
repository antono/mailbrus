# ui-hotkeys

## Purpose

Keyboard shortcut handling for the mailbrus SvelteKit frontend. Covers global shortcuts, list navigation, reader navigation, compose shortcuts, palette navigation, leader-key sequences, and the Escape back-navigation stack.

---
## Requirements
### Requirement: Global command palette shortcut
The app SHALL open the command palette when `⌘K` or `Ctrl+K` is pressed, provided an account and folder are active. If the palette is already open it SHALL close.

#### Scenario: Open palette from list
- **WHEN** the user is on the message list and presses `⌘K` or `Ctrl+K`
- **THEN** the command palette opens

#### Scenario: Close palette with same shortcut
- **WHEN** the command palette is open and the user presses `⌘K` or `Ctrl+K`
- **THEN** the command palette closes

#### Scenario: Shortcut inactive before account/folder selected
- **WHEN** no account or folder is selected and the user presses `⌘K`
- **THEN** nothing happens

---

### Requirement: Keyboard help toggle
The app SHALL open the keyboard help overlay when `?` is pressed on the message list with no modal open. Pressing `?` again or `Escape` SHALL close it.

#### Scenario: Open help from list
- **WHEN** phase is list, no modal is open, and the user presses `?`
- **THEN** the keyboard help overlay opens

#### Scenario: Escape closes help
- **WHEN** the keyboard help overlay is open and the user presses `Escape`
- **THEN** the keyboard help overlay closes

---

### Requirement: List navigation keys
The message list SHALL respond to `j`/`↓` (next row) and `k`/`↑` (prev row) when focus is not in a text input and no modal is open.

#### Scenario: Move down
- **WHEN** the user presses `j` or `↓` on the list
- **THEN** the selected index increments by 1, clamped to the last message

#### Scenario: Move up
- **WHEN** the user presses `k` or `↑` on the list
- **THEN** the selected index decrements by 1, clamped to 0

#### Scenario: Keys suppressed when typing
- **WHEN** focus is inside an `input` or `textarea` and the user presses `j`
- **THEN** the character is typed normally and the selected index does not change

---

### Requirement: Open message with Enter
Pressing `Enter` on the message list SHALL open the currently selected message in the reader.

#### Scenario: Open reader
- **WHEN** the user presses `Enter` on the list
- **THEN** the reader opens showing the selected message

---

### Requirement: Jump to list extremes
`G` (shift-g) SHALL move the selection to the last message AND scroll the list viewport to the bottom. The `g g` leader sequence SHALL move the selection to the first message AND scroll the list viewport to the top.

#### Scenario: Jump to bottom
- **WHEN** the user presses `G` on the list
- **THEN** the selected index is set to the last message index and the list scroll container scrolls to the bottom

#### Scenario: Jump to top via leader
- **WHEN** the user presses `g` then `g` within 1.2 s on the list
- **THEN** the selected index is set to 0 and the list scroll container scrolls to the top

---

### Requirement: List pagination hotkeys
Pressing `h` on the message list SHALL navigate to the previous page. Pressing `l` SHALL navigate to the next page. Both keys SHALL be active only when the list is the active phase, no modal is open, no leader key is active, and focus is not in a text input. At the boundary pages the keys SHALL be no-ops.

#### Scenario: l advances to next page
- **WHEN** the user is on the message list (not the last page) and presses `l`
- **THEN** the next page of messages loads

#### Scenario: h goes to previous page
- **WHEN** the user is on the message list (not the first page) and presses `h`
- **THEN** the previous page of messages loads

#### Scenario: h is no-op on first page
- **WHEN** the user is on page 0 and presses `h`
- **THEN** nothing happens

#### Scenario: l is no-op on last page
- **WHEN** the user is on the last page and presses `l`
- **THEN** nothing happens

#### Scenario: Keys suppressed when leader active
- **WHEN** the g-leader is active and the user presses `h` or `l`
- **THEN** the leader clears (unrecognized follow-up) and no page change occurs

---

### Requirement: Search bar shortcut
Pressing `/` on the message list SHALL open the inline search bar. `Enter` SHALL commit the query. `Escape` SHALL close the bar and clear the query.

#### Scenario: Open search
- **WHEN** the user presses `/` on the list
- **THEN** the search bar opens with focus in the query input

#### Scenario: Close search
- **WHEN** the search bar is open and the user presses `Escape`
- **THEN** the search bar closes and the query is cleared

---

### Requirement: Compose shortcut
Pressing `c` on the message list (not inside a text input, no modifier) SHALL open the compose screen.

#### Scenario: Open compose
- **WHEN** the user presses `c` on the list
- **THEN** the compose screen opens

---

### Requirement: g-leader navigation
`g` SHALL act as a leader key with a 1.2 s timeout. A visual indicator SHALL appear while waiting for the follow-up key. Recognized follow-ups:

| Follow-up | Action |
|-----------|--------|
| `i` | Go to Inbox |
| `a` | Go to Archive |
| `s` | Go to Sent |
| `d` | Go to Drafts |
| `f` | Open folder picker |
| `A` | Open account picker |
| `g` | Top of list (and scroll viewport to top) |

An unrecognized key or timeout SHALL cancel the leader with no action. The indicator SHALL also display `h prev-page · l next-page` as standalone (non-leader) hints.

#### Scenario: Indicator visible while leader active
- **WHEN** the user presses `g` on the list
- **THEN** the leader indicator appears showing available follow-ups

#### Scenario: Follow-up navigates to folder
- **WHEN** the leader is active and the user presses `i`
- **THEN** the list switches to Inbox and the leader clears

#### Scenario: Timeout cancels leader
- **WHEN** the user presses `g` and does not press a follow-up within 1.2 s
- **THEN** the leader clears and no navigation occurs

#### Scenario: Unrecognized follow-up cancels leader
- **WHEN** the leader is active and the user presses a key that is not a recognized follow-up
- **THEN** the leader clears and no navigation occurs

---

### Requirement: Reader navigation keys
Inside the reader, `j`/`↓` and `k`/`↑` SHALL cycle to the next/previous message in the current list. `Escape` SHALL close the reader and return to the list at the same cursor position. `g g` (g pressed twice within 1.2 s) SHALL scroll the reader message body to the top. `G` SHALL scroll the reader message body to the bottom. `J` SHALL scroll the reader body down by 20 lines (400 px) and `K` SHALL scroll it up by 20 lines; these keys SHALL stop propagation so they do not trigger next/previous message navigation.

#### Scenario: Next message in reader
- **WHEN** the reader is open and the user presses `j` or `↓`
- **THEN** the reader advances to the next message; the list selected index updates accordingly

#### Scenario: Previous message in reader
- **WHEN** the reader is open and the user presses `k` or `↑`
- **THEN** the reader moves to the previous message; the list selected index updates accordingly

#### Scenario: Escape closes reader
- **WHEN** the reader is open and the user presses `Escape`
- **THEN** the reader closes and the list is visible with the cursor on the same message

#### Scenario: gg scrolls reader body to top
- **WHEN** the reader is open and the user presses `g` then `g` within 1.2 s
- **THEN** the reader message body scroll container scrolls to the top

#### Scenario: G scrolls reader body to bottom
- **WHEN** the reader is open and the user presses `G`
- **THEN** the reader message body scroll container scrolls to the bottom

#### Scenario: J scrolls reader body down
- **WHEN** the reader is open and the user presses `J`
- **THEN** the reader message body scroll container scrolls down 400 px (smooth); next-message navigation does not trigger

#### Scenario: K scrolls reader body up
- **WHEN** the reader is open and the user presses `K`
- **THEN** the reader message body scroll container scrolls up 400 px (smooth); previous-message navigation does not trigger

---

### Requirement: Compose keyboard shortcuts
Inside the compose screen, `⌘↵`/`Ctrl+↵` SHALL trigger send, `⌘S`/`Ctrl+S` SHALL save draft, and `Escape` SHALL discard (with confirmation if any field is non-empty). `Tab`/`Shift+Tab` SHALL move focus between fields.

#### Scenario: Send shortcut
- **WHEN** the compose screen is open and the user presses `⌘↵` or `Ctrl+↵`
- **THEN** the send action is triggered and the compose screen closes

#### Scenario: Save draft shortcut
- **WHEN** the compose screen is open and the user presses `⌘S` or `Ctrl+S`
- **THEN** the save-draft action is triggered and the compose screen closes

#### Scenario: Escape with empty fields
- **WHEN** the compose screen is open, all fields are empty, and the user presses `Escape`
- **THEN** the compose screen closes without confirmation

#### Scenario: Escape with non-empty fields
- **WHEN** the compose screen is open, at least one field is non-empty, and the user presses `Escape`
- **THEN** a discard confirmation is shown before closing

---

### Requirement: Palette keyboard navigation
Inside any palette (account, folder, command), `↑`/`↓` and `Ctrl+N`/`Ctrl+P` SHALL move the selection. When the search input is empty, `j`/`k` SHALL also move the selection and `1`–`9` SHALL jump to the corresponding row. `Enter` SHALL confirm. `Escape` SHALL cancel.

#### Scenario: Arrow key navigation
- **WHEN** a palette is open and the user presses `↑` or `↓`
- **THEN** the selection moves accordingly

#### Scenario: Number key shortcut when search empty
- **WHEN** a palette is open, the search input is empty, and the user presses `3`
- **THEN** the third row is selected

#### Scenario: Number key ignored when search non-empty
- **WHEN** a palette is open, the search input contains text, and the user presses `3`
- **THEN** `3` is appended to the search query and the selection does not jump

#### Scenario: Enter confirms selection
- **WHEN** a palette is open and the user presses `Enter`
- **THEN** the highlighted item is selected and the palette closes

#### Scenario: Escape cancels palette
- **WHEN** a palette is open and the user presses `Escape`
- **THEN** the palette closes with no selection made

---

### Requirement: Escape back-navigation
`Escape` SHALL walk the app backward through the navigation stack:
- Reader open → close reader, return to list
- Search bar open → close search bar
- List phase → open folder picker
- Folder picker, no folder yet selected → open account picker
- Folder picker, folder already active → return to list
- Account picker, account+folder active → return to list
- Account picker, no account selected → stay on account picker

#### Scenario: Escape from list goes to folder picker
- **WHEN** phase is list, no modal open, no search open, and the user presses `Escape`
- **THEN** the folder picker opens

#### Scenario: Escape from folder picker without prior folder goes to account picker
- **WHEN** the folder picker is open and no folder has been selected yet and the user presses `Escape`
- **THEN** the account picker opens

#### Scenario: Escape from folder picker with active folder returns to list
- **WHEN** the folder picker is open, a folder is already active, and the user presses `Escape`
- **THEN** the list is shown

#### Scenario: Escape from account picker with active session returns to list
- **WHEN** the account picker is open, an account and folder are already active, and the user presses `Escape`
- **THEN** the list is shown

### Requirement: f-key hint mode in list view
When the message list is the active phase, `f` SHALL enter hint mode as specified in the `vimium-link-hints` capability spec. While hint mode is active, all other list-phase hotkeys (j, k, Enter, h, l, g, /, c, ?) SHALL be suppressed until hint mode ends.

#### Scenario: f enters hint mode
- **WHEN** phase is list, no modal is open, focus is not in a text input, and the user presses `f`
- **THEN** the hint overlay activates with one badge per visible message row

#### Scenario: j/k suppressed during hint mode
- **WHEN** list hint mode is active and the user presses `j` or `k`
- **THEN** the hint mode cancels (unrecognised key) and no list navigation occurs

#### Scenario: f ignored when typing
- **WHEN** focus is inside an `input` or `textarea` and the user presses `f`
- **THEN** `f` is typed normally and hint mode does not activate

---

### Requirement: f-key hint mode in reader view
When the reader is the active phase, `f` SHALL enter hint mode as specified in the `vimium-link-hints` capability spec. While hint mode is active, all other reader-phase hotkeys (j, k, J, K, Escape, g) SHALL be suppressed until hint mode ends. `Escape` is the dedicated cancel key for hint mode and SHALL NOT simultaneously trigger reader close.

#### Scenario: f enters link+attachment hint mode in reader
- **WHEN** the reader is open, mode is text or simple, no modal is open, and the user presses `f`
- **THEN** the hint overlay activates with badges on all `.mb-link` anchors and attachment chips

#### Scenario: Escape in hint mode cancels hints only
- **WHEN** reader hint mode is active and the user presses `Escape`
- **THEN** hint mode is cancelled and the reader remains open (Escape is consumed by hint mode, not the reader's Escape handler)

#### Scenario: f suppressed in html mode
- **WHEN** the reader is open in html iframe mode and the user presses `f`
- **THEN** hint mode does NOT activate

#### Scenario: f ignored when typing
- **WHEN** focus is inside an `input` or `textarea` and the user presses `f`
- **THEN** `f` is typed normally and hint mode does not activate

---

### Requirement: Keyboard help documents f hint mode
The keyboard help overlay (`KeyboardHelp.svelte`) SHALL include entries for the `f` hint-mode shortcut in both the list and reader sections.

#### Scenario: f shown in list shortcuts
- **WHEN** the user opens keyboard help while on the list
- **THEN** an entry for `f` is visible describing "open message by hint"

#### Scenario: f shown in reader shortcuts
- **WHEN** the user opens keyboard help while in the reader
- **THEN** an entry for `f` is visible describing "follow link / attachment by hint"

