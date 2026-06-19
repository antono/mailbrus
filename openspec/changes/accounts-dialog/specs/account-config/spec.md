## MODIFIED Requirements

### Requirement: Account config is loaded from a TOML file at an XDG path

`mailbrus-core` SHALL load account definitions from per-account TOML files in the
directory `$XDG_CONFIG_HOME/mailbrus/accounts/`, falling back to
`~/.config/mailbrus/accounts/`. Each file `accounts/<email>.toml` defines exactly
one account, with the account fields at the top level of the file (no
`[accounts.<id>]` table wrapper). The filename stem SHALL be the account id and
SHALL equal the account's email address. **BREAKING:** the legacy single
`config.toml` is no longer read; existing users must re-create accounts as
per-account files (the onboarding wizard does this).

#### Scenario: Accounts loaded from the accounts directory

- **WHEN** the `accounts/` directory contains one or more `*.toml` files
- **THEN** each file is parsed into one `AccountConfig` entry
- **AND** the account id of each entry equals its filename stem (the email address)

#### Scenario: Config path overridden

- **WHEN** an explicit config location is provided (e.g. via `--config` or env var)
- **THEN** the `accounts/` directory under that location is scanned instead of the
  XDG default

#### Scenario: Accounts directory absent or empty

- **WHEN** the `accounts/` directory does not exist or contains no `*.toml` files
- **THEN** an empty account list is returned (not an error)
- **AND** a warning is logged indicating no accounts are configured

#### Scenario: One account file malformed

- **WHEN** a single `accounts/*.toml` file contains invalid TOML or a missing
  required field
- **THEN** that file is skipped with a descriptive warning naming the file
- **AND** the remaining well-formed account files are still loaded

## ADDED Requirements

### Requirement: A new account can be written as a per-account file

`mailbrus-core` SHALL provide a way to persist a new account as
`accounts/<email>.toml`. The write SHALL be atomic (write to a temporary file in
the same directory, then rename) so a reader never observes a partially written
file. The write SHALL fail without overwriting if a file for that id already
exists.

#### Scenario: New account file written atomically

- **WHEN** a new account is persisted
- **THEN** `accounts/<email>.toml` is created via a temp-file-and-rename sequence
- **AND** the file parses back into an equivalent `AccountConfig`

#### Scenario: Refuse to overwrite an existing account

- **WHEN** persisting an account whose `accounts/<email>.toml` already exists
- **THEN** the write fails with a distinct "already exists" error
- **AND** the existing file is left unchanged

### Requirement: Account entry supports SMTP submission fields

An account entry SHALL accept optional SMTP submission fields `smtp_host`,
`smtp_port`, and `smtp_starttls`. When omitted, `smtp_port` SHALL default to `587`
and `smtp_starttls` to `true`. SMTP authentication SHALL reuse the account's
configured credential.

#### Scenario: SMTP fields parsed

- **WHEN** an account file specifies `smtp_host`, `smtp_port`, and `smtp_starttls`
- **THEN** those values are available on the parsed account entry

#### Scenario: SMTP defaults applied

- **WHEN** an account file specifies `smtp_host` but omits `smtp_port` and
  `smtp_starttls`
- **THEN** the parsed entry reports port `587` and STARTTLS enabled

### Requirement: Account entry supports a signature applied with the standard delimiter

An account entry SHALL accept an optional multi-line `signature` field. When a
signature is applied to an outgoing plain-text message, it SHALL be placed after a
delimiter line containing exactly `-- ` (dash, dash, space) on its own line,
emitted as `\r\n-- \r\n<signature>`. Under `format=flowed` the `-- ` delimiter
line SHALL be sent as-is (not space-stuffed or flowed) so receiving clients can
recognise and trim it.

#### Scenario: Signature parsed and preserved

- **WHEN** an account file specifies a multi-line `signature`
- **THEN** the parsed entry exposes that signature text verbatim

#### Scenario: Signature applied with the dash-dash-space delimiter

- **WHEN** the signature is applied to a plain-text body
- **THEN** the result contains a line equal to exactly `-- ` (dash, dash, space)
  immediately preceding the signature text

### Requirement: A credential can be written for a new account

`mailbrus-core` SHALL support writing the secret for a new account to the selected
credential backend. For `keyring`, the secret SHALL be stored via the OS keyring
under a `credential_ref` equal to the account's email address. For `plain`, the
secret is stored inline in the account file. The `pass` backend SHALL remain
read-only (not written from the application).

#### Scenario: Keyring secret stored under the email-derived ref

- **WHEN** a new account with `credential_backend = "keyring"` is created
- **THEN** its secret is written to the OS keyring under a `credential_ref` equal
  to the account email
- **AND** `credentials::resolve` for that account returns the stored secret

#### Scenario: Pass backend is not written

- **WHEN** account creation is attempted with `credential_backend = "pass"`
- **THEN** no write to the pass store is performed by the application
