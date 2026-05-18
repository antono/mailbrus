## ADDED Requirements

### Requirement: NotmuchIndex provides fast message listing

`mailbrus-core` SHALL provide a `NotmuchIndex` struct (compiled only with Cargo feature `notmuch`) that queries a notmuch database for fast, indexed message listing without calling `notmuch new` or modifying the database content.

#### Scenario: List messages via notmuch query

- **WHEN** `NotmuchIndex::list(db_path, query)` is called with a valid notmuch database path and query string (e.g. `"tag:inbox"`)
- **THEN** it returns a `Vec<NotmuchMessage>` where each entry contains the file path, message ID, tags, and Date/From/Subject headers from the index
- **AND** the database is opened read-only
- **AND** `notmuch new` is never called

#### Scenario: Missing notmuch database

- **WHEN** `NotmuchIndex::list` is called and no database exists at the given path
- **THEN** it returns a descriptive error indicating the database is missing

### Requirement: NotmuchIndex is compile-time optional

`mailbrus-core` SHALL gate `NotmuchIndex` behind a `notmuch` Cargo feature so that users without `libnotmuch` can build without it.

#### Scenario: Compiled without notmuch feature

- **WHEN** the crate is compiled without `--features notmuch`
- **THEN** `NotmuchIndex` is not present in the public API
- **AND** no `libnotmuch` system dependency is required for compilation

#### Scenario: Compiled with notmuch feature

- **WHEN** the crate is compiled with `--features notmuch`
- **THEN** `NotmuchIndex` is available and `libnotmuch` must be present on the system
