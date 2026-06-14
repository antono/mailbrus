## Why

The full IMAP sync pipeline lives in `mailbrus-core` (`SyncEngine` /
`ImapWorker`), but it is only reachable through `mailbrus-server`'s HTTP API
(`POST /api/sync`). `mailbrus-cli` is read-only — it can browse and search the
notmuch index but cannot fetch new mail. A user who wants to sync from a
terminal, a cron job, or a script currently has to run the whole server and
`curl` it. A blocking `mailbrus sync` subcommand removes that detour.

## What Changes

- Add a `mailbrus sync [account]` subcommand: with no argument it syncs all
  configured accounts, otherwise just the named one.
- It runs to completion (blocking) and prints a per-account summary of
  fetched / deleted / indexed counts; non-zero exit if any account errors.
- It reuses the existing core pipeline: resolve config, write the managed
  notmuch config, auto-initialize the database, then run `ImapWorker::sync()`
  per account — no new sync logic.
- `mailbrus-cli` gains the `sync` feature of `mailbrus-core` and a Tokio runtime
  scoped to this subcommand; the existing read-only subcommands stay synchronous.

The server API and the core engine are unchanged.

## Capabilities

### Modified Capabilities
- `mailbrus-cli-crate`: adds the `sync` subcommand, the `sync` feature
  dependency, and an async runtime for it.

## Impact

- `mailbrus-cli`: `Cargo.toml` (enable `mailbrus-core`'s `sync` feature, add
  `tokio`), `src/main.rs` (new subcommand + runtime).
- No changes to `mailbrus-core`, `mailbrus-server`, or the frontend.
- The same credential backends (`keyring` / `pass` / `plain`) and the same
  `$XDG_CONFIG_HOME/mailbrus/config.toml` apply.
