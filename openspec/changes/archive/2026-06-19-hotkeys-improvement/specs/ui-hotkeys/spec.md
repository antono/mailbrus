## MODIFIED Requirements

### Requirement: g-leader navigation
`g` SHALL act as a leader key with a 1.2 s timeout. A visual indicator SHALL appear while waiting for the follow-up key. Recognized follow-ups:

| Follow-up | Action |
|-----------|--------|
| `f` | Open folder picker |
| `a` | Open account picker |
| `g` | Top of list (and scroll viewport to top) |

The direct folder-jump follow-ups (`i` Inbox, `s` Sent, `d` Drafts) and the former
Archive jump on `a` are removed; folder switching is done through the folder picker
(`g f`). The account picker is reached with `g a` (formerly `g A`). An unrecognized key
or timeout SHALL cancel the leader with no action.

The leader indicator SHALL reflect the **active scope's** follow-ups, not a fixed
list. On the list scope it SHALL show `f folder · a account · g top` and ALSO the
standalone (non-leader) page hints `h prev-page · l next-page`. While the reader is
open the indicator SHALL instead show the reader follow-ups `f folder · a account ·
g top · h headers` and SHALL NOT show the `h prev-page · l next-page` page hints
(those keys are list-scope only).

#### Scenario: Indicator visible while leader active
- **WHEN** the user presses `g` on the list
- **THEN** the leader indicator appears showing available follow-ups (`f`, `a`, `g`)

#### Scenario: g f opens the folder picker
- **WHEN** the leader is active and the user presses `f`
- **THEN** the folder picker opens and the leader clears

#### Scenario: g a opens the account picker
- **WHEN** the leader is active and the user presses `a`
- **THEN** the account picker opens and the leader clears

#### Scenario: g g jumps to top of list
- **WHEN** the user presses `g` then `g` within 1.2 s on the list
- **THEN** the selected index is set to 0 and the list scroll container scrolls to the top

#### Scenario: Removed follow-ups no longer navigate
- **WHEN** the leader is active and the user presses `i`, `s`, or `d`
- **THEN** the leader clears and no folder navigation occurs

#### Scenario: Timeout cancels leader
- **WHEN** the user presses `g` and does not press a follow-up within 1.2 s
- **THEN** the leader clears and no navigation occurs

#### Scenario: Unrecognized follow-up cancels leader
- **WHEN** the leader is active and the user presses a key that is not a recognized follow-up
- **THEN** the leader clears and no navigation occurs

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
  list-scope bindings (such as `/`, `c`, `g f`) are not rendered

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

## ADDED Requirements

### Requirement: Reader message-action keys
The reader scope keymap SHALL declare bindings for the reader message actions so they
fire only while the reader is the active scope and are surfaced in keyboard help. The
bindings SHALL be: `r` (reply to sender), `R` (reply to all), `F` (forward), `y` (yank
body), `Y` (yank body with headers), and the `g h` leader sequence (toggle headers
menu). These bindings SHALL be subject to the typing guard. The reader's existing `f`
hint-mode binding SHALL be preserved and SHALL NOT collide with `F`. The behavior of
each action is defined in the `reader-message-actions` capability.

#### Scenario: Reader action keys fire only in the reader scope
- **WHEN** the message list is the active scope and the user presses `r`, `R`, `F`, `y`, or `Y`
- **THEN** no reply/forward/yank is triggered (these are reader-scope bindings; `r` on the list still marks read)

#### Scenario: Reader action keys appear in reader help
- **WHEN** the keyboard help overlay is opened while the reader is the active scope
- **THEN** the Reader section lists `r`, `R`, `F`, `y`, `Y`, and `g h` with their descriptions

#### Scenario: Reader action keys suppressed while typing
- **WHEN** focus is in an `input` or `textarea` within the reader and the user presses `y`
- **THEN** the character is typed normally and no yank occurs

#### Scenario: F and f coexist in the reader
- **WHEN** the reader is open and the user presses `F`
- **THEN** the forward action runs and hint mode does not activate; pressing `f` instead activates hint mode

### Requirement: Reader navigation leaders
The reader scope keymap SHALL declare the `g f` (folder picker) and `g a` (account
picker) leader sequences so they work from the reader exactly as they do from the
list. These mirror the list g-leader navigation primitives; the reader's `g g`
(scroll to top) and `g h` (toggle headers) leaders are unaffected and continue to
coexist with them.

#### Scenario: g f opens the folder picker from the reader
- **WHEN** the reader is open and the user presses `g` then `f`
- **THEN** the folder picker opens

#### Scenario: g a opens the account picker from the reader
- **WHEN** the reader is open and the user presses `g` then `a`
- **THEN** the account picker opens
