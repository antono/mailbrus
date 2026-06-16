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
- It **streams progress live** as the sync runs (config read, per-account start,
  connect/authenticate, mailbox selected, each message fetched and each file
  written, indexing, and any error) rather than going silent until the end.
- To enable that, `ImapWorker` gains an **optional progress sink** (a callback)
  that emits structured milestones; it is `None` by default, so the server and
  the SSE channel are unaffected.
- `mailbrus-cli` gains the `sync` feature of `mailbrus-core` and a Tokio runtime
  scoped to this subcommand; the existing read-only subcommands stay synchronous.

The server API and the SSE event model are unchanged.

## Capabilities

### Modified Capabilities
- `mailbrus-cli-crate`: adds the `sync` subcommand, its live progress output,
  the `sync` feature dependency, and an async runtime for it.
- `mailbrus-core-crate`: `ImapWorker` gains an optional progress sink that emits
  structured `SyncProgress` milestones during a sync, and processes messages in
  bounded fetch→write→index→checkpoint batches.
- `mailbrus-server-crate`: the message-list `folder:` query is resolved from the
  account's maildir root relative to the notmuch DB root (fix found during the
  first real CLI sync — mail stored under `mail/<id>/` was not being listed).

## Impact

- `mailbrus-cli`: `Cargo.toml` (enable `mailbrus-core`'s `sync` feature, add
  `tokio`), `src/main.rs` (new subcommand + runtime + progress printer).
- `mailbrus-core`: `sync/imap.rs` (new `SyncProgress` enum, optional progress
  sink, milestone emit points) — additive, default `None`.
- No changes to `mailbrus-server`, the SSE event model, or the frontend.
- The same credential backends (`keyring` / `pass` / `plain`) and the same
  `$XDG_CONFIG_HOME/mailbrus/config.toml` apply.
