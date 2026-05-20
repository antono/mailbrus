## 1. CLI — Add `message read` subcommand

- [ ] 1.1 Add `Read` variant to `MessageCommands` enum in `mailbrus-cli/src/main.rs` with `id: String` and `output: OutputFormat` fields
- [ ] 1.2 Add doc comment on `Read` variant matching `--help` requirement (show `<id>` and `--output`)
- [ ] 1.3 Add match arm for `Commands::Message { cmd: MessageCommands::Read { id, output } }` in `run()`

## 2. CLI — Implement read handler

- [ ] 2.1 In the `Read` match arm, call `reader.get_message_body(&id)` and handle `MessageNotFound` error (non-zero exit with descriptive stderr message)
- [ ] 2.2 Call `reader.list_messages(&format!("id:{id}"), SortBy::Newest, PaginationOpts { limit: 1, offset: 0 })` to retrieve headers for the JSON output struct
- [ ] 2.3 Implement `print_message` function that renders text output as headers then body, JSON output as `{"id","headers","body"}`, and toon output via `toon_format::encode_default`

## 3. Verification

- [ ] 3.1 Run `cargo build` and confirm it compiles without warnings
- [ ] 3.2 Run `mailbrus message read --help` and verify `<id>` and `--output` appear in output
- [ ] 3.3 Run `mailbrus message --help` and verify `read` appears in subcommand list
- [ ] 3.4 Run `mailbrus message read <valid-id>` and verify text output contains headers and body
- [ ] 3.5 Run `mailbrus message read <valid-id> --output json` and verify valid JSON with `id`, `headers`, `body` keys
- [ ] 3.6 Run `mailbrus message read nonexistent-id` and verify non-zero exit with error on stderr
