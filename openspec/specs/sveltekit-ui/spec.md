# sveltekit-ui Specification

## Purpose
TBD - created by archiving change sveltekit-ui-design. Update Purpose after archive.
## Requirements
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
The MailList screen SHALL render messages in one of three density modes: `dense` (one line), `twoline` (default), or `spacious`. The active density SHALL be read from Tweaks state. In every density mode the message date SHALL be displayed in human-readable form using `expandTime()`: tokens representing recent messages (minutes, hours, today, yesterday, weekday names) SHALL produce a relative label; tokens representing older messages (month+day format) SHALL produce an absolute `YYYY-MM-DD` string.

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

#### Scenario: Recent date shown as relative label
- **WHEN** a message time token is `5m`, `2h`, `today`, `yesterday`, or a weekday name
- **THEN** the date column shows the expanded human-readable label (e.g. "5 mins ago", "today")

#### Scenario: Older date shown as absolute ISO date
- **WHEN** a message time token is in `Mon DD` or `MMM DD` format
- **THEN** the date column shows the date as `YYYY-MM-DD`

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
Opening a message (Enter or click) SHALL show the Reader fullscreen over the list. Reader SHALL display: breadcrumb status line (reading mode), subject row (bold, reduced font size) with icon row (padlock, unsubscribe, headers), From / To / Date meta block, optional attachment pills, and the message body with signature dimming. The date SHALL appear as a dedicated meta row below the To row — not inline with the subject.

#### Scenario: Subject is bold at reduced size with no inline date
- **WHEN** the reader opens a message
- **THEN** the subject is displayed in bold at a font size smaller than a full heading (e.g. 0.9 rem) and no date is appended inline after the subject text

#### Scenario: Date meta row shows relative label with ISO tooltip for recent messages
- **WHEN** the reader opens a message whose time token is recent (minutes, hours, today, yesterday, or weekday)
- **THEN** a Date row appears below the To row, showing a relative label (e.g. "3 hours ago") wrapped in a `<time>` element whose `title` attribute is the full `YYYY-MM-DD HH:MM` ISO string

#### Scenario: Date meta row shows absolute date for older messages
- **WHEN** the reader opens a message whose time token is in `Mon DD` or `MMM DD` format
- **THEN** the Date row shows an absolute `YYYY-MM-DD` string with no tooltip

#### Scenario: From field shows name and address without duplication
- **WHEN** the sender has no display name and `message.from` equals `message.addr`
- **THEN** the From row shows the address once, not as `email <email>`

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
If a message has `attachments`, the reader SHALL show a horizontally-scrollable row of pill buttons between the meta block and body. Each pill shows: extension badge (PDF, PNG, ZIP, HTML), filename (truncated), file size. The `attachments` array SHALL be sourced from the `GET /api/messages/:id` response (which now includes HTML body parts) and forwarded from `+page.svelte` to `<Reader>` as an explicit prop, then from `<Reader>` to `<Attachments>`. Clicking a pill SHALL trigger the action configured by `attachmentAction` in Settings: `'download'` navigates to the download endpoint; `'open'` POSTs to the open endpoint.

#### Scenario: Attachment row renders for messages with attachments
- **WHEN** message has at least one attachment (including HTML body parts)
- **THEN** a pill row is rendered with one pill per attachment

#### Scenario: Empty attachment list hides row
- **WHEN** message has no attachments and no HTML body parts
- **THEN** no attachment row is rendered

#### Scenario: Attachment data reaches the component
- **WHEN** `GET /api/messages/:id` returns a non-empty `attachments` array
- **THEN** `<Attachments>` receives and renders all entries including HTML parts

#### Scenario: Click with action=download triggers file save
- **WHEN** `attachmentAction` setting is `download` and user clicks a pill
- **THEN** browser initiates a file download from `GET /api/messages/:id/attachments/:index`

#### Scenario: Click with action=open triggers system open
- **WHEN** `attachmentAction` setting is `open` and user clicks a pill
- **THEN** frontend POSTs to `/api/messages/:id/attachments/:index/open`

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
Clicking the wordmark breadcrumb SHALL open a centered About dialog with: Mailbrus logo illustration (max 220px wide, `src/lib/assets/mailbrus.svg` — envelopes mountain with bold red M), mailbrus wordmark at 36px, tagline, GitHub link, license (MIT), version string, and Esc hint.

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

### Requirement: `attachmentAction` setting in Tweaks panel
The Tweaks panel SHALL expose an `attachmentAction` toggle (`open` | `download`). The value SHALL be persisted via `writeSetting('attachmentAction', …)` and default to `'open'`. The Settings type SHALL include `attachmentAction: 'open' | 'download'`.

#### Scenario: Default action is open
- **WHEN** no prior setting exists
- **THEN** `getSettings().attachmentAction` returns `'open'`

#### Scenario: Toggle persists across reload
- **WHEN** user changes `attachmentAction` to `download` and reloads the page
- **THEN** `getSettings().attachmentAction` returns `'download'`

### Requirement: Reader sticky header animates on collapse and expand
When the reader scroll position crosses the threshold that triggers the `is-compact` state, the `.meta` section (From / To / Date rows) SHALL animate out with a smooth transition rather than disappearing instantly. The animation SHALL use CSS transitions on `max-height` and `opacity`. Expanding (scrolling back to top) SHALL animate in with the same transitions.

#### Scenario: Header collapses with animation on scroll
- **WHEN** the user scrolls the reader body past the threshold (scrollTop > 4 px)
- **THEN** the meta rows fade out and slide up over ~200 ms instead of disappearing instantly

#### Scenario: Header expands with animation on scroll back to top
- **WHEN** the user scrolls the reader body back above the threshold
- **THEN** the meta rows fade in and slide down over ~200 ms

#### Scenario: Animation does not cause layout reflow on subsequent messages
- **WHEN** the user opens a new message (scrollTop resets to 0)
- **THEN** the meta section is immediately visible with no lingering transition artifact

---

### Requirement: Plain-text part is preferred on first open
When a message is opened for the first time (no per-sender override and no global mode preference set), and the message has a `text/plain` part (`has_plain = true`), the app SHALL display the message in `text` mode regardless of the server's default render mode. If the message does NOT have a plain part, the existing fallback (server default → `simple`) SHALL apply unchanged.

#### Scenario: Plain part present, no preference set — shows text mode
- **WHEN** a message with `has_plain = true` is opened and no sender override or global mode preference exists
- **THEN** the reader displays the message in text mode (mode toggle shows "Aa" as active)

#### Scenario: No plain part — falls back to server default
- **WHEN** a message with `has_plain = false` is opened and no preference exists
- **THEN** the server's returned mode is used (typically `simple`)

#### Scenario: Sender override still respected
- **WHEN** a message is opened and a per-sender mode override exists
- **THEN** the override takes precedence over the plain-text-first default

#### Scenario: Global mode preference still respected
- **WHEN** a message with `has_plain = true` is opened and a global `email_mode` of `simple` is set
- **THEN** `simple` mode is used (explicit global preference overrides the default)

---

### Requirement: About dialog displays logo
The About dialog (`About.svelte`) SHALL display the Mailbrus logo image above the wordmark. The logo SHALL be rendered at a fixed size (64 × 64 px) with `object-fit: contain`, centered horizontally, with appropriate spacing between the logo and the wordmark below it.

#### Scenario: Logo visible in about dialog
- **WHEN** the user opens the About dialog
- **THEN** the `mailbrus.svg` logo is displayed at 64 × 64 px above the wordmark text

#### Scenario: Logo centered
- **WHEN** the about dialog is open
- **THEN** the logo is horizontally centered within the dialog card

