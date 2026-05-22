# sveltekit-ui Delta Spec — settings-panel change

## REMOVED Requirements

### Requirement: Tweaks panel
**Reason**: Replaced by the `settings-panel` capability. A draggable floating FAB is removed in favour of a keyboard-accessible modal opened via the command palette.
**Migration**: All UI preference controls move to `SettingsPanel.svelte`. The ⚙ FAB and `TweaksPanel.svelte` are deleted.

---

## MODIFIED Requirements

### Requirement: Mail list with three density modes
The MailList screen SHALL render messages in one of three density modes: `dense` (one line), `twoline` (default), or `spacious`. The active density SHALL be read from `uiPrefs` state (sourced from IDB via `settings.ts`).

#### Scenario: Dense mode — one line per message
- **WHEN** density is `dense`
- **THEN** each row shows: flag column, from (fixed width), subject (flexible), time (right-aligned) on one line

#### Scenario: Twoline mode
- **WHEN** density is `twoline`
- **THEN** each row shows line 1 (from + time) and line 2 (subject + preview snippet)

#### Scenario: Spacious mode with avatar
- **WHEN** density is `spacious`
- **THEN** each row shows a 32px avatar on the left, from on line 1, subject on line 2, preview on line 3, time top-right

#### Scenario: Unread row styling
- **WHEN** a message has `unread: true`
- **THEN** from and subject are rendered in semibold and the flag column shows a brand-colored bullet

#### Scenario: Active row highlight
- **WHEN** a row is the keyboard cursor position
- **THEN** it has a brand-subtle background and a 2px brand left border

#### Scenario: Mouse hover moves cursor
- **WHEN** user hovers a row with the mouse
- **THEN** the keyboard cursor moves to that row

---

### Requirement: Hint bar
A toggleable keyboard hint bar SHALL appear at the bottom of the list screen (when `hintBar` in `uiPrefs` is `true`). It shows common shortcuts as kbd chips. On narrow viewports where hints overflow, a `?` overflow button appears; clicking it opens KeyboardHelp.

#### Scenario: Hint bar visible when enabled
- **WHEN** `uiPrefs.hintBar` is true and phase is list (no modal)
- **THEN** hint bar is shown at the bottom with shortcut chips

#### Scenario: Hint bar hidden when disabled
- **WHEN** `uiPrefs.hintBar` is false
- **THEN** no hint bar is rendered

---

### Requirement: Command palette (⌘K)
The CommandPalette SHALL list: Switch account, Switch folder, Go to inbox, Go to archive, Compose, Mark all read, Search this folder, Keyboard shortcuts, About, Toggle dark mode, Open settings. Each item shows a right-aligned shortcut hint.

#### Scenario: Command palette opens with ⌘K
- **WHEN** user presses Ctrl+K or ⌘K while on the list phase
- **THEN** CommandPalette opens

#### Scenario: Selecting a command executes it
- **WHEN** user selects "Go to inbox" from the command palette
- **THEN** the INBOX folder of the current account opens

#### Scenario: Open settings command opens settings modal
- **WHEN** user selects "Open settings…" from the command palette
- **THEN** the settings modal opens
