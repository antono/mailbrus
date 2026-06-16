## MODIFIED Requirements

### Requirement: Reader screen
Opening a message (Enter or click) SHALL show the Reader fullscreen over the list. Reader SHALL display: breadcrumb status line (reading mode) including a position counter, subject row (bold, reduced font size) with icon row (padlock, unsubscribe, headers), From / To / Date meta block, optional attachment pills, and the message body with signature dimming. The date SHALL appear as a dedicated meta row below the To row — not inline with the subject. The position counter SHALL render three numbers in the form `index / page / total` where `index` is the absolute 1-based position of the open message in the folder (`(page − 1) · perPage + selectedIndex + 1`), `page` is the current page number, and `total` is the total message count of the folder. Each of the three numbers SHALL carry a hover hint via a `title` attribute: the index hint reads "Message <index> of <total>", the page hint reads "Page <page> of <lastPage>", and the total hint reads "<total> messages in <folder>". Closing the reader (via `Escape` or `q`) SHALL return to the list with the current message selected and scrolled into view.

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

#### Scenario: Position counter shows absolute index, page, and total
- **WHEN** the reader opens the 2nd message on page 2 with a per-page size of 25 in a folder of 483 messages
- **THEN** the breadcrumb counter shows `27 / 2 / 483`

#### Scenario: Counter numbers expose hover hints
- **WHEN** the user hovers each number of the counter
- **THEN** the index shows a `title` of "Message 27 of 483", the page shows "Page 2 of 20", and the total shows "483 messages in <folder>"

#### Scenario: Counter updates after cross-page navigation
- **WHEN** reader navigation crosses from page 1 into page 2
- **THEN** the counter's page number and absolute index update to reflect the new page

#### Scenario: j/k cycle messages in reader across pages
- **WHEN** reader is open and user presses j or k
- **THEN** the next or previous message in the folder opens in the reader, loading an adjacent page when the current page edge is reached

#### Scenario: Esc closes reader focused on current message
- **WHEN** user presses Esc in the reader
- **THEN** reader closes and the list is shown on the page containing the current message, with that message selected and scrolled into view
