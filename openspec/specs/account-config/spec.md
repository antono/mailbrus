# account-config Specification

## Purpose
TBD - created by archiving change imap-synchronization. Update Purpose after archive.
## Requirements
### Requirement: Account config is loaded from a TOML file at an XDG path
`mailbrus-core` SHALL load account definitions from a TOML file resolved as
`$XDG_CONFIG_HOME/mailbrus/config.toml`, falling back to `~/.config/mailbrus/config.toml`.

#### Scenario: Config file loaded at default XDG path
- **WHEN** no explicit config path is provided and the file exists at the XDG default
- **THEN** the config is parsed and returns a list of `AccountConfig` entries

#### Scenario: Config file path overridden
- **WHEN** an explicit path is provided (e.g. via `--config` CLI flag or env var)
- **THEN** that path is used instead of the XDG default

#### Scenario: Config file absent
- **WHEN** no config file exists at the resolved path
- **THEN** an empty account list is returned (not an error)
- **AND** a warning is logged indicating no accounts are configured

#### Scenario: Config file malformed
- **WHEN** the config file contains invalid TOML or missing required fields
- **THEN** a descriptive `ConfigError` is returned naming the offending field

### Requirement: Account config supports IMAP protocol with typed fields
Each account entry SHALL specify `protocol = "imap"` and provide IMAP-specific
connection parameters.

#### Scenario: Valid IMAP account parsed
- **WHEN** an account entry has `protocol = "imap"`, `imap_host`, `imap_port`,
  `imap_tls`, `credential_backend`, `credential_ref`, and `maildir_root`
- **THEN** it deserializes into an `AccountConfig::Imap(ImapConfig)` variant

#### Scenario: Missing required IMAP field
- **WHEN** an IMAP account entry omits `imap_host`
- **THEN** config loading returns a `ConfigError::MissingField` for that account

### Requirement: Config schema accommodates future JMAP accounts
The protocol field SHALL use an open enum so that JMAP account entries can be added
without a breaking change.

#### Scenario: Unknown protocol logged and skipped
- **WHEN** an account entry has `protocol = "jmap"` (not yet implemented)
- **THEN** that account is skipped with a warning log
- **AND** remaining IMAP accounts are loaded normally

### Requirement: Credential backend is selected per account
Each account SHALL specify `credential_backend = "keyring"` or `credential_backend = "pass"`,
and a `credential_ref` whose meaning depends on the backend.

#### Scenario: Keyring credential resolved
- **WHEN** `credential_backend = "keyring"` and the OS keyring contains an entry for `credential_ref`
- **THEN** the password is returned for use in IMAP authentication

#### Scenario: Pass credential resolved
- **WHEN** `credential_backend = "pass"` and a `.gpg` file exists at
  `$PASSWORD_STORE_DIR/<credential_ref>.gpg`
- **THEN** `prs-lib` decrypts the file via `gpg` and returns the first line as the password

#### Scenario: Credential not found
- **WHEN** the credential cannot be resolved from either backend
- **THEN** a `CredentialError::NotFound` is returned
- **AND** sync for that account is skipped with an error logged

### Requirement: Maildir root registered in notmuch config
Each account's resolved maildir root SHALL be automatically registered in the mailbrus-managed notmuch config at startup. No user action is required to make the maildir visible to notmuch.

#### Scenario: Account maildir is indexed after sync
- **WHEN** an account is configured in `config.toml` and a sync completes
- **THEN** messages in that account's maildir root are queryable via the notmuch database

#### Scenario: Default maildir root is used when not overridden
- **WHEN** an account has no explicit `maildir_root` in `config.toml`
- **THEN** `$XDG_DATA_HOME/mailbrus/mail/<account-id>/` is registered in the notmuch config

