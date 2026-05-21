## ADDED Requirements

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
`G` (shift-g) SHALL move the selection to the last message. The `g g` leader sequence SHALL move it to the first.

#### Scenario: Jump to bottom
- **WHEN** the user presses `G` on the list
- **THEN** the selected index is set to the last message index

#### Scenario: Jump to top via leader
- **WHEN** the user presses `g` then `g` within 1.2 s on the list
- **THEN** the selected index is set to 0

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
| `g` | Top of list |

An unrecognized key or timeout SHALL cancel the leader with no action.

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
Inside the reader, `j`/`↓` and `k`/`↑` SHALL cycle to the next/previous message in the current list. `Escape` SHALL close the reader and return to the list at the same cursor position.

#### Scenario: Next message in reader
- **WHEN** the reader is open and the user presses `j` or `↓`
- **THEN** the reader advances to the next message; the list selected index updates accordingly

#### Scenario: Previous message in reader
- **WHEN** the reader is open and the user presses `k` or `↑`
- **THEN** the reader moves to the previous message; the list selected index updates accordingly

#### Scenario: Escape closes reader
- **WHEN** the reader is open and the user presses `Escape`
- **THEN** the reader closes and the list is visible with the cursor on the same message

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
