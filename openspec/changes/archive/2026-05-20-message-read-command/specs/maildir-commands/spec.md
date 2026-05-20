## ADDED Requirements

### Requirement: `message read` is a subcommand of `message`
The `message` command group SHALL include a `read` subcommand in addition to `list` and `search`. It SHALL appear in `mailbrus message --help` output.

#### Scenario: message read appears in message help
- **WHEN** user runs `mailbrus message --help`
- **THEN** stdout lists `read` as an available subcommand, and exit code is 0
