# sveltekit-ui Specification

## Purpose
TBD - created by archiving change sveltekit-ui-design. Update Purpose after archive.
## Requirements
### Requirement: App shell and phase state machine
The app SHALL implement a four-phase state machine: `account` → `folder` → `list` → (`reader` | `compose`). The current phase SHALL be stored as reactive state in `+page.svelte`. Only one overlay (reader, compose, or palette modal) SHALL be active at a time.

#### Scenario: First load shows account picker
- **WHEN** the app loads with no prior state
- **THEN** the AccountPicker palette is shown fullscreen over a blank background

#### Scenario: Selecting account advances to folder picker
- **WHEN** user selects an account in AccountPicker
- **THEN** phase advances to `folder` and FolderPicker is shown

#### Scenario: Selecting folder shows mail list
- **WHEN** user selects a folder in FolderPicker
- **THEN** phase advances to `list` and MailList is shown for that account/folder

#### Scenario: Esc on list returns to folder picker
- **WHEN** phase is `list` and user presses Esc (no modal open)
- **THEN** FolderPicker opens

---

### Requirement: Palette modal — fuzzy search, numbered rows, keyboard nav
The Palette component SHALL display a centered card with an eyebrow, title, search input, numbered item list, and keyboard-hint footer. Fuzzy filter SHALL match primary + secondary text. Rows 1–9 SHALL be selectable by digit key when the search input is empty.

#### Scenario: Fuzzy filter narrows list
- **WHEN** user types in the palette search input
- **THEN** only items whose primary or secondary text contains the query (case-insensitive) are shown

#### Scenario: Digit key selects row
- **WHEN** search input is empty and user presses `3`
- **THEN** the third visible row is selected

#### Scenario: Arrow keys and Ctrl+N/P move selection
- **WHEN** user presses ArrowDown or Ctrl+N
- **THEN** selection moves to the next row

#### Scenario: Enter confirms selection
- **WHEN** user presses Enter
- **THEN** the currently highlighted row is confirmed and the palette closes

#### Scenario: Esc cancels
- **WHEN** user presses Esc
- **THEN** palette closes without selection

---

### Requirement: Mail list with three density modes
The MailList screen SHALL render messages in one of three density modes: `dense` (one line), `twoline` (default), or `spacious`. The active density SHALL be read from Tweaks state.

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

### Requirement: Global keyboard interactions on mail list
When the list is the active phase and no modal is open, the app SHALL handle: j/↓ (next), k/↑ (prev), Enter (open reader), Esc (folder picker), / (open search), c (compose), G (bottom), g-leader sequences, ⌘K/Ctrl+K (command palette), ? (keyboard help).

#### Scenario: j and k navigate the list
- **WHEN** user presses `j`
- **THEN** selectedIdx increments (clamped to message count)

#### Scenario: g-leader with timeout
- **WHEN** user presses `g`
- **THEN** a leader indicator appears and waits up to 1.2 s for a follow-up key (i, a, s, d, f, A, g)

#### Scenario: g-i jumps to inbox
- **WHEN** user presses `g` then `i` within 1.2 s
- **THEN** the current account's INBOX folder is opened

#### Scenario: ⌘K opens command palette
- **WHEN** user presses Ctrl+K or ⌘K while on the list
- **THEN** CommandPalette opens

---

### Requirement: Inline search bar
Pressing `/` on the list SHALL open an inline search bar above the message list. The bar SHALL filter messages in real time across `from`, `addr`, `subject`, and `preview` fields. Enter commits the filter; Esc clears and closes.

#### Scenario: / opens search bar
- **WHEN** user presses `/`
- **THEN** a search input appears above the list with a brand-colored `/` prompt

#### Scenario: Real-time filtering
- **WHEN** user types in the search bar
- **THEN** the message list immediately shows only matching messages

#### Scenario: Esc closes and clears
- **WHEN** user presses Esc while the search bar is open
- **THEN** the search bar closes and all messages are shown

---

### Requirement: Reader screen
Opening a message (Enter or click) SHALL show the Reader fullscreen over the list. Reader SHALL display: breadcrumb status line (reading mode), subject row with relative-time tag and icon row (padlock, unsubscribe, headers), From/To meta block, optional attachment pills, and the message body with signature dimming.

#### Scenario: Subject shows relative time with ISO tooltip
- **WHEN** reader opens a message
- **THEN** the subject line ends with `[N mins ago]` in muted text with a dotted underline; hovering shows the full ISO timestamp

