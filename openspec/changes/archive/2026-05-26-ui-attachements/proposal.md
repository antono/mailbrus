## Why

HTML body parts are currently rendered inline, conflating message body with attached content. Users also have no way to act on attachments — clicking a pill does nothing. Both issues make attachment handling incomplete and potentially unsafe for HTML-heavy messages.

## What Changes

- HTML MIME parts are treated as attachments (shown as pills, not rendered inline)
- Clicking an attachment pill triggers a configurable action: **download** or **open locally**
- A new tweak setting `attachmentAction` (`download` | `open`) controls the default click behavior
- Server gains a new endpoint to serve raw attachment bytes for a given message + part index

## Capabilities

### New Capabilities

- `attachment-actions`: Click handler for attachment pills — download or open locally, driven by `attachmentAction` tweak; includes the server endpoint that streams attachment bytes

### Modified Capabilities

- `sveltekit-ui`: Attachment pills row gains click behavior; HTML parts appear as pills; `attachmentAction` added to the Tweaks panel

## Impact

- `mailbrus-server`: New route `GET /api/messages/:id/attachments/:index` serving raw decoded bytes with correct `Content-Type` and `Content-Disposition`
- `mailbrus-core`: MIME parsing must expose HTML parts as attachments alongside non-inline parts
- `src/lib/components/Attachments.svelte`: pill click dispatches download or Tauri `open` based on tweak
- `src/lib/tweaks.ts` (or equivalent): new `attachmentAction` key, default `open`
- No breaking API changes to existing `/api/messages/:id` shape

## Non-goals

- Previewing attachment content inline (images, PDFs)
- Attachment management (delete, forward as attachment)
- Multi-select or bulk download
