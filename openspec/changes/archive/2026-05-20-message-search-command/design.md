## Context

The CLI exposes `message list` which hardcodes `limit: 100, offset: 0`. Users have no way to filter messages or page through results. The `MaildirReader::list_messages` in `mailbrus-core` already accepts a notmuch query string and `PaginationOpts { limit, offset }`, so all building blocks exist. This change is purely a CLI layer addition.

## Goals / Non-Goals

**Goals:**
- Add `message search "<query>"` subcommand with full output format support
- Add `--page` / `--per-page` to both `message search` and `message list`
- Offset is computed as `(page - 1) * per_page` — no changes needed in core

**Non-Goals:**
- Changes to `mailbrus-core` or the notmuch adapter
- Sorting control (SortBy is fixed to `Newest`)
- Interactive/TUI pagination
- Applying pagination to `maildir list` or `folder list`

## Decisions

**Page-based (not offset-based) API**
`--page 2 --per-page 25` is friendlier for human use than `--offset 25`. Offset is computed internally as `(page - 1) * per_page`. A `--page` flag below 1 is rejected at argument parse time via `value_parser`.

**Shared pagination args struct**
Both `MessageCommands::List` and `MessageCommands::Search` carry the same `--page` / `--per-page` fields. Extract a `PaginationArgs` clap struct with `#[command(flatten)]` to avoid duplication and keep both commands in sync.

**Default per-page is 25**
Replaces the hardcoded 100 in `message list`. This is a behaviour change but makes the default manageable for terminal output.

**Query defaults to `*` for `message list`**
`list_messages` is called with `"*"` (match all) for `message list`, same as today. `message search` passes the user-supplied query string verbatim.

## Risks / Trade-offs

- **Behaviour change on `message list`**: default limit drops from 100 to 25. Existing scripts that rely on seeing 100 results will silently get fewer. → Mitigated by documenting the change and exposing `--per-page`.
- **No total count exposed**: users cannot tell how many pages exist without over-fetching. → Acceptable for v1; total count can be added later as `--count` flag.
- **Notmuch query syntax not validated by CLI**: invalid queries surface as errors from the core layer. → Core already returns `MailboxError`; the CLI propagates and exits non-zero.
