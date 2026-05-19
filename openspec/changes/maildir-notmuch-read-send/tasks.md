## 1. Dependencies

- [ ] 1.1 Add `notmuch = "0.8"` as a required dependency to `mailbrus-core/Cargo.toml`
- [ ] 1.2 Add `libnotmuch` to `nix/deps.nix` as a required `buildInputs` entry
- [ ] 1.3 Run `cargo fetch` inside nix dev shell; update `cargoLock.outputHashes` in `nix/pkgs.nix` if needed

## 2. Error type

- [ ] 2.1 Create `mailbrus-core/src/error.rs` with `MailboxError` enum:
         `DatabaseNotFound`, `DatabaseLocked`, `DatabaseCorrupted`,
         `MessageNotFound`, `BodyReadFailed`, `QueryFailed`
- [ ] 2.2 Implement `std::fmt::Display` for `MailboxError`
- [ ] 2.3 Implement `From<notmuch::Error>` → `MailboxError` for well-known notmuch errors
- [ ] 2.4 Export `MailboxError` from `lib.rs`

## 3. MaildirReader

- [ ] 3.1 Create `mailbrus-core/src/maildir_reader.rs`
- [ ] 3.2 Define `Message`, `Headers`, `MaildirFlags`, `SortBy`, `PaginationOpts`
- [ ] 3.3 Implement `MaildirReader::new(db_path) -> Result<Self, MailboxError>` (opens notmuch db read-only)
- [ ] 3.4 Implement `MaildirReader::list_messages(query, sort, pagination) -> Result<(Vec<Message>, usize), MailboxError>`
- [ ] 3.5 Implement `MaildirReader::get_message_body(message_id) -> Result<Vec<u8>, MailboxError>`
         (looks up path in notmuch index, reads file from disk)
- [ ] 3.6 Export `maildir_reader` module from `lib.rs`

## 4. Verification

- [ ] 4.1 Run `cargo build -p mailbrus-core` and confirm it compiles
- [ ] 4.2 Write a unit test for `MailboxError` Display output for each variant
- [ ] 4.3 Write an integration test for `MaildirReader::list_messages` against a real notmuch test database
- [ ] 4.4 Confirm `nix build .#mailbrus` succeeds
