## Context

Mailbrus uses notmuch as its search and indexing layer. Today the notmuch database path is passed via `--notmuch-db`; if omitted the server falls back to `PathBuf::from("")`, which silently fails on first sync. Users who run notmuch independently (with neomutt, alot, etc.) risk accidental cross-contamination of tags or config.

The sync engine currently opens the notmuch DB directly inside `ImapWorker::index_in_notmuch`, and the `SyncEngine` constructor takes a `notmuch_db_path: PathBuf` argument threaded down from the CLI.

Indexing (`notmuch new`-equivalent) happens inline during sync with no observable progress events — the UI has no way to show a spinner or reflect indexing state.

## Goals / Non-Goals

**Goals:**
- Mailbrus owns a notmuch database at `$XDG_DATA_HOME/mailbrus/notmuch/` with a generated config.
- DB is auto-initialized on first sync if absent. No manual `notmuch new` required.
- System `~/.notmuch-config` is never read or written.
- Indexing progress is emitted as structured events (machine-readable JSON over SSE, same channel as sync events).
- Desktop UI shows a spinner during indexing; clicking it opens a popup with per-mailbox progress details.
- `--notmuch-db` server flag is removed.

**Non-Goals:**
- Supporting multiple notmuch databases.
- Exposing notmuch query language changes to users.
- Replacing notmuch with another indexer.
- Syncing the mailbrus notmuch DB back to the system DB.

## Decisions

### D1: Database location

**Decision:** `$XDG_DATA_HOME/mailbrus/notmuch/` (typically `~/.local/share/mailbrus/notmuch/`).

Rationale: consistent with existing XDG layout (`sync.db`, `mail/`). Using a subdirectory rather than the `mail/` root keeps the notmuch `.notmuch/` directory separate from the Maildir tree.

Alternatives considered:
- `$XDG_DATA_HOME/mailbrus/` (same as mail root) — notmuch would place `.notmuch/` inside the mail tree, creating noise in Maildir listings.
- User-configurable path — adds complexity with no clear use case given the isolation goal.

### D2: Notmuch config generation

**Decision:** Mailbrus writes a minimal notmuch config to `$XDG_DATA_HOME/mailbrus/notmuch.cfg` at startup, registering each configured account's maildir root under `[database] path` and `[new] tags`.

The config is regenerated on every startup so it stays in sync with the account list. `Database::open_with_config(path, mode, Some(config_path), None)` is used everywhere — the fourth argument (profile) is always `None`.

Alternatives considered:
- Pass config as an in-memory string — the notmuch C library only accepts a filesystem path for the config file.
- One config per account — unnecessarily complex; notmuch supports multiple maildir roots in one database via `[new] ignore` patterns.

### D3: Auto-initialization

**Decision:** On server startup, after generating the config, call `notmuch::Database::create(path)` if `path/.notmuch/` does not exist. This is idempotent.

Rationale: avoids the first-sync failure and removes the setup step from the user's workflow.

### D4: Indexing events

**Decision:** Extend the existing SSE broadcast channel (`/api/sync/stream`) with a new `IndexEvent` variant alongside `SyncEvent`. The frontend already subscribes to this stream.

`IndexEvent` shape:
```json
{ "type": "index", "status": "running"|"done"|"error", "indexed": 42, "error": "..." }
```

`SyncEvent` gains a `"type": "sync"` discriminator field for forward compatibility.

Alternatives considered:
- Separate `/api/index/stream` endpoint — doubles the SSE connections the frontend must manage; no benefit given both events are causally related.
- Polling `GET /api/index/status` — inferior UX; push is already in place.

### D5: Desktop spinner

**Decision:** A persistent status bar component in `mailbrus-frontend` subscribes to `/api/sync/stream` and tracks `index` + `sync` events. During activity it renders a spinner; clicking opens a slide-up panel with per-account, per-mailbox rows showing counts and status.

Svelte stores hold the live event state. No new API endpoints needed.

## Risks / Trade-offs

- **Notmuch config regenerated on startup** → if a user manually edits the generated config their changes are overwritten. Mitigation: document that the config is managed; provide escape-hatch overrides via mailbrus config if needed in a future change.
- **`--notmuch-db` removal is breaking** → Mitigation: log a clear deprecation warning if the flag is present; document migration in `docs/mail-sync.md`.
- **Indexing events are best-effort** → if the server restarts mid-sync the SSE stream drops. Mitigation: client reconnects and reconciles from the next sync event; no persistent event log needed for MVP.

## Migration Plan

1. Remove `--notmuch-db` from `mailbrus-server` CLI and `mailbrus-cli`.
2. Add `NotmuchDB` module to `mailbrus-core` (config gen, init, path resolution).
3. Replace `notmuch_db_path: PathBuf` constructor arg in `SyncEngine` with internal resolution.
4. Add `IndexEvent` to the broadcast channel and emit from `index_in_notmuch`.
5. Update `mailbrus-frontend`: add status bar component, wire SSE event parsing.
6. Update `docs/mail-sync.md` to remove `--notmuch-db` references and add indexing UI section.

Rollback: revert is safe at any step; the notmuch database directory can be deleted and rebuilt by re-running sync.

## Open Questions

- Should `notmuch.cfg` path be overridable via an env var (e.g. `MAILBRUS_NOTMUCH_CONFIG`) for power users? Deferred — can be added later without breaking the spec.
- Should `IndexEvent` include a per-file progress counter or only batch totals? Start with batch totals; per-file would require notmuch library hooks not currently exposed.
