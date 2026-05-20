## Why

The CLI has `message list` and `message search` to find messages, but no way to read the full content of a single message by ID. Adding `message read <id>` closes this gap and makes the CLI a complete read workflow.

## What Changes

- Add `message read <id>` subcommand that accepts a notmuch message ID and outputs the full message (headers + body)
- Output format follows existing pattern: `--output text|json|toon` (default `text`)
- Text output renders headers then body as plain text
- JSON output returns a structured object with `id`, `headers`, and `body` fields
- Error on unknown ID: non-zero exit with descriptive message

## Capabilities

### New Capabilities

- `message-read`: Read a single message by notmuch ID, displaying full headers and body with `--output` format support

### Modified Capabilities

- `maildir-commands`: `message read` is a new subcommand under `message`; spec gains a `message read` section with `--output` requirement

## Impact

- `mailbrus-cli/src/main.rs`: add `MessageCommands::Read` variant with `id: String` and `output: OutputFormat`
- `mailbrus-core::maildir_reader::get_message_body` already exists and returns raw bytes — CLI parses as UTF-8 (lossy) for text output
- `mailbrus-core::error::MailboxError::MessageNotFound` already covers the not-found case

## Non-goals

- MIME decoding / attachment extraction (body is rendered as raw text)
- Marking messages as read/seen
- Replying or composing
