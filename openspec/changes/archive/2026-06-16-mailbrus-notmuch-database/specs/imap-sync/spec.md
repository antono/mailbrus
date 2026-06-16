## ADDED Requirements

### Requirement: Sync engine notmuch path
The sync engine SHALL resolve the notmuch database path internally from `$XDG_DATA_HOME/mailbrus/notmuch/`. It SHALL NOT accept an external `notmuch_db_path` constructor argument.

#### Scenario: SyncEngine uses internal path
- **WHEN** `SyncEngine::new` is called
- **THEN** the notmuch database path is resolved internally without requiring a caller-supplied path

#### Scenario: --notmuch-db flag is removed
- **WHEN** mailbrus-server is started with `--notmuch-db` flag
- **THEN** the server logs a deprecation warning and ignores the flag
