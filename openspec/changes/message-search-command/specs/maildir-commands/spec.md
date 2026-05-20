## MODIFIED Requirements

### Requirement: `message list` enumerates messages
`mailbrus message list` SHALL list messages from the notmuch database (all messages by default), paginated via `--page` and `--per-page` (default 25 per page, page 1 by default).

#### Scenario: Default text output
- **WHEN** user runs `mailbrus message list`
- **THEN** stdout contains one message summary per line (subject, from, date) for the first 25 messages and exit code is 0

#### Scenario: JSON output
- **WHEN** user runs `mailbrus message list -o json`
- **THEN** stdout is a valid JSON array of message objects (up to 25) and exit code is 0

#### Scenario: Toon output
- **WHEN** user runs `mailbrus message list -o toon`
- **THEN** stdout is valid toon-format output and exit code is 0

#### Scenario: Second page returns next batch
- **WHEN** user runs `mailbrus message list --page 2 --per-page 25`
- **THEN** stdout contains messages 26–50 (newest-first) and exit code is 0

#### Scenario: Custom per-page overrides default
- **WHEN** user runs `mailbrus message list --per-page 50`
- **THEN** stdout contains up to 50 message summaries and exit code is 0

#### Scenario: Per-page help text documents default
- **WHEN** user runs `mailbrus message list --help`
- **THEN** stdout mentions `--per-page` with default value 25 and `--page` flag
