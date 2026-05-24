## MODIFIED Requirements

### Requirement: GET /api/messages/:id — read message
`GET /api/messages/:id` SHALL return the full parsed message as JSON including headers, body, and attachments. Each entry in the `attachments` array SHALL include a `size` field reflecting the actual byte length of the decoded attachment body. A hardcoded `size: 0` is not acceptable.

#### Scenario: Message returned
- **WHEN** client sends `GET /api/messages/abc123`
- **THEN** server responds 200 with a JSON object containing `id`, `headers` (object), `body` (string), `attachments` (array)

#### Scenario: Unknown message id
- **WHEN** the message id does not exist in the notmuch database
- **THEN** server responds 404 with a JSON error body

#### Scenario: Attachment size reflects actual bytes
- **WHEN** a message has an attachment whose decoded body is N bytes
- **THEN** the corresponding `attachments[i].size` field equals N (not 0)
