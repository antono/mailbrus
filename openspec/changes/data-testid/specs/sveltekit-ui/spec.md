## ADDED Requirements

### Requirement: Breadcrumb buttons expose data-testid
The breadcrumbs component SHALL set `data-testid="breadcrumbs.home-btn"` on the wordmark/home button, `data-testid="breadcrumbs.account-btn"` on the account button, and `data-testid="breadcrumbs.folder-btn"` on the folder button.

#### Scenario: Home button is targetable by testid
- **WHEN** the breadcrumb bar is rendered
- **THEN** `page.getByTestId('breadcrumbs.home-btn')` returns exactly one element

#### Scenario: Account button is targetable by testid
- **WHEN** the breadcrumb bar is rendered
- **THEN** `page.getByTestId('breadcrumbs.account-btn')` returns exactly one element

#### Scenario: Folder button is targetable by testid
- **WHEN** the breadcrumb bar is rendered
- **THEN** `page.getByTestId('breadcrumbs.folder-btn')` returns exactly one element

---

### Requirement: Mail list and message rows expose data-testid
`MailList` SHALL set `data-testid="mail-list.container"` on the list root, `data-testid="mail-list.message-row"` on each message row `<div>`, `data-testid="mail-list.search-input"` on the search input, `data-testid="mail-list.prev-btn"` and `data-testid="mail-list.next-btn"` on pagination buttons.

#### Scenario: Message rows are countable by testid
- **WHEN** a folder with 5 messages is open
- **THEN** `page.getByTestId('mail-list.message-row')` returns 5 elements

#### Scenario: Pagination buttons are targetable
- **WHEN** the mail list renders with multiple pages
- **THEN** `page.getByTestId('mail-list.next-btn')` and `page.getByTestId('mail-list.prev-btn')` each return one element

---

### Requirement: Palette exposes data-testid via curtainTestId prop
`Palette` SHALL accept a `curtainTestId: string` prop and apply it as `data-testid` on the curtain element. The filter input SHALL carry `data-testid="palette.input"`. Each row SHALL carry `data-testid="palette.row"`. `AccountPicker` passes `"accounts.curtain"`, `FolderPicker` passes `"folders.curtain"`, `CommandPalette` passes `"commands.curtain"`.

#### Scenario: Account picker rows are scoped correctly
- **WHEN** the account picker is open with two accounts
- **THEN** `page.getByTestId('accounts.curtain').getByTestId('palette.row')` returns 2 elements

#### Scenario: Palette input is targetable
- **WHEN** any palette variant is open
- **THEN** `page.getByTestId('palette.input')` returns the focused filter input

---

### Requirement: Reader container and action buttons expose data-testid
`Reader` SHALL set `data-testid="reader.container"` on the root element, `data-testid="reader.headers-btn"` on the headers toggle, and `data-testid="reader.unsubscribe-btn"` on the unsubscribe button when present.

#### Scenario: Reader container is targetable
- **WHEN** a message is open in the reader
- **THEN** `page.getByTestId('reader.container')` is visible

#### Scenario: Unsubscribe button is targetable when present
- **WHEN** the open message is a mailing list message with an unsubscribe header
- **THEN** `page.getByTestId('reader.unsubscribe-btn')` is visible

---

### Requirement: Compose form fields and buttons expose data-testid
`Compose` SHALL set `data-testid="compose.container"` on the form root, and individual testids on each field and button per the conventions reference table.

#### Scenario: To input is targetable
- **WHEN** the compose form is open
- **THEN** `page.getByTestId('compose.to-input')` is focused and accepts text

#### Scenario: Cc/Bcc inputs appear with correct testids
- **WHEN** the user clicks the Add Cc button
- **THEN** `page.getByTestId('compose.cc-input')` becomes visible

---

### Requirement: TweaksPanel controls expose data-testid
`TweaksPanel` SHALL set `data-testid="tweaks.fab"` on the FAB, `data-testid="tweaks.panel"` on the panel container, and individual testids on every control per the conventions reference table.

#### Scenario: FAB is targetable when panel is closed
- **WHEN** the tweaks panel is closed
- **THEN** `page.getByTestId('tweaks.fab')` is visible and clickable

#### Scenario: Dark mode toggle is targetable
- **WHEN** the tweaks panel is open
- **THEN** `page.getByTestId('tweaks.dark-toggle')` is visible

#### Scenario: Font radios are selectable by index
- **WHEN** the tweaks panel is open
- **THEN** `page.getByTestId('tweaks.font-radio')` returns 3 elements (sans, mono, serif)

---

### Requirement: About dialog exposes data-testid
`About` SHALL set `data-testid="about.dialog"` on the dialog container and `data-testid="about.close-btn"` on the close button.

#### Scenario: About dialog is targetable
- **WHEN** the About dialog is open
- **THEN** `page.getByTestId('about.dialog')` is visible

#### Scenario: Close button closes the dialog
- **WHEN** a test calls `page.getByTestId('about.close-btn').click()`
- **THEN** the About dialog is no longer visible

---

### Requirement: HeadersPopover exposes data-testid
`HeadersPopover` SHALL set `data-testid="headers-popover.container"` on the root and `data-testid="headers-popover.close-btn"` on the close button.

#### Scenario: Headers popover close button is targetable
- **WHEN** the headers popover is open
- **THEN** `page.getByTestId('headers-popover.close-btn').click()` closes it

---

### Requirement: KeyboardHelp dialog exposes data-testid
`KeyboardHelp` SHALL set `data-testid="keyboard-help.dialog"` on the dialog container.

#### Scenario: Keyboard help dialog is targetable
- **WHEN** the user presses `?`
- **THEN** `page.getByTestId('keyboard-help.dialog')` becomes visible

---

### Requirement: HintBar overflow button exposes data-testid
`HintBar` SHALL set `data-testid="hint-bar.overflow-btn"` on the `?` overflow button.

#### Scenario: Overflow button is targetable
- **WHEN** the hint bar is visible and hints overflow
- **THEN** `page.getByTestId('hint-bar.overflow-btn')` is visible
