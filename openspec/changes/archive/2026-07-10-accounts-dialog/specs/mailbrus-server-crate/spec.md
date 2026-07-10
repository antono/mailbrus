## MODIFIED Requirements

### Requirement: Server reads account list from config file

`mailbrus-server` SHALL load the account list at startup by scanning the
`accounts/` directory of per-account TOML files (see the `account-config`
capability) rather than reading a single `config.toml` or inferring accounts from
the notmuch root directory listing.

#### Scenario: Accounts loaded from config at startup

- **WHEN** the server starts and the `accounts/` directory contains valid account
  files
- **THEN** `AppState` contains an account registry built from the parsed
  `AccountConfig` list
- **AND** `GET /api/maildirs` returns only accounts present in the `accounts/`
  directory

#### Scenario: No account files at startup

- **WHEN** the server starts and the `accounts/` directory is absent or empty
- **THEN** the server starts successfully with an empty account registry
- **AND** `GET /api/maildirs` returns an empty list
- **AND** `GET /api/accounts` returns an empty list
- **AND** a warning is logged

#### Scenario: Config path overridden via CLI flag

- **WHEN** the server is started with `--config <path>`
- **THEN** the `accounts/` directory under that path is scanned instead of the XDG
  default

## ADDED Requirements

### Requirement: GET /api/accounts — list configured accounts

`mailbrus-server` SHALL expose `GET /api/accounts` returning a JSON array of
account summaries reflecting the configured accounts, independent of sync state.
Each summary SHALL include at minimum `id`, `email`, `protocol`, and
`display_name`. The secret SHALL never be included in the response.

#### Scenario: Accounts listed regardless of sync state

- **WHEN** client sends `GET /api/accounts` and one account is configured but has
  never synced
- **THEN** the server responds `200` with a one-element array containing that
  account's summary

#### Scenario: No accounts configured

- **WHEN** no accounts are configured
- **THEN** the server responds `200` with an empty JSON array `[]`

#### Scenario: Secret never exposed

- **WHEN** an account summary is returned
- **THEN** the response contains no password/secret field

### Requirement: POST /api/accounts — create an account

`mailbrus-server` SHALL expose `POST /api/accounts` that creates one account from
a JSON body of account fields plus the secret. The handler SHALL validate the
settings against the real servers (IMAP login and SMTP `AUTH`, no message sent)
before persisting. On success it SHALL store the credential, write
`accounts/<email>.toml`, reload the account registry, and respond `201` with the
account summary. The id (email address) SHALL be percent-decoded/encoded
consistently where it appears in route paths.

#### Scenario: Valid account created

- **WHEN** `POST /api/accounts` is called with settings whose IMAP and SMTP
  servers authenticate
- **THEN** the credential is stored, `accounts/<email>.toml` is written, and the
  server responds `201` with the account summary

#### Scenario: Validation failure is reported without persisting

- **WHEN** the supplied settings fail to authenticate (e.g. bad password or
  unreachable host)
- **THEN** the server responds `422` with a JSON body naming the offending field
  and reason
- **AND** no account file is written and no credential is stored

#### Scenario: Duplicate account rejected

- **WHEN** `POST /api/accounts` is called for an email that already has an account
- **THEN** the server responds `409` with a JSON error body
- **AND** the existing account file is left unchanged

#### Scenario: Validation is time-bounded

- **WHEN** a target server hangs during validation
- **THEN** the handler times out and responds `422` rather than blocking
  indefinitely

### Requirement: Account registry reloads without a server restart

After an account is created, `mailbrus-server` SHALL make it active without a
restart: the account registry SHALL be reloaded, its maildir root registered in
the notmuch config, and the sync engine SHALL be (re)built so the new account is
syncable. The common case is the transition from zero accounts (sync engine
disabled) to one account (sync engine enabled).

#### Scenario: New account is syncable immediately after creation

- **WHEN** an account is created on a server that started with zero accounts
- **THEN** a subsequent `POST /api/sync/<id>` for that account is accepted
  (`202`) without restarting the server

#### Scenario: New account appears in listings after creation

- **WHEN** an account is created
- **THEN** a subsequent `GET /api/accounts` includes the new account
