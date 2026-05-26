## ADDED Requirements

### Requirement: HTML body parts appear in the attachments array
`extract_message` in `mime.rs` SHALL append each HTML body part from `msg.html_body` to the `attachments` vec with `name: "message.html"`, correct `size`, `mime: "text/html"`, and a stable `part_index`.

#### Scenario: HTML-only message produces one attachment entry
- **WHEN** a message has an HTML body part and no other attachments
- **THEN** `GET /api/messages/:id` returns `attachments` with exactly one entry: `{"name":"message.html","mime":"text/html","size":N,"part_index":K}` where N > 0

#### Scenario: Mixed message keeps both kinds
- **WHEN** a message has an HTML body and a PDF attachment
- **THEN** `attachments` contains both entries (PDF + message.html), each with a distinct `part_index`

#### Scenario: Plain-text-only message produces no html attachment
- **WHEN** a message has only a plain-text body
- **THEN** `attachments` does not contain any entry with `mime: "text/html"`

### Requirement: Every attachment entry carries a stable part_index
`GET /api/messages/:id` SHALL include a `part_index` integer field on every object in the `attachments` array. The index SHALL address the corresponding MIME part in the raw message.

#### Scenario: part_index present on regular attachment
- **WHEN** a message has a PDF attachment
- **THEN** the attachment object includes `"part_index": <integer>`

### Requirement: `GET /api/messages/:id/attachments/:index` serves raw bytes
The server SHALL respond with the decoded bytes of the MIME part at `part_index`, setting `Content-Type` from the part's MIME type and `Content-Disposition: attachment; filename=<name>`.

#### Scenario: Download existing attachment
- **WHEN** client sends `GET /api/messages/:id/attachments/2`
- **THEN** server responds 200 with raw bytes, `Content-Type: application/pdf` (or appropriate type), and `Content-Disposition: attachment; filename="report.pdf"`

#### Scenario: Unknown part index returns 404
- **WHEN** client sends `GET /api/messages/:id/attachments/999`
- **THEN** server responds 404

#### Scenario: Unknown message id returns 404
- **WHEN** client sends `GET /api/messages/no-such-id/attachments/0`
- **THEN** server responds 404

### Requirement: `POST /api/messages/:id/attachments/:index/open` opens with system app
The server SHALL decode the MIME part, write it to a temp file under `$TMPDIR`, and call `open::that_detached` on the resulting path. On success it SHALL return `{"ok": true, "path": "<absolute path>"}`.

#### Scenario: Open PDF with system viewer
- **WHEN** client POSTs to `/api/messages/:id/attachments/2/open`
- **THEN** server writes a temp file and returns `{"ok":true,"path":"<tmp>/…pdf"}`

#### Scenario: Unknown part index returns 404
- **WHEN** client POSTs to `/api/messages/:id/attachments/999/open`
- **THEN** server responds 404
