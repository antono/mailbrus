## ADDED Requirements

### Requirement: data-testid naming follows hierarchical dot notation
Every `data-testid` value in the app SHALL use the pattern `{view}.{element}` where `view` is the kebab-case component/region name and `element` is the role or purpose of the element suffixed with `-btn`, `-input`, `-row`, `-curtain`, `-panel`, `-dialog`, or `-container`. Values SHALL be lowercase kebab with dots as the single separator.

#### Scenario: Button testid has correct shape
- **WHEN** a developer adds `data-testid` to a button in the breadcrumbs region
- **THEN** the value is `breadcrumbs.home-btn`, not `breadcrumbsHomeBtn` or `home-button`

#### Scenario: Invalid format is caught in code review
- **WHEN** a `data-testid` value uses camelCase, underscores, or more than one dot-separated segment beyond `{view}.{element}`
- **THEN** it is rejected as non-conformant during review

---

### Requirement: data-testid is unique within a single view
Top-level view/container testids (e.g. `about.dialog`, `mail-list.container`) SHALL appear at most once in the rendered DOM at any given time. Interactive element testids inside repeated list items (e.g. `mail-list.message-row`, `palette.row`) MAY repeat; tests MUST scope them to a parent container or use `.nth()`.

#### Scenario: Palette rows are scoped to their curtain
- **WHEN** the account picker is open and has three accounts
- **THEN** `page.getByTestId('accounts.curtain').getByTestId('palette.row')` returns exactly three elements

#### Scenario: Two dialogs cannot share a testid
- **WHEN** both the About dialog and the Headers popover are theoretically open
- **THEN** `about.dialog` and `headers-popover.container` are distinct values with no collisions

---

### Requirement: Interactive elements carry their own data-testid
Every `<button>`, `<input>`, `<textarea>`, `<select>`, and clickable element with an `onclick` handler SHALL have its own `data-testid` for direct interaction. Wrapper containers SHALL additionally carry a testid only when used as a Playwright scoping anchor.

#### Scenario: Button is directly targetable
- **WHEN** a Playwright test calls `page.getByTestId('about.close-btn').click()`
- **THEN** the About dialog closes without needing any parent scoping

#### Scenario: Scoping container enables child targeting
- **WHEN** a Playwright test calls `page.getByTestId('mail-list.container').getByTestId('mail-list.message-row').first()`
- **THEN** the first message row in the list is returned unambiguously

---

### Requirement: Palette wrapper components provide curtain testid via prop
The shared `Palette` component SHALL accept a `curtainTestId` string prop and apply it as `data-testid` on the curtain `<div>`. `AccountPicker` SHALL pass `accounts.curtain`, `FolderPicker` SHALL pass `folders.curtain`, `CommandPalette` SHALL pass `commands.curtain`. Palette rows SHALL always carry `data-testid="palette.row"`.

#### Scenario: AccountPicker curtain is selectable
- **WHEN** the account picker is open
- **THEN** `page.getByTestId('accounts.curtain')` returns the curtain element

#### Scenario: FolderPicker curtain is selectable
- **WHEN** the folder picker is open
- **THEN** `page.getByTestId('folders.curtain')` returns the curtain element

#### Scenario: CommandPalette curtain is selectable
- **WHEN** the command palette is open
- **THEN** `page.getByTestId('commands.curtain')` returns the curtain element

---

### Requirement: Complete data-testid reference table is authoritative
The table below is the single source of truth for all `data-testid` values in the app. Any new interactive element added to the UI SHALL be listed here before implementation.

| View | Element | `data-testid` | Type |
|---|---|---|---|
| breadcrumbs | Home / wordmark button | `breadcrumbs.home-btn` | button |
| breadcrumbs | Account button | `breadcrumbs.account-btn` | button |
| breadcrumbs | Folder button | `breadcrumbs.folder-btn` | button |
| mail-list | List container | `mail-list.container` | wrapper |
| mail-list | Message row (repeated) | `mail-list.message-row` | div[onclick] |
| mail-list | Search input | `mail-list.search-input` | input |
| mail-list | Previous page button | `mail-list.prev-btn` | button |
| mail-list | Next page button | `mail-list.next-btn` | button |
| palette | Curtain (set by wrapper) | `accounts.curtain` / `folders.curtain` / `commands.curtain` | wrapper |
| palette | Filter input | `palette.input` | input |
| palette | Row (repeated) | `palette.row` | div[onclick] |
| reader | Reader container | `reader.container` | wrapper |
| reader | Headers toggle button | `reader.headers-btn` | button |
| reader | Unsubscribe button | `reader.unsubscribe-btn` | button |
| compose | Compose container | `compose.container` | wrapper |
| compose | To input | `compose.to-input` | input |
| compose | Subject input | `compose.subject-input` | input |
| compose | Body textarea | `compose.body` | textarea |
| compose | Add Cc button | `compose.add-cc-btn` | button |
| compose | Add Bcc button | `compose.add-bcc-btn` | button |
| compose | Cc input (conditional) | `compose.cc-input` | input |
| compose | Bcc input (conditional) | `compose.bcc-input` | input |
| recipient-input | Suggestion row (repeated) | `recipient-input.suggestion-row` | div[role=option] |
| tweaks | FAB toggle | `tweaks.fab` | button |
| tweaks | Panel container | `tweaks.panel` | wrapper |
| tweaks | Dark mode toggle | `tweaks.dark-toggle` | button[role=switch] |
| tweaks | Accent select | `tweaks.accent-select` | select |
| tweaks | Font radio (repeated) | `tweaks.font-radio` | button[role=radio] |
| tweaks | Density radio (repeated) | `tweaks.density-radio` | button[role=radio] |
| tweaks | Hints bar toggle | `tweaks.hints-toggle` | button[role=switch] |
| tweaks | Notifications toggle | `tweaks.notifications-toggle` | button[role=switch] |
| tweaks | Close button | `tweaks.close-btn` | button |
| about | Dialog container | `about.dialog` | wrapper |
| about | Close button | `about.close-btn` | button |
| headers-popover | Popover container | `headers-popover.container` | wrapper |
| headers-popover | Close button | `headers-popover.close-btn` | button |
| keyboard-help | Dialog container | `keyboard-help.dialog` | wrapper |
| hint-bar | Overflow help button | `hint-bar.overflow-btn` | button |

#### Scenario: Reference table covers all interactive elements
- **WHEN** a developer adds a new button to any Svelte component
- **THEN** a corresponding row is added to this table before the PR is merged
