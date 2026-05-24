## MODIFIED Requirements

### Requirement: App shell and phase state machine
The app SHALL implement a four-phase state machine: `account` → `folder` → `list` → (`reader` | `compose`). The current phase SHALL be stored as reactive state in `+page.svelte`. Only one overlay (reader, compose, or palette modal) SHALL be active at a time.

Routable phase transitions (selecting a folder, opening a message, running a search) SHALL be reflected in the browser URL, and the initial phase SHALL be derived from the URL on load rather than always starting at `account` (see the `ui-path-routing` capability). Compose remains an overlay and is not encoded in the URL.

#### Scenario: First load at root shows account picker
- **WHEN** the app loads with URL path `/` and no prior view
- **THEN** the AccountPicker palette is shown fullscreen over a blank background

#### Scenario: Selecting account advances to folder picker
- **WHEN** user selects an account in AccountPicker
- **THEN** phase advances to `folder` and FolderPicker is shown

#### Scenario: Selecting folder shows mail list and updates the URL
- **WHEN** user selects a folder in FolderPicker
- **THEN** phase advances to `list`, MailList is shown for that account/folder, and the URL becomes `/folder/<folderId>`

#### Scenario: Esc on list returns to folder picker and updates the URL
- **WHEN** phase is `list` and user presses Esc (no modal open)
- **THEN** FolderPicker opens and the URL returns to `/`
