## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Open original HTML in system browser
**Reason**: Superseded by the HTML body part appearing as a `message.html` attachment pill. Clicking that pill with `attachmentAction=open` provides the same capability through the unified attachment flow. The dedicated button, its server route (`POST /messages/:id/open-html`), handler, and API client function are all removed.
**Migration**: Use the `message.html` pill in the attachment row instead.

#### Scenario: Original HTML opens in system browser
- **WHEN** message has an HTML body
- **THEN** no "Open original HTML" button is rendered in the Reader

## ADDED Requirements

### Requirement: `attachmentAction` setting in Tweaks panel
The Tweaks panel SHALL expose an `attachmentAction` toggle (`open` | `download`). The value SHALL be persisted via `writeSetting('attachmentAction', …)` and default to `'open'`. The Settings type SHALL include `attachmentAction: 'open' | 'download'`.

#### Scenario: Default action is open
- **WHEN** no prior setting exists
- **THEN** `getSettings().attachmentAction` returns `'open'`

#### Scenario: Toggle persists across reload
- **WHEN** user changes `attachmentAction` to `download` and reloads the page
- **THEN** `getSettings().attachmentAction` returns `'download'`
