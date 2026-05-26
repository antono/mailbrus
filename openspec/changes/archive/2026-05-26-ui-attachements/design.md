## Context

Attachment pills render in the Reader but clicking them does nothing (`e.preventDefault()`). HTML body parts are extracted into `parsed.html_body` and never appear in the `attachments` array. The server has no endpoint to serve raw attachment bytes, but already has the `open::that_detached` pattern from `open-html`.

Current data shape for attachments:
```json
{"name": "file.pdf", "size": 1234, "mime": "application/pdf"}
```
No stable index — the frontend cannot reference a specific part for download/open.

## Goals / Non-Goals

**Goals:**
- HTML MIME parts appear as attachment pills alongside other attachments
- Clicking a pill either downloads the file or opens it with the system default app
- `attachmentAction` (`download` | `open`) setting persists in `Settings` (IDB-backed)
- Two server endpoints: one for raw bytes (download), one for system-open

**Non-Goals:**
- Inline preview of any attachment type
- Bulk download or multi-select
- Changing how HTML body is rendered when user reads the message

## Decisions

### 1. Stable part index in attachment JSON

Add `part_index: usize` to each attachment entry emitted by `extract_message` in `mime.rs`. This lets the download/open endpoints address a specific MIME part without re-parsing header logic in the handler.

**Alternative**: use filename as key — rejected because filenames collide and can be absent.

### 2. HTML part as attachment entry

After filling the normal `attachments` vec from `msg.attachments`, iterate `msg.html_body` parts and push each as an additional entry:
```json
{"name": "message.html", "size": N, "mime": "text/html", "part_index": K}
```
`mail_parser` keeps `html_body` part IDs separate from `attachments`; we bridge the gap in `extract_message`.

**Alternative**: separate `html_parts` array in API response — rejected to keep the frontend model uniform.

### 3. Two server endpoints

- `GET /api/messages/:id/attachments/:index` — returns raw decoded bytes with `Content-Type` from MIME metadata and `Content-Disposition: attachment; filename=<name>`. The frontend navigates here to trigger a browser save-as.
- `POST /api/messages/:id/attachments/:index/open` — writes decoded bytes to `$TMPDIR/<safe_id>_<name>`, calls `open::that_detached`, returns `{"ok": true}`. Mirrors `open-html` handler pattern.

**Alternative**: single endpoint with query param `?action=open` — rejected; GET should not have side effects.

### 4. Setting stored in Settings (IDB)

Add `attachmentAction: 'download' | 'open'` to the `Settings` type in `settings.ts` with default `'open'`. Expose a toggle in the Tweaks panel. This follows the existing `EmailMode` and `SortOrder` pattern.

**Alternative**: localStorage-only tweak — rejected because all other behavior settings have migrated to IDB-backed `Settings`.

### 5. Frontend click dispatch

`Attachments.svelte` receives `onAttachmentClick` callback from `Reader`. The callback reads `getSettings().attachmentAction`:
- `'download'`: create a temporary `<a href=… download>` and programmatically click it (standard browser download)
- `'open'`: POST to the open endpoint

## Risks / Trade-offs

- [HTML-as-attachment + inline HTML reader] If a message has an HTML body, it now appears both as a rendered view (EmailMode=html) AND as a pill. This is intentional but may surprise users who expect one or the other. → Mitigate with clear pill label "message.html".
- [Temp file accumulation] Open endpoint writes to tmpdir without cleanup. → Acceptable for v1; OS clears tmpdir on reboot. Add cleanup as a follow-up.
- [part_index stability] `mail_parser` part IDs are positional — they're stable for a given raw message but not meaningful across messages. The index is only used in the same request cycle, so this is fine.

## Migration Plan

No schema migration. The `part_index` field is additive to the existing attachment JSON — existing clients that ignore unknown keys are unaffected.