#### Scenario: Signature dimming
- **WHEN** message body contains a `-- ` line (RFC 3676 separator)
- **THEN** everything from that line onward is rendered at 75% opacity in muted-foreground color

#### Scenario: Padlock icon reflects signature presence
- **WHEN** message body has a `-- ` signature block
- **THEN** a closed padlock in brand color appears; otherwise an open padlock in dim color

#### Scenario: j/k cycle messages in reader
- **WHEN** reader is open and user presses j or k
- **THEN** the next or previous message opens in the reader

#### Scenario: Esc closes reader
- **WHEN** user presses Esc in the reader
- **THEN** reader closes and list is shown at the same cursor position

---

### Requirement: Headers popover
Clicking the headers icon (three-line icon) in the reader SHALL open a popover anchored below the subject row, right-aligned, 640px wide, max 60vh tall, showing synthesized RFC 5322 headers in a two-column mono grid.

#### Scenario: Headers popover opens on click
- **WHEN** user clicks the headers icon
- **THEN** a popover appears with synthesized message headers in monospace two-column layout

#### Scenario: Esc or outside click closes popover
- **WHEN** user presses Esc or clicks outside the popover
- **THEN** popover closes

---

### Requirement: Attachment pills row
If a message has `attachments`, the reader SHALL show a horizontally-scrollable row of pill buttons between the meta block and body. Each pill shows: extension badge (PDF, PNG, ZIP), filename (truncated), file size.

#### Scenario: Attachment row renders for messages with attachments
- **WHEN** message has at least one attachment
- **THEN** a pill row appears between From/To and body

#### Scenario: Empty attachment list hides row
- **WHEN** message has no attachments
- **THEN** no attachment row is rendered

---

### Requirement: Compose screen
Pressing `c` on the list SHALL open the Compose screen fullscreen. Fields: static From (account address), To (recipient autocomplete), optional Cc/Bcc, Subject. Body textarea fills the rest. Breadcrumb right shows live word/char count and send/discard hints.

#### Scenario: To field auto-focuses on open
- **WHEN** Compose screen opens
- **THEN** the To input is focused

#### Scenario: + Cc / + Bcc promote to fields
- **WHEN** user clicks `+ Cc`
- **THEN** a Cc row appears below the To row

#### Scenario: Recipient autocomplete shows suggestions
- **WHEN** user types in the To field
- **THEN** a dropdown shows matching contacts from sample data (by name or address)

#### Scenario: Tab or Enter accepts suggestion
- **WHEN** autocomplete dropdown is open and user presses Tab or Enter
- **THEN** the highlighted contact is inserted into the field and the dropdown closes

#### Scenario: ⌘↵ closes compose (send stub)
- **WHEN** user presses Ctrl+Enter or ⌘+Enter
- **THEN** compose closes (send is a stub in this phase)

#### Scenario: Esc with dirty fields prompts confirmation
- **WHEN** compose has any non-empty field and user presses Esc
- **THEN** a confirmation dialog asks "Discard this draft?" before closing

---

### Requirement: Breadcrumb status line
Every screen (list, reader, compose) SHALL show a status line at the top with: `mailbrus` wordmark (clickable → About dialog), account address (clickable → account picker), folder name (clickable → folder picker), and right-aligned meta content specific to each screen.

#### Scenario: Clicking wordmark opens About
- **WHEN** user clicks the mailbrus wordmark in the breadcrumb
- **THEN** the About dialog opens

#### Scenario: Clicking account opens account picker
- **WHEN** user clicks the account address in the breadcrumb
- **THEN** AccountPicker opens

---

### Requirement: Hint bar
A toggleable keyboard hint bar SHALL appear at the bottom of the list screen (when `hintBar` tweak is `true`). It shows common shortcuts as kbd chips. On narrow viewports where hints overflow, a `?` overflow button appears; clicking it opens KeyboardHelp.

#### Scenario: Hint bar visible when enabled
- **WHEN** `hintBar` tweak is true and phase is list (no modal)
- **THEN** hint bar is shown at the bottom with shortcut chips

#### Scenario: Hint bar hidden when disabled
- **WHEN** `hintBar` tweak is false
- **THEN** no hint bar is rendered

---

