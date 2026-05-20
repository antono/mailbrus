## Why

The CLI has `message list` but no way to filter messages by query, forcing users to pipe through external tools. Adding `message search` exposes notmuch's query language directly from the CLI and standardizes pagination across all message commands.

## What Changes

- Add `message search "<notmuch-query>"` subcommand that accepts any valid notmuch query string and returns matching messages
- Add `--page <number>` and `--per-page <number>` (default 25) pagination flags to `message search` and `message list`
- Update command help text and docs to document pagination flags on all message queries
- Output format matches existing commands: `--output text|json|toon`

## Capabilities

### New Capabilities
- `message-search`: Search messages by notmuch query with paginated output, consistent output formats, and documented pagination flags

### Modified Capabilities
- `maildir-commands`: `message list` gains `--page` and `--per-page` pagination flags (spec-level behavior change — previously hardcoded limit of 100)

## Impact

- `mailbrus-cli/src/main.rs`: add `MessageCommands::Search` variant, add `Page` / `PerPage` args to `MessageCommands::List`
- `mailbrus-core`: `list_messages` already accepts `PaginationOpts`; no core changes expected
- No breaking changes to existing `message list` output — pagination defaults to page 1, 25 per page (behaviour change from hardcoded 100)
