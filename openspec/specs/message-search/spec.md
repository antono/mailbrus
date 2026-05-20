## Purpose

Define the `message search` subcommand exposed by the `mailbrus` CLI binary, enabling notmuch-query-based message filtering with pagination and output format support.

## Requirements

### Requirement: `message search` filters messages by notmuch query
`mailbrus message search "<query>"` SHALL accept a notmuch query string as a positional argument and return only messages matching that query, paginated via `--page` and `--per-page`.

#### Scenario: Basic query returns matching messages
- **WHEN** user runs `mailbrus message search "from:alice"`
- **THEN** stdout contains only messages where the from field matches "alice", exit code is 0

#### Scenario: JSON output
- **WHEN** user runs `mailbrus message search "subject:invoice" -o json`
- **THEN** stdout is a valid JSON array of message objects and exit code is 0

#### Scenario: Toon output
- **WHEN** user runs `mailbrus message search "tag:inbox" -o toon`
- **THEN** stdout is valid toon-format output and exit code is 0

#### Scenario: Empty result set
- **WHEN** user runs `mailbrus message search "subject:zzznomatch"`
- **THEN** stdout is empty (or empty JSON array / toon), exit code is 0

#### Scenario: Invalid notmuch query
- **WHEN** user runs `mailbrus message search ""`
- **THEN** exit code is non-zero and stderr contains an error message

#### Scenario: Pagination selects correct page
- **WHEN** user runs `mailbrus message search "*" --page 2 --per-page 10`
- **THEN** stdout contains messages 11–20 (by newest-first order) and exit code is 0

#### Scenario: Per-page help text documents default
- **WHEN** user runs `mailbrus message search --help`
- **THEN** stdout mentions `--per-page` with default value 25 and `--page` flag

---

### Requirement: `message search` accepts `-o/--output` format flag
`mailbrus message search` SHALL accept `-o <format>` / `--output <format>` with values `text`, `json`, `toon`. Default is `text`.

#### Scenario: Default text format
- **WHEN** user runs `mailbrus message search "tag:inbox"` without `-o`
- **THEN** stdout contains one message summary per line (from | subject | date) and exit code is 0
