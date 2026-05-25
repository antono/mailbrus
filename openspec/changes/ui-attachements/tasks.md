## 1. Server — MIME part indexing

- [x] 1.1 Add `part_index: usize` field to each entry in the `attachments` vec in `extract_message` (`mime.rs`) — use the `pid` value from `msg.attachments`
- [x] 1.2 Append HTML body parts from `msg.html_body` to `attachments` with `name: "message.html"`, correct `size`, `mime: "text/html"`, and their `pid` as `part_index`
- [x] 1.3 Update `Attachment` serialisation in `build_body_response` to include `part_index` in the JSON output
- [x] 1.4 Update unit tests in `mime.rs` to assert `part_index` is present and HTML parts appear in attachments

## 2. Server — Download endpoint

- [x] 2.1 Add handler `get_attachment` in `handlers/messages.rs`: extract message raw bytes, re-parse with `mail_parser`, locate part at `part_index`, return bytes with correct `Content-Type` and `Content-Disposition: attachment; filename=<name>`
- [x] 2.2 Register route `GET /messages/:id/attachments/:index` in `main.rs`
- [x] 2.3 Return 404 when message not found or index out of range

## 3. Server — Open-locally endpoint

- [x] 3.1 Add handler `open_attachment` in `handlers/messages.rs`: decode part bytes, write to `$TMPDIR/<safe_id>_<name>`, call `open::that_detached`, return `{"ok":true,"path":"…"}`
- [x] 3.2 Register route `POST /messages/:id/attachments/:index/open` in `main.rs`
- [x] 3.3 Return 404 when message not found or index out of range

## 4. Settings — attachmentAction

- [x] 4.1 Add `attachmentAction: 'open' | 'download'` to the `Settings` type in `settings.ts` with default value `'open'`

## 5. Frontend — Attachments component

- [x] 5.1 Update `Attachments.svelte` to accept `messageId: string` and `onAttachmentClick` callback (or derive click logic internally via `getSettings`)
- [x] 5.2 Implement pill `onclick`: read `getSettings().attachmentAction`; if `'download'`, create temp `<a href="/api/messages/:id/attachments/:index" download>` and click it; if `'open'`, POST to `/api/messages/:id/attachments/:index/open`
- [x] 5.3 Update `Reader.svelte` (or wherever `<Attachments>` is mounted) to pass `messageId` down

## 6. Frontend — Tweaks panel

- [x] 6.1 Add `attachmentAction` toggle to the Tweaks panel component (`open` / `download`), wired to `writeSetting('attachmentAction', …)`

## 7. Remove open-html button and dead code

- [x] 7.1 Remove the "Open original HTML" button from `Reader.svelte` (`data-testid="reader.open-html-btn"` and its surrounding conditional)
- [x] 7.2 Remove `openHtml` function from `src/lib/api.ts`
- [x] 7.3 Remove `open_message_html` handler from `mailbrus-server/src/handlers/messages.rs`
- [x] 7.4 Remove route `POST /messages/{id}/open-html` from `mailbrus-server/src/main.rs`
- [x] 7.5 Delete any spec scenarios or tests asserting the "Open original HTML" button is present

## 8. E2E tests

- [x] 8.1 Write E2E test: message with PDF attachment — pill renders, click with `attachmentAction=download` triggers network request to download endpoint
- [x] 8.2 Write E2E test: HTML-body message — `message.html` pill appears in attachment row
- [x] 8.3 Write E2E test: `attachmentAction` toggle in Tweaks persists across page reload
- [x] 8.4 Confirm no test references `reader.open-html-btn` testid or the `/open-html` route

## 9. Validation and cleanup

- [x] 9.1 Run `cargo check` and fix all compilation warnings in server crate
- [x] 9.2 Run `deno task test:e2e` — fix any regressions introduced by this change
- [x] 9.3 Run `deno task build` — confirm SPA builds without type errors or warnings
