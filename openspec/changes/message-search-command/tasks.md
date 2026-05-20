## 1. Shared Pagination Args

- [ ] 1.1 Add `PaginationArgs` struct in `mailbrus-cli/src/main.rs` with `--page` (default 1, min 1) and `--per-page` (default 25, min 1) using `#[command(flatten)]`
- [ ] 1.2 Add helper method `PaginationArgs::to_opts() -> PaginationOpts` that computes `offset = (page - 1) * per_page`

## 2. Update `message list`

- [ ] 2.1 Replace hardcoded `PaginationOpts { limit: 100, offset: 0 }` in `MessageCommands::List` handler with `PaginationArgs` flattened into the variant
- [ ] 2.2 Pass `pagination.to_opts()` to `reader.list_messages("*", SortBy::Newest, ...)`
- [ ] 2.3 Verify `mailbrus message list --help` shows `--page` and `--per-page` with default 25

## 3. Add `message search` subcommand

- [ ] 3.1 Add `MessageCommands::Search { query: String, output: OutputFormat, #[command(flatten)] pagination: PaginationArgs }` variant to the enum
- [ ] 3.2 Add match arm in `run()` that calls `reader.list_messages(&query, SortBy::Newest, pagination.to_opts())`
- [ ] 3.3 Reuse `print_value` for output formatting (text / json / toon)
- [ ] 3.4 Verify `mailbrus message search --help` shows positional `<query>`, `--output`, `--page`, `--per-page`

## 4. Validation & Error Handling

- [ ] 4.1 Confirm empty string query surfaces a non-zero exit code (from core layer)
- [ ] 4.2 Confirm invalid `--page 0` is rejected by clap `value_parser` at parse time

## 5. Manual Smoke Test

- [ ] 5.1 Run `mailbrus message list` — confirm ≤25 results, exit 0
- [ ] 5.2 Run `mailbrus message list --page 2` — confirm next batch, exit 0
- [ ] 5.3 Run `mailbrus message search "tag:inbox"` — confirm filtered results, exit 0
- [ ] 5.4 Run `mailbrus message search "tag:inbox" -o json` — confirm valid JSON, exit 0
- [ ] 5.5 Run `mailbrus message search "tag:inbox" -o toon` — confirm toon output, exit 0
