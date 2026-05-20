## ADDED Requirements

### Requirement: `maildir list` enumerates configured maildirs
`mailbrus maildir list` SHALL print the maildir root paths known to notmuch (from its database config).

#### Scenario: Default text output
- **WHEN** user runs `mailbrus maildir list`
- **THEN** stdout contains one maildir path per line and exit code is 0

#### Scenario: JSON output
- **WHEN** user runs `mailbrus maildir list -o json`
- **THEN** stdout is a valid JSON array of path strings and exit code is 0

#### Scenario: Toon output
- **WHEN** user runs `mailbrus maildir list -o toon`
- **THEN** stdout is valid toon-format output and exit code is 0

---

### Requirement: `folder list` enumerates folders within a maildir
`mailbrus folder list` SHALL list all Maildir++ subfolder names under the first (or specified) maildir root.

#### Scenario: Default text output
- **WHEN** user runs `mailbrus folder list`
- **THEN** stdout contains one folder name per line and exit code is 0

#### Scenario: JSON output
- **WHEN** user runs `mailbrus folder list -o json`
- **THEN** stdout is a valid JSON array of folder name strings and exit code is 0

#### Scenario: Toon output
- **WHEN** user runs `mailbrus folder list -o toon`
- **THEN** stdout is valid toon-format output and exit code is 0

---

### Requirement: `message list` enumerates messages
`mailbrus message list` SHALL list messages from the notmuch database (all messages by default).

#### Scenario: Default text output
- **WHEN** user runs `mailbrus message list`
- **THEN** stdout contains one message summary per line (subject, from, date) and exit code is 0

#### Scenario: JSON output
- **WHEN** user runs `mailbrus message list -o json`
- **THEN** stdout is a valid JSON array of message objects and exit code is 0

#### Scenario: Toon output
- **WHEN** user runs `mailbrus message list -o toon`
- **THEN** stdout is valid toon-format output and exit code is 0

---

### Requirement: `-o/--output` flag is accepted by all list subcommands
Every `list` subcommand SHALL accept `-o <format>` / `--output <format>` with values `text`, `json`, `toon`. Default is `text`.

#### Scenario: Invalid format is rejected
- **WHEN** user runs any list subcommand with `-o xml`
- **THEN** exit code is non-zero and stderr contains an error message naming the invalid value

---

### Requirement: `--version` prints the binary version
`mailbrus --version` SHALL print the version string derived from `mailbrus-cli/Cargo.toml`.

#### Scenario: Version flag
- **WHEN** user runs `mailbrus --version`
- **THEN** stdout contains the semver string (e.g. `mailbrus 0.1.0`) and exit code is 0
