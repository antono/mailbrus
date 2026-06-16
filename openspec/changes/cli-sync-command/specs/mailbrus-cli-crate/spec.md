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

### Requirement: `mailbrus sync` reports live progress with a verbosity switch
The `sync` subcommand SHALL report progress as it happens, not only on
completion, and SHALL accept a `--verbose` (`-v`) flag selecting between two
modes. In both modes the CLI SHALL NOT print the password itself, and the final
per-account summary stays on stdout.

**Default (non-verbose):** the CLI SHALL show a single compact progress
indicator of the form `[fetched/total]` that is redrawn in place (on the same
line) as messages are processed, rather than one line per milestone.

**Verbose:** the CLI SHALL print one line per milestone — password resolution
(naming the store), connection, authentication, mailbox selection, new-message
count, each individual message fetched, each file written, each message that
fails to fetch, each deletion, and indexing — and SHALL prefix every such line
with the current `[fetched/total]` counter.

#### Scenario: Default mode shows a redrawn counter
- **WHEN** `mailbrus sync` runs without `--verbose` on a terminal
- **THEN** a single `[fetched/total]` indicator is redrawn in place as messages are processed, not a line per message

#### Scenario: Verbose mode prefixes each line with the counter
- **WHEN** `mailbrus sync --verbose` fetches and stores new messages
- **THEN** the CLI emits a line per message fetched and per file written, each prefixed with the current `[fetched/total]`

#### Scenario: Verbose mode logs individual message failures
- **WHEN** an individual message fails to fetch during `mailbrus sync --verbose`
- **THEN** the CLI emits a line for that failed message (identified where possible) prefixed with `[fetched/total]`

#### Scenario: Password resolution is reported without the secret
- **WHEN** the CLI resolves an account's password
- **THEN** it prints which store the password came from (e.g. `keyring`/`pass`/`plain`) but never the password value

#### Scenario: Errors are reported at the failing step
- **WHEN** a step fails (e.g. authentication or connection)
- **THEN** the CLI reports the failure naming the account and the step, and exits non-zero

### Requirement: `mailbrus-cli` enables the core `sync` feature
`mailbrus-cli/Cargo.toml` SHALL depend on `mailbrus-core` with its `sync`
feature enabled and SHALL declare an async runtime (`tokio`) used by the `sync`
subcommand. The existing read-only subcommands SHALL continue to work without
requiring a running server.

#### Scenario: CLI builds with the sync feature
- **WHEN** user runs `cargo build -p mailbrus-cli`
- **THEN** build succeeds with `mailbrus-core`'s `sync` feature compiled in
