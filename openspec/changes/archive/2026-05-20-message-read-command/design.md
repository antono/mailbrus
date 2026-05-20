## Context

The CLI already exposes `message list` and `message search`. The core library (`mailbrus-core`) provides `MaildirReader::get_message_body(id) -> Result<Vec<u8>>` which reads the raw message file from disk via notmuch. The `MessageNotFound` error variant already exists. The CLI output pattern (`--output text|json|toon`) is uniform across all commands.

## Goals / Non-Goals

**Goals:**
- Add `message read <id>` subcommand with `--output text|json|toon` flag
- Reuse `get_message_body` from core — no new core API needed
- UTF-8 lossy decode for text and toon output; raw bytes as base64 in JSON body field is explicitly out of scope (body is email text)

**Non-Goals:**
- MIME parsing or attachment extraction
- Marking messages as seen
- Any TUI or GUI integration

## Decisions

**D1: Use existing `get_message_body` as-is**

The function returns `Vec<u8>` (raw message file bytes). Converting to `String::from_utf8_lossy` is sufficient for display. Introducing a richer parsed-body type would require a MIME dependency — deferred.

**D2: JSON output structure**

```json
{
  "id": "<message-id>",
  "headers": { "from": "...", "to": [...], "subject": "...", "date": 1234567890 },
  "body": "<raw utf-8 text>"
}
```

Headers come from a separate `list_messages` query (notmuch `id:<id>`) to reuse the existing `Message` struct. Body comes from `get_message_body`. Two core calls, both cheap.

**D3: ID argument is positional, not a flag**

Matches `message search <query>` pattern. No ambiguity since there is no other positional argument on this subcommand.

## Risks / Trade-offs

- **Binary / non-UTF-8 bodies** → Mitigation: `String::from_utf8_lossy` replaces invalid bytes with U+FFFD; acceptable for display.
- **Two core calls per `message read`** (one for headers, one for body) → Mitigation: both are fast local disk reads; no network involved.
- **notmuch ID format** — users must supply the exact notmuch message ID (e.g. `id:xxx`-style strings from `message list` JSON output) → Mitigation: document in `--help`.
