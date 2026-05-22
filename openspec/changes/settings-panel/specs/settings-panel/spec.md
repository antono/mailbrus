# settings-panel Specification

## ADDED Requirements

### Requirement: Open settings via command palette
The app SHALL expose an "Open settings…" command in the command palette that opens the settings modal. The keyboard shortcut `⌘,` / `Ctrl+,` SHALL also open the modal from the list phase.

#### Scenario: Command palette entry opens settings
- **WHEN** user selects "Open settings…" from the command palette
- **THEN** the settings modal opens

#### Scenario: ⌘, shortcut opens settings
- **WHEN** user presses Ctrl+, or ⌘, while on the list phase
- **THEN** the settings modal opens

---

### Requirement: Settings modal open and close
The settings modal SHALL render as a centered overlay with a backdrop. It SHALL close on Esc or clicking the close button.

#### Scenario: Esc closes the modal
- **WHEN** settings modal is open and user presses Esc
- **THEN** the modal closes

#### Scenario: Close button closes the modal
- **WHEN** user clicks the close button in the settings header
- **THEN** the modal closes

#### Scenario: Backdrop click closes the modal
- **WHEN** user clicks outside the settings modal panel
- **THEN** the modal closes

---

### Requirement: UI preferences — dark mode
The settings panel SHALL provide a toggle to enable or disable dark mode. The change SHALL be applied immediately to `document.documentElement` and persisted.

#### Scenario: Enabling dark mode applies class
- **WHEN** user enables dark mode in settings
- **THEN** `.dark` class is added to `document.documentElement` immediately

#### Scenario: Disabling dark mode removes class
- **WHEN** user disables dark mode in settings
- **THEN** `.dark` class is removed from `document.documentElement` immediately

---

### Requirement: UI preferences — accent color
The settings panel SHALL provide a selector for accent color with options: indigo, violet, blue, green, rose, amber, mono. The change SHALL update `data-accent` on `document.documentElement` immediately and persist.

#### Scenario: Accent change applies immediately
- **WHEN** user selects accent `rose`
- **THEN** `data-accent="rose"` is set on `document.documentElement`

---

### Requirement: UI preferences — font family
The settings panel SHALL provide a segmented control for font family: sans, mono, serif. The change SHALL update `--font-app` CSS variable on `document.documentElement` immediately and persist.

#### Scenario: Font change applies immediately
- **WHEN** user selects `mono` font
- **THEN** `--font-app` is updated to the monospace stack on `document.documentElement`

---

### Requirement: UI preferences — font size
The settings panel SHALL provide a segmented control for font size with four steps: xs, sm, md (default), lg. The change SHALL update `--font-size-app` CSS variable on `document.documentElement` immediately and persist.

The variable values SHALL be:
- xs → 11px
- sm → 12px
- md → 13px
- lg → 15px

#### Scenario: Font size change applies immediately
- **WHEN** user selects font size `lg`
- **THEN** `--font-size-app` is set to `15px` on `document.documentElement`

#### Scenario: Default font size is md
- **WHEN** no font size preference has been saved
- **THEN** `--font-size-app` is set to `13px`

---

### Requirement: UI preferences — density
The settings panel SHALL provide a segmented control for density: dense, twoline, spacious. The change SHALL take effect on the mail list immediately and persist.

#### Scenario: Density change is reflected in mail list
- **WHEN** user changes density to `dense` in settings
- **THEN** mail list switches to single-line row rendering immediately

---

### Requirement: UI preferences — hint bar
The settings panel SHALL provide a toggle for showing or hiding the keyboard hint bar. The change SHALL take effect immediately and persist.

#### Scenario: Disabling hint bar hides it
- **WHEN** user disables hint bar in settings
- **THEN** the hint bar is no longer rendered at the bottom of the list screen

---

### Requirement: UI preferences — push notifications
When the browser supports push notifications, the settings panel SHALL provide a toggle to enable or disable them. The toggle SHALL be hidden when push is not supported.

#### Scenario: Push toggle hidden when unsupported
- **WHEN** `Notification` API or `serviceWorker` is unavailable
- **THEN** no push notifications row is rendered in settings

#### Scenario: Enabling push requests permission
- **WHEN** user enables push notifications
- **THEN** the browser permission prompt is triggered

---

### Requirement: UI preferences persistence in IDB
All UI preferences (dark, accent, font, fontSize, density, hintBar) SHALL be persisted as a single `ui_prefs` key in the IndexedDB settings store via `settings.ts`.

#### Scenario: Preferences survive page reload
- **WHEN** user changes any UI preference and reloads the page
- **THEN** the same preference values are restored from IDB

---

### Requirement: Migration from localStorage
On first load, if `mailbrus-tweaks` exists in `localStorage`, its values SHALL be merged into `ui_prefs` defaults and written to IDB. The `mailbrus-tweaks` key SHALL then be removed from `localStorage`.

#### Scenario: Existing tweaks are migrated once
- **WHEN** `mailbrus-tweaks` is present in localStorage on app load
- **THEN** its values are written to IDB under `ui_prefs` and the localStorage key is deleted

#### Scenario: Migration does not run twice
- **WHEN** `mailbrus-tweaks` has already been removed and app reloads
- **THEN** no migration logic runs and IDB `ui_prefs` is read directly
