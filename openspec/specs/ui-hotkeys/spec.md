# ui-hotkeys

## Purpose

Keyboard shortcut handling for the mailbrus SvelteKit frontend. Covers global shortcuts, list navigation, reader navigation, compose shortcuts, palette navigation, leader-key sequences, and the Escape back-navigation stack.

---
## Requirements
### Requirement: Active scope and scope stack
The frontend SHALL maintain a single ordered stack of *active scopes* where each scope is one of
`list`, `reader`, `compose`, `palette`, `modal`, or `hint`. The top of the stack is the active scope.
Every view SHALL push its scope when it mounts and pop the same scope when it unmounts. The stack SHALL
never be empty; `list` is the base scope at app boot.

Popping a scope SHALL remove the most-recent occurrence of that scope wherever it sits in the stack,
not only the top. Scoped views can layer (e.g. the command palette opens over the reader) and a
layered view's action can dismiss the view beneath it, so a scope may be popped while another scope
still sits above it. Removing by identity keeps the active scope (the stack tip) correct and leaves no
stale scope behind. A pop of a scope that is not present in the stack at all is a programming error and
SHALL fail loudly.

#### Scenario: Boot stack
- **WHEN** the app first mounts at the message list
- **THEN** the scope stack is `['list']` and the active scope is `list`

#### Scenario: Opening the reader pushes
- **WHEN** the user opens a message from the list
- **THEN** the scope stack becomes `['list', 'reader']` and the active scope is `reader`

#### Scenario: Closing the reader pops
- **WHEN** the reader is open and the user closes it
- **THEN** the scope stack returns to `['list']` and the active scope is `list`

#### Scenario: Modal layers over reader
- **WHEN** the reader is open and the user opens keyboard help
- **THEN** the scope stack becomes `['list', 'reader', 'modal']` and the active scope is `modal`

#### Scenario: Hint mode layers over its host scope
- **WHEN** the user presses `f` to enter hint mode in the reader
- **THEN** the scope stack becomes `['list', 'reader', 'hint']` and the active scope is `hint`

#### Scenario: A layered view dismisses the view beneath it
- **WHEN** the stack is `['list', 'reader', 'palette']` and a palette action closes the reader underneath the still-open palette
- **THEN** the `reader` scope is removed and the stack becomes `['list', 'palette']` with the active scope still `palette`, and closing the palette then returns to `['list']`

#### Scenario: Popping an absent scope fails loudly in development
- **WHEN** a view attempts to pop a scope that is not present anywhere in the stack
- **THEN** the pop SHALL throw in development builds and SHALL be logged as an error in release builds

### Requirement: Per-scope hotkey isolation
A keyboard binding declared for one scope SHALL NOT fire while a different scope is active. Only two
kinds of bindings fire at any time: Global bindings (always eligible) and bindings of the active scope
(the top of the stack). The dispatcher SHALL NOT fall through to scopes lower in the stack.

#### Scenario: List key does not fire in reader
- **WHEN** the reader is open and the user presses `/` (the list-scope search shortcut)
- **THEN** nothing happens — the inline search bar does not open

#### Scenario: Reader key does not fire on list
- **WHEN** the message list is the active scope and the user presses `J` (the reader-scope scroll-down shortcut)
- **THEN** the list selection does not move and no reader-body scroll occurs

#### Scenario: Compose key does not fire on list
- **WHEN** the message list is the active scope and the user presses `Ctrl+S`
- **THEN** no save-draft action is triggered

#### Scenario: Exclusive scope swallows underlying view's keys
- **WHEN** a `palette`, `modal`, or `hint` scope is active and the user presses any key that is bound
  only in the underlying view (e.g. `j` for list navigation while the command palette is open)
- **THEN** the binding does not fire; the key is consumed by the active scope only

---

### Requirement: Global keymap
A small set of bindings SHALL be declared as Global and SHALL be eligible to fire regardless of the
active scope, subject only to the typing guard (see *Typing guard applies to plain-key bindings*). The
Global keymap SHALL include at minimum:

| Binding | Action |
|---------|--------|
| `Ctrl+K` | Toggle command palette (when an account and folder are active) |
| `Ctrl+,` | Open settings |
| `?` | Toggle keyboard help (per the *Keyboard help toggle* requirement) |
| `Escape` | Walk back through the navigation stack (per the existing *Escape back-navigation* requirement) |

