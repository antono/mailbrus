## 1. Dependencies

- [ ] 1.1 Add `clap` (with `derive` feature) to `mailbrus-cli/Cargo.toml`
- [ ] 1.2 Add `toon` git dep to `mailbrus-cli/Cargo.toml` pinned to a specific commit SHA from `https://github.com/toon-format/toon-rust`
- [ ] 1.3 Add `serde` and `serde_json` to `mailbrus-cli/Cargo.toml` for JSON output
- [ ] 1.4 Run `cargo fetch` and verify `Cargo.lock` captures the toon git dep
- [ ] 1.5 Update `nix/deps.nix` (or equivalent) with updated `cargoHash` after fetch

## 2. Core: maildir and folder enumeration

- [ ] 2.1 Add `list_maildirs() -> Result<Vec<PathBuf>, MailboxError>` to `mailbrus-core` (reads notmuch database paths from config)
- [ ] 2.2 Add `list_folders(maildir: &Path) -> Result<Vec<String>, MailboxError>` to `mailbrus-core` (walks Maildir++ subfolders, filters `cur`/`new`/`tmp`)
- [ ] 2.3 Write unit tests for `list_maildirs` and `list_folders` in `mailbrus-core`

## 3. CLI structure

- [ ] 3.1 Replace placeholder `main.rs` body with clap `Cli` struct using `#[derive(Parser)]`
- [ ] 3.2 Define `OutputFormat` enum (`Text`, `Json`, `Toon`) with clap `ValueEnum`
- [ ] 3.3 Define `MaildirCommands`, `FolderCommands`, `MessageCommands` subcommand enums
- [ ] 3.4 Wire `--version` via clap `version` attribute on `Cli`

## 4. Command implementations

- [ ] 4.1 Implement `maildir list` handler calling `MaildirReader::list_maildirs`
- [ ] 4.2 Implement `folder list` handler calling `MaildirReader::list_folders`
- [ ] 4.3 Implement `message list` handler calling `MaildirReader::list_messages` with default query `*`
- [ ] 4.4 Implement centralized output dispatcher: match `OutputFormat` → `text`, `serde_json::to_string_pretty`, or `toon::to_string`

## 5. Verification

- [ ] 5.1 Run `cargo build -p mailbrus-cli` and confirm `target/debug/mailbrus` is produced
- [ ] 5.2 Smoke-test `mailbrus --version`
- [ ] 5.3 Smoke-test `mailbrus maildir list`, `mailbrus maildir list -o json`, `mailbrus maildir list -o toon`
- [ ] 5.4 Smoke-test `mailbrus folder list` and `mailbrus message list` with all three output formats
- [ ] 5.5 Confirm `mailbrus maildir list -o xml` exits non-zero with a useful error
