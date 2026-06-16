## ADDED Requirements

### Requirement: Maildir root registered in notmuch config
Each account's resolved maildir root SHALL be automatically registered in the mailbrus-managed notmuch config at startup. No user action is required to make the maildir visible to notmuch.

#### Scenario: Account maildir is indexed after sync
- **WHEN** an account is configured in `config.toml` and a sync completes
- **THEN** messages in that account's maildir root are queryable via the notmuch database

#### Scenario: Default maildir root is used when not overridden
- **WHEN** an account has no explicit `maildir_root` in `config.toml`
- **THEN** `$XDG_DATA_HOME/mailbrus/mail/<account-id>/` is registered in the notmuch config
