## Why

Mailbrus currently requires an externally managed notmuch database and passes its path via `--notmuch-db`, silently falling back to an empty string if omitted. Users who also use notmuch for other mail clients risk corruption or tag pollution if the wrong path is used. Mailbrus should own and manage its own isolated notmuch database with zero dependency on the system notmuch config.

## What Changes

- Mailbrus initializes its own notmuch database at `$XDG_DATA_HOME/mailbrus/notmuch/` on first sync if one does not exist — no `notmuch new` required from the user.
- The notmuch config used by mailbrus is written and managed internally; the system `~/.notmuch-config` is never read or modified.
- `--notmuch-db` server flag is removed or deprecated; the database path is always derived from `$XDG_DATA_HOME/mailbrus/`. **BREAKING**: existing setups using `--notmuch-db` must migrate.
- `maildir_root` defaults for each account are registered in the internal notmuch config so the database knows which maildirs to index.

## Capabilities

### New Capabilities
- `notmuch-database`: Auto-initialize and manage an isolated notmuch database under `$XDG_DATA_HOME/mailbrus/notmuch/`, with a generated notmuch config that registers each configured account's maildir. Never reads or writes the system notmuch config.

### Modified Capabilities
- `imap-sync`: The sync engine no longer accepts an external `notmuch_db_path`. It resolves the path from the internal database location.
- `account-config`: Account config determines the maildir paths registered in the internal notmuch config.

## Impact

- `mailbrus-core`: new module for notmuch database init and config generation
- `mailbrus-server`: remove `--notmuch-db` CLI flag; derive path internally
- `mailbrus-cli`: same — remove any notmuch path argument
- No changes to `mailbrus-frontend` or `mailbrus-desktop`
- Users running notmuch independently are unaffected; mailbrus never touches their setup
