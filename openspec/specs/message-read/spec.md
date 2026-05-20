## Purpose

Define the `message read` subcommand that displays full message content from the notmuch database.

## Requirements

### Requirement: `message read <id>` displays full message content
The CLI SHALL accept `mailbrus message read <id>` where `<id>` is the notmuch message ID string. It SHALL output the full message headers and body. Exit code SHALL be 0 on success.

#### Scenario: Read existing message in text format
- **WHEN** user runs `mailbrus message read <valid-id>`
- **THEN** stdout contains the message headers (From, Subject, Date) followed by the raw message body, and exit code is 0

#### Scenario: Read existing message in JSON format
- **WHEN** user runs `mailbrus message read <valid-id> --output json`
- **THEN** stdout is valid JSON with keys `id`, `headers` (object with `from`, `to`, `subject`, `date`), and `body` (string), and exit code is 0

#### Scenario: Read existing message in toon format
- **WHEN** user runs `mailbrus message read <valid-id> --output toon`
- **THEN** stdout is valid toon-encoded data representing the same structure as JSON output, and exit code is 0

---

### Requirement: Unknown message ID exits non-zero
When the provided `<id>` does not match any message in the notmuch database, the CLI SHALL exit with a non-zero exit code and print a descriptive error to stderr.

#### Scenario: Message not found
- **WHEN** user runs `mailbrus message read nonexistent-id-xyz`
- **THEN** exit code is non-zero and stderr contains a message referencing the unknown ID

---

### Requirement: `--output` flag is accepted
`message read` SHALL accept `-o <format>` / `--output <format>` with values `text`, `json`, `toon`. Default is `text`.

#### Scenario: Invalid output format is rejected
- **WHEN** user runs `mailbrus message read <id> --output xml`
- **THEN** exit code is non-zero and stderr contains an error message naming the invalid value

---

### Requirement: `--help` describes the command and its arguments
`mailbrus message read --help` SHALL print a description of the subcommand, the `<id>` positional argument, and the `--output` flag.

#### Scenario: Help flag
- **WHEN** user runs `mailbrus message read --help`
- **THEN** stdout contains the word `read`, the argument name `id`, and `--output`, and exit code is 0