#### Scenario: Ctrl+K opens palette from any non-exclusive scope
- **WHEN** the active scope is `list`, `reader`, or `compose` and the user presses `Ctrl+K`
- **THEN** the command palette opens (provided an account and folder are active)

#### Scenario: ? opens help from any non-exclusive scope
- **WHEN** the active scope is `list`, `reader`, or `compose`, focus is not in a text input, and the
  user presses `?`
- **THEN** the keyboard help overlay opens

#### Scenario: Global keys still suppressed in inputs (plain keys)
- **WHEN** focus is in an `input` or `textarea` and the user presses `?`
- **THEN** `?` is typed normally and the keyboard help overlay does not open

#### Scenario: Global modifier combos work in inputs
- **WHEN** focus is in an `input` or `textarea` and the user presses `Ctrl+K`
- **THEN** the command palette toggles (modifier combos bypass the typing guard)

---

### Requirement: Typing guard applies to plain-key bindings
When focus is in an `input`, `textarea`, or `contenteditable` element, the dispatcher SHALL skip any
binding whose `keys` consist solely of plain characters or non-modifier keys (e.g. `j`, `?`, `g`, `/`,
`Enter` alone). Bindings whose `keys` include `Ctrl`, `Alt`, `Meta`, or `Shift+<letter>` combinations
SHALL still be eligible.

#### Scenario: j typed in compose body
- **WHEN** focus is in the compose body field and the user presses `j`
- **THEN** the character is typed and no list/reader navigation occurs

#### Scenario: ? typed in palette query
- **WHEN** focus is in the command palette search input and the user presses `?`
- **THEN** the character is typed and keyboard help does not open

#### Scenario: Ctrl+Enter still sends from compose
- **WHEN** focus is in the compose body field and the user presses `Ctrl+Enter`
- **THEN** the send action is triggered

---

### Requirement: Keymaps are the single source of help content
Each view's keymap SHALL declare, for every binding, the displayed `keys`, a `group` label, and a
human-readable `description`. The Global keymap SHALL declare the same. The keyboard help overlay SHALL
render its content by reading these declarations directly; there SHALL NOT be a parallel hard-coded help
list. Removing a binding from a keymap SHALL remove it from help; adding a binding SHALL add it to help.

#### Scenario: Help rows match registered bindings
- **WHEN** the keyboard help overlay is open in any scope
- **THEN** every row displayed corresponds to a binding currently registered in either the Global keymap
  or the active scope's keymap

#### Scenario: No orphan help rows
- **WHEN** the keyboard help overlay is open
- **THEN** there SHALL NOT be any displayed row that does not correspond to a registered binding

---

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
The app SHALL open the keyboard help overlay when `?` is pressed in any non-exclusive scope (`list`,
`reader`, `compose`), provided focus is not in a text input. Pressing `?` again or `Escape` SHALL close
it. The overlay SHALL render exactly two sections: a **Global** section listing the Global keymap, and
one section named for the active scope listing that scope's bindings (grouped by their `group` field).
The overlay SHALL NOT render bindings from inactive scopes; the previous "All hotkeys" union view is
removed.

#### Scenario: Open help from list
- **WHEN** the active scope is `list`, no modal is open, and the user presses `?`
- **THEN** the keyboard help overlay opens showing the Global section and the List section only

#### Scenario: Open help from reader
- **WHEN** the active scope is `reader`, no modal is open, and the user presses `?`
- **THEN** the keyboard help overlay opens showing the Global section and the Reader section only;
  list-scope bindings (such as `/`, `c`, `g i`) are not rendered

#### Scenario: Open help from compose
- **WHEN** the active scope is `compose` and the user presses `?` while focus is not in a text input
- **THEN** the keyboard help overlay opens showing the Global section and the Compose section only

#### Scenario: Escape closes help
- **WHEN** the keyboard help overlay is open and the user presses `Escape`
- **THEN** the keyboard help overlay closes and the underlying scope becomes active again

#### Scenario: ? toggles help closed
- **WHEN** the keyboard help overlay is open and the user presses `?`
- **THEN** the keyboard help overlay closes

