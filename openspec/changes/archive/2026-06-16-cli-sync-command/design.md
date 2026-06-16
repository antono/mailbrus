## Context

The sync pipeline is entirely in `mailbrus-core` behind the `sync` feature:
`SyncEngine` (registry, in-flight guard, SSE broadcast) and `ImapWorker`
(connect/auth, CONDSTORE delta fetch, maildir write, `index_in_notmuch`,
returning a `SyncReport { fetched, deleted, … }`). `mailbrus-server` is a thin
driver: load config → `notmuch_db::write_config` + `ensure_initialized` →
`SyncEngine::new` → trigger. `mailbrus-cli` today depends on `mailbrus-core`
**without** the `sync` feature and has no async runtime.

## Goals / Non-Goals

**Goals:**
- A blocking `mailbrus sync [account]` that fetches mail and reports counts.
- Reuse the core pipeline verbatim; add no sync logic to the CLI.
- Mirror the server's DB ownership (managed config + auto-init).

**Non-Goals:**
- Streaming progress / SSE in the CLI (it blocks and prints a final summary).
- A daemon / watch mode.
- Per-mailbox selection beyond the worker's default mailbox set.

## Decisions

### D1: Drive the worker directly, not the full engine
**Decision:** For each targeted account, construct an `ImapWorker` and `await`
`sync()`, collecting `SyncReport`s. Do **not** use `SyncEngine::sync_account`,
which spawns detached Tokio tasks and returns immediately — wrong shape for a
blocking CLI.

Rationale: `ImapWorker::sync()` is an `async fn` that returns the result
synchronously; it's the natural fit for a one-shot command and avoids
re-implementing the engine's completion tracking.

Trade-off: the CLI must replicate the small amount of wiring the engine does
(resolve `notmuch_db::default_db_path()`, the shared `NotmuchLock`, the state DB
path). That's a few lines and keeps the worker the single source of truth.

### D2: Scoped async runtime
**Decision:** Only the `sync` subcommand needs async. Build a `tokio` runtime
(`tokio::runtime::Runtime::new()` or `#[tokio::main]` on a dedicated entry) just
for that arm; the read-only subcommands stay on the existing synchronous path.

Rationale: keeps the read commands free of runtime startup cost and avoids
making the whole binary async.

### D3: Startup parity with the server
**Decision:** Before syncing, call `notmuch_db::write_config(config_path,
db_path, maildir_roots)` and `notmuch_db::ensure_initialized(db_path)`, using the
same account→maildir-root resolution as the server. This guarantees the CLI and
server share one database and config.

### D4: Exit code + reporting
**Decision:** Print one line per account (`fetched/deleted/indexed`) as the final
summary on stdout. Accumulate failures; exit non-zero if any account errored, 0
otherwise. Unknown account id is a usage error (non-zero, no sync attempted).

### D5: Live progress via a callback sink, not the SSE broadcast
**Decision:** Add an optional progress sink to `ImapWorker`:
`Option<Arc<dyn Fn(SyncProgress) + Send + Sync>>`, set via `with_progress(...)`,
emitted synchronously at each milestone inside `sync()`. The CLI installs a sink
that prints human-readable lines to **stderr** as they arrive; the final
per-account summary stays on **stdout** (so it remains pipe-friendly).

Rationale / alternatives:
- **Why not reuse the `events_tx` broadcast (SSE) path?** Those events are
  coarse (per-account/per-mailbox terminal states) and feed the UI; adding
  per-message/per-file frames there would be noisy for the SSE consumers and
  would require the CLI to run a concurrent subscriber task. A direct callback
  is simpler, synchronous with the work, and decoupled from the UI model.
- **Why not `tracing`?** Logs carry level/target noise and the format isn't the
  clean progress UX requested; a structured sink lets the CLI format lines and
  keeps per-message emission out of server logs.

The sink must be `Send + Sync` because `ImapWorker::sync()` is awaited inside a
spawned task in the server's engine path; a stateless printing closure satisfies
this. `SyncProgress` is a public enum re-exported from `mailbrus_core::sync`.

## Risks / Trade-offs

- **Credential prompts / keyring access** from a non-interactive context (cron)
  may fail — same constraint as the server; document that `pass`/`keyring` must
  be unlocked. Not solved here.
- **Concurrent CLI + server sync** could contend on the notmuch write lock and
  `sync.db`. The notmuch lock is per-process; running both at once against the
  same DB is unsupported — note it in docs.

## Migration Plan

Additive: a new subcommand and a feature/runtime addition to `mailbrus-cli`. No
data migration; existing read-only commands are unaffected.