### Requirement: Tweaks panel
A draggable Tweaks panel (bottom-right) SHALL allow toggling: dark mode, accent color (indigo/violet/blue/green/rose/amber/mono), font (sans/mono/serif), density (dense/twoline/spacious), hintBar show/hide. Changes SHALL be applied immediately to the UI and persisted to `localStorage`.

#### Scenario: Dark mode toggle applies class to html element
- **WHEN** user toggles dark mode in Tweaks
- **THEN** `.dark` class is added to/removed from `document.documentElement`

#### Scenario: Accent change updates brand tokens
- **WHEN** user changes accent to `rose`
- **THEN** `data-accent="rose"` is set on `document.documentElement` and brand-colored elements update

#### Scenario: Tweaks persist across reload
- **WHEN** user changes any tweak and reloads the page
- **THEN** the same tweak values are restored from `localStorage`

---

### Requirement: Gravatar avatar with fallback initials
In `spacious` density, each message row SHALL show a 32px avatar. Avatar SHALL be resolved from Gravatar using SHA-256 of the normalized sender email via `crypto.subtle.digest`. On error or missing email, a circle with initials over brand-subtle background SHALL be shown. Results SHALL be cached in memory for the session.

#### Scenario: Gravatar URL constructed correctly
- **WHEN** avatar resolves for email `test@example.com`
- **THEN** the `<img>` src is `https://www.gravatar.com/avatar/<sha256hex>?d=identicon&s=128`

#### Scenario: Initials fallback on error
- **WHEN** Gravatar image fails to load
- **THEN** initials extracted from the sender name are shown on a brand-subtle circle

---

### Requirement: Command palette (⌘K)
The CommandPalette SHALL list: Switch account, Switch folder, Go to inbox, Go to archive, Compose, Mark all read, Search this folder, Keyboard shortcuts, About, Toggle dark mode. Each item shows a right-aligned shortcut hint.

#### Scenario: Command palette opens with ⌘K
- **WHEN** user presses Ctrl+K or ⌘K while on the list phase
- **THEN** CommandPalette opens

#### Scenario: Selecting a command executes it
- **WHEN** user selects "Go to inbox" from the command palette
- **THEN** the INBOX folder of the current account opens

---

### Requirement: Scrollbars — `.mb-scroll` utility
Every scrolling region in the app SHALL use the `.mb-scroll` CSS utility class for consistent, Mac-style thin scrollbars. No per-component scrollbar overrides are allowed.

#### Scenario: Scrollbar visible on overflow
- **WHEN** a scroll container overflows
- **THEN** a thin styled scrollbar is visible (not hidden at rest)

#### Scenario: No arrow buttons on scrollbar
- **WHEN** scrollbar renders in Chromium-based WebView
- **THEN** no up/down arrow buttons are shown on the scrollbar

---

### Requirement: About dialog
Clicking the wordmark breadcrumb SHALL open a centered About dialog with: brand logo placeholder (chip with brand dot), mailbrus wordmark at 36px, tagline, GitHub link, license (MIT), version string, and Esc hint.

#### Scenario: About dialog shows version
- **WHEN** About dialog opens
- **THEN** version `0.4.2 (prototype)` is displayed

#### Scenario: Esc closes About
- **WHEN** About dialog is open and user presses Esc
- **THEN** dialog closes

---

### Requirement: Keyboard help overlay
Pressing `?` on the list SHALL open a keyboard help dialog listing all hotkeys organized in sections: Navigation, Actions, Go-to, App, Inside palettes, Reader, Compose.

#### Scenario: ? opens keyboard help
- **WHEN** user presses `?` while on the list (no modal open)
- **THEN** KeyboardHelp dialog opens

#### Scenario: ? or Esc closes keyboard help
- **WHEN** keyboard help is open and user presses `?` or Esc
- **THEN** dialog closes

---

### Requirement: g-leader indicator
When the user presses `g` on the list, a small indicator SHALL appear (bottom-center, monospace, brand-highlighted `g` key) listing available follow-up keys. It SHALL disappear after 1.2 s or when a follow-up key is pressed.

#### Scenario: Leader indicator appears on g press
- **WHEN** user presses `g` on the list
- **THEN** indicator shows: `g — i inbox · a archive · s sent · d drafts · f folder · A account · g top`

#### Scenario: Leader indicator disappears after timeout
- **WHEN** no follow-up key is pressed within 1.2 s
- **THEN** indicator disappears and leader state is cleared

