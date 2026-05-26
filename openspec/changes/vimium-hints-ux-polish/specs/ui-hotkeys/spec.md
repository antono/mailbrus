## ADDED Requirements

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
