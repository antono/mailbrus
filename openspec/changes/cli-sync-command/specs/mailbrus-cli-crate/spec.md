## ADDED Requirements

### Requirement: `mailbrus sync` subcommand fetches mail from the CLI
The CLI SHALL provide a `sync` subcommand that runs the `mailbrus-core` sync
pipeline to completion and reports the outcome. With no positional argument it
SHALL sync every account in the loaded config; given an account id it SHALL sync
only that account. The command SHALL block until the sync finishes (it does not
return early like the server's `202 Accepted`).

#### Scenario: Sync all configured accounts
- **WHEN** user runs `mailbrus sync`
- **THEN** every account in `$XDG_CONFIG_HOME/mailbrus/config.toml` is synced and the process exits after all of them finish

#### Scenario: Sync a single account
- **WHEN** user runs `mailbrus sync personal`
- **THEN** only the account with id `personal` is synced

#### Scenario: Unknown account id errors
- **WHEN** user runs `mailbrus sync does-not-exist`
- **THEN** the CLI prints an error naming the unknown account and exits non-zero

### Requirement: `mailbrus sync` reports per-account results
On completion the `sync` subcommand SHALL print, per account, the number of
messages fetched, deleted, and indexed. If any account fails to sync the process
SHALL exit non-zero; if all succeed it SHALL exit 0.

#### Scenario: Successful sync prints counts and exits 0
- **WHEN** a sync completes successfully for all targeted accounts
- **THEN** stdout shows each account's fetched/deleted/indexed counts and the exit code is 0

#### Scenario: A failing account yields a non-zero exit
- **WHEN** an account fails to authenticate or connect during `mailbrus sync`
- **THEN** the CLI reports the error for that account and the exit code is non-zero

### Requirement: `mailbrus sync` uses the mailbrus-owned database
The `sync` subcommand SHALL initialize and use the mailbrus-managed notmuch
database at `$XDG_DATA_HOME/mailbrus/` (writing the managed `notmuch.cfg` and
auto-creating the database if absent), exactly as `mailbrus-server` does. It
SHALL NOT read or write the system `~/.notmuch-config`.

#### Scenario: First CLI sync auto-creates the database
- **WHEN** user runs `mailbrus sync` and `$XDG_DATA_HOME/mailbrus/.notmuch/` does not exist
- **THEN** the database is created before fetching, and no manual `notmuch new` is required

### Requirement: `mailbrus-cli` enables the core `sync` feature
`mailbrus-cli/Cargo.toml` SHALL depend on `mailbrus-core` with its `sync`
feature enabled and SHALL declare an async runtime (`tokio`) used by the `sync`
subcommand. The existing read-only subcommands SHALL continue to work without
requiring a running server.

#### Scenario: CLI builds with the sync feature
- **WHEN** user runs `cargo build -p mailbrus-cli`
- **THEN** build succeeds with `mailbrus-core`'s `sync` feature compiled in