#### Scenario: ? suppressed in text inputs
- **WHEN** focus is in an `input` or `textarea` and the user presses `?`
- **THEN** the character is typed and the keyboard help overlay does not open

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
Inside the reader, `j`/`↓` and `k`/`↑` SHALL move to the next/previous message across the **entire folder**, not just the loaded page. When the open message is the last loaded message of the current page and a later page exists, `j`/`↓` SHALL load the next page and open its first message; when the open message is the first message of the current page and an earlier page exists, `k`/`↑` SHALL load the previous page and open its last message. At the absolute last (respectively first) message of the folder, `j`/`↓` (respectively `k`/`↑`) SHALL do nothing. `Escape` SHALL close the reader and return to the list with the current message selected and scrolled into view; because reader navigation may have crossed pages, the list MAY show a different page than the one the reader was opened from. `g g` (g pressed twice within 1.2 s) SHALL scroll the reader message body to the top. `G` SHALL scroll the reader message body to the bottom. `J` SHALL scroll the reader body down by 20 lines (400 px) and `K` SHALL scroll it up by 20 lines; these keys SHALL stop propagation so they do not trigger next/previous message navigation.

#### Scenario: Next message within the current page
- **WHEN** the reader is open on a message that is not the last loaded on the page and the user presses `j` or `↓`
- **THEN** the reader advances to the next message on the same page; the list selected index updates accordingly

#### Scenario: Previous message within the current page
- **WHEN** the reader is open on a message that is not the first on the page and the user presses `k` or `↑`
- **THEN** the reader moves to the previous message on the same page; the list selected index updates accordingly

#### Scenario: Next message crosses to the following page
- **WHEN** the reader is open on the last loaded message of page N, a page N+1 exists, and the user presses `j` or `↓`
- **THEN** the list loads page N+1 and the reader opens the first message of page N+1; the current page becomes N+1

#### Scenario: Previous message crosses to the preceding page
- **WHEN** the reader is open on the first message of page N (N > 1) and the user presses `k` or `↑`
- **THEN** the list loads page N−1 and the reader opens the last message of page N−1; the current page becomes N−1

#### Scenario: Next at the last message of the folder is a no-op
- **WHEN** the reader is open on the last message of the last page and the user presses `j` or `↓`
- **THEN** nothing happens; the same message stays open

#### Scenario: Escape closes reader on the current page
- **WHEN** the reader is open and the user presses `Escape`
- **THEN** the reader closes and the list is visible, showing the page that contains the current message, with that message selected and scrolled into view

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
The keyboard help overlay SHALL include an `f` entry in the active scope's section whenever that scope
declares an `f` binding for hint mode. Specifically, the List scope SHALL declare `f` with description
"open message by hint" and the Reader scope SHALL declare `f` with description "follow link / attachment
by hint". Because help is rendered per active scope (see *Keyboard help toggle*), only the entry for the
active scope SHALL appear at any one time.

#### Scenario: f shown in list help
- **WHEN** the user opens keyboard help while the active scope is `list`
- **THEN** the List section contains an entry for `f` describing "open message by hint"

#### Scenario: f shown in reader help
- **WHEN** the user opens keyboard help while the active scope is `reader`
- **THEN** the Reader section contains an entry for `f` describing "follow link / attachment by hint"

#### Scenario: List f entry not shown in reader help
- **WHEN** the user opens keyboard help while the active scope is `reader`
- **THEN** the List section's `f` entry is not displayed (the List section is not rendered)

### Requirement: Reader quit-to-list key
Inside the reader, `q` SHALL close the reader and return to the message list with the currently-open message selected and scrolled into view, on whatever page that message currently lives (which may differ from the page the reader was opened from). `q` SHALL be documented in the keyboard help under the reader scope.

#### Scenario: q returns to the list focused on the current message
- **WHEN** the reader is open and the user presses `q`
- **THEN** the reader closes, the list is shown on the page containing the current message, and that message's row is selected and scrolled into view

#### Scenario: q after cross-page navigation lands on the new page
- **WHEN** the user has pressed `j` enough times to cross into a later page and then presses `q`
- **THEN** the list is shown on that later page with the current message selected and scrolled into view, not on the page the reader was opened from

#### Scenario: q is listed in keyboard help
- **WHEN** the keyboard help overlay is opened while the reader is the active scope
- **THEN** `q` appears with a "quit to list" description

