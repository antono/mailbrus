## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Jump to list extremes
`G` (shift-g) SHALL move the selection to the last message AND scroll the list viewport to the bottom. The `g g` leader sequence SHALL move the selection to the first message AND scroll the list viewport to the top.

#### Scenario: Jump to bottom
- **WHEN** the user presses `G` on the list
- **THEN** the selected index is set to the last message index and the list scroll container scrolls to the bottom

#### Scenario: Jump to top via leader
- **WHEN** the user presses `g` then `g` within 1.2 s on the list
- **THEN** the selected index is set to 0 and the list scroll container scrolls to the top

---

### Requirement: Reader navigation keys
Inside the reader, `j`/`↓` and `k`/`↑` SHALL cycle to the next/previous message in the current list. `Escape` SHALL close the reader and return to the list at the same cursor position. `g g` (g pressed twice within 1.2 s) SHALL scroll the reader message body to the top. `G` SHALL scroll the reader message body to the bottom.

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
