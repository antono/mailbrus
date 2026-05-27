## ADDED Requirements

### Requirement: Active scope and scope stack
The frontend SHALL maintain a single ordered stack of *active scopes* where each scope is one of
`list`, `reader`, `compose`, `palette`, `modal`, or `hint`. The top of the stack is the active scope.
Every view SHALL push its scope when it mounts and pop the same scope when it unmounts. The stack SHALL
never be empty; `list` is the base scope at app boot.

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

#### Scenario: Mismatched pop fails loudly in development
- **WHEN** a view attempts to pop a scope that is not the current top of the stack
- **THEN** the pop SHALL throw in development builds and SHALL be logged as an error in release builds

---

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
| `?` | Toggle keyboard help (per the *Per-view keyboard help* requirement) |
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

## MODIFIED Requirements

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
