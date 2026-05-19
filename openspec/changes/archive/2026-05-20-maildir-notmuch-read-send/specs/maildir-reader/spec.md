## ADDED Requirements

### Requirement: MaildirReader lists messages from a Maildir

`mailbrus-core` SHALL provide a `MaildirReader` that lists messages from a local Maildir directory using io-maildir coroutines, returning parsed headers and flags for each message.

#### Scenario: List messages from a Maildir

- **WHEN** `MaildirReader::list(root)` is called with a valid Maildir root path
- **THEN** it returns a `Vec<Message>` where each entry contains the file path, parsed headers (Date, From, To, Subject, Message-ID), and flags (Seen, Replied, Flagged) derived from the filename suffix
- **AND** messages from both `cur/` and `new/` subdirectories are included

#### Scenario: Empty or missing Maildir

- **WHEN** `MaildirReader::list(root)` is called with a path that does not exist or has no `cur/`/`new/` subdirectories
- **THEN** it returns an error (not a panic)

### Requirement: MaildirReader fetches individual message bodies

`mailbrus-core` SHALL provide `MaildirReader::get` that reads a single message file by path, loading only that file.

#### Scenario: Fetch a single message body

- **WHEN** `MaildirReader::get(path)` is called with a valid message file path
- **THEN** it returns the full RFC 5322 message bytes by reading only that single file

### Requirement: Messages are sortable by header

`mailbrus-core` SHALL provide a `SortKey` enum and sorting support for `Vec<Message>` by Date, From, and Subject headers.

#### Scenario: Sort messages by header

- **WHEN** a `Vec<Message>` is sorted using `SortKey::{Date, From, Subject}`
- **THEN** messages are ordered by the corresponding parsed header value
- **AND** ordering is stable for messages with equal key values
