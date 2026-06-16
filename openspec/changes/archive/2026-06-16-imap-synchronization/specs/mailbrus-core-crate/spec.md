## ADDED Requirements

### Requirement: mailbrus-core exposes a sync module
`mailbrus-core` SHALL provide a `sync` module containing `SyncEngine`, IMAP worker,
and sync state types as part of its public API.

#### Scenario: SyncEngine constructed from config
- **WHEN** `SyncEngine::new(config: &[AccountConfig])` is called
- **THEN** a `SyncEngine` is returned with one registered worker slot per IMAP account

#### Scenario: Sync module absent without feature flag
- **WHEN** `mailbrus-core` is compiled without the `sync` Cargo feature
- **THEN** the `sync` module is not present in the public API
- **AND** no IMAP or SQLite dependencies are required for compilation

### Requirement: mailbrus-core opens notmuch in ReadWrite mode during sync
`mailbrus-core` SHALL support opening the notmuch database in `ReadWrite` mode
for the duration of indexing newly fetched messages.

#### Scenario: ReadWrite access used for indexing
- **WHEN** `SyncEngine` indexes a new maildir file into notmuch
- **THEN** the database is opened in `ReadWrite` mode for the `index_file` call
- **AND** the handle is dropped immediately after indexing completes

#### Scenario: Existing read-only API unaffected
- **WHEN** `MaildirReader::open()` or `MaildirReader::new()` is called outside of sync
- **THEN** the database continues to open in `ReadOnly` mode as before

### Requirement: mailbrus-core provides a credential resolution API
`mailbrus-core` SHALL expose a `credentials::resolve(config: &AccountConfig) -> Result<String>`
function that returns the plaintext secret for a given account.

#### Scenario: Keyring backend resolves secret
- **WHEN** the account specifies `credential_backend = "keyring"`
- **THEN** `keyring-lib` is used to look up the entry by `credential_ref`
- **AND** the plaintext password is returned

#### Scenario: Pass backend resolves secret
- **WHEN** the account specifies `credential_backend = "pass"`
- **THEN** `prs-lib` with the `backend-gnupg-bin` feature decrypts
  `$PASSWORD_STORE_DIR/<credential_ref>.gpg` via `gpg`
- **AND** the first line of the decrypted content is returned as the password
