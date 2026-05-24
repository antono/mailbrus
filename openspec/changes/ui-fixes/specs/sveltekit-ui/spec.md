## MODIFIED Requirements

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

### Requirement: Attachment pills row
If a message has `attachments`, the reader SHALL show a horizontally-scrollable row of pill buttons between the meta block and body. Each pill shows: extension badge (PDF, PNG, ZIP), filename (truncated), file size. The `attachments` array SHALL be sourced from the `GET /api/messages/:id` response and forwarded from `+page.svelte` to `<Reader>` as an explicit prop, then from `<Reader>` to `<Attachments>`.

#### Scenario: Attachment row renders for messages with attachments
- **WHEN** message has at least one attachment
- **THEN** a pill row appears between From/To and body

#### Scenario: Empty attachment list hides row
- **WHEN** message has no attachments
- **THEN** no attachment row is rendered

#### Scenario: Attachment data reaches the component
- **WHEN** `GET /api/messages/:id` returns a non-empty `attachments` array
- **THEN** the pill row is visible in the reader and each pill shows the correct filename and size
