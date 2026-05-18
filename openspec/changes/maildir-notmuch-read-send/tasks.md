## 1. Dependencies

- [ ] 1.1 Add `io-smtp = { git = "https://github.com/pimalaya/io-smtp" }` to `mailbrus-core/Cargo.toml`
- [ ] 1.2 Add `notmuch = { version = "0.8", optional = true }` to `mailbrus-core/Cargo.toml`
- [ ] 1.3 Add `[features] notmuch = ["dep:notmuch"]` to `mailbrus-core/Cargo.toml`
- [ ] 1.4 Run `cargo fetch` and update `cargoLock.outputHashes` in `nix/pkgs.nix` for `io-smtp` git dep
- [ ] 1.5 Add `libnotmuch` to `nix/deps.nix` as an optional system dep (document how to enable it)

## 2. MaildirReader

- [ ] 2.1 Create `mailbrus-core/src/maildir_reader.rs` with `MaildirReader` struct wrapping a `PathBuf` root
- [ ] 2.2 Implement `MaildirReader::list` using `io_maildir::client::MaildirClient::list_messages`; return `Vec<Message>`
- [ ] 2.3 Implement `MaildirReader::get` using `MaildirClient::get_message`; return full RFC 5322 bytes
- [ ] 2.4 Define `Message` struct with fields: `path`, `headers` (Date/From/To/Subject/Message-ID), `flags`
- [ ] 2.5 Implement `SortKey` enum (`Date`, `From`, `Subject`) and sort helper for `Vec<Message>`
- [ ] 2.6 Export `maildir_reader` module from `lib.rs`

## 3. NotmuchIndex

- [ ] 3.1 Create `mailbrus-core/src/notmuch_index.rs` gated with `#[cfg(feature = "notmuch")]`
- [ ] 3.2 Implement `NotmuchIndex::list(db_path, query)` using the `notmuch` crate; open database read-only
- [ ] 3.3 Define `NotmuchMessage` struct with fields: `path`, `message_id`, `tags`, `date`, `from`, `subject`
- [ ] 3.4 Export `notmuch_index` module from `lib.rs` under `#[cfg(feature = "notmuch")]`

## 4. SmtpSender

- [ ] 4.1 Create `mailbrus-core/src/smtp_sender.rs` with `SmtpConfig` struct (host, port, username, password, starttls)
- [ ] 4.2 Implement `SmtpSender::send(config: SmtpConfig, message: &[u8])` using `io_smtp` blocking client
- [ ] 4.3 Wire STARTTLS upgrade when `config.starttls` is true
- [ ] 4.4 Export `smtp_sender` module from `lib.rs`

## 5. Verification

- [ ] 5.1 Run `cargo build -p mailbrus-core` and confirm all three modules compile
- [ ] 5.2 Run `cargo build -p mailbrus-core --features notmuch` and confirm notmuch module compiles
- [ ] 5.3 Write a unit test for `SortKey` sorting on a small `Vec<Message>` with mock data
- [ ] 5.4 Write an integration test for `MaildirReader::list` against a temporary Maildir (use `tempfile` crate)
- [ ] 5.5 Confirm `nix build .#mailbrus` succeeds with updated `outputHashes`
