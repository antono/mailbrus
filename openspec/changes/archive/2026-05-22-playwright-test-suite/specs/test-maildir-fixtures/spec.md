## ADDED Requirements

### Requirement: Pristine corpus is committed and read-only

The system SHALL provide a pristine maildir corpus committed to the repository under the E2E fixtures directory, containing only plain maildir message files (no Xapian/notmuch database). Tests SHALL treat the pristine corpus as read-only and SHALL never index, mutate, or run a server against it directly.

#### Scenario: Corpus committed without binary index

- **WHEN** the repository is checked out
- **THEN** the pristine maildir tree exists under the fixtures directory
- **AND** it contains no `.notmuch/` directory or Xapian database files

#### Scenario: Pristine corpus is never mutated

- **WHEN** the full E2E suite has finished running
- **THEN** the pristine maildir tree is byte-for-byte unchanged from its committed state

### Requirement: Multiple accounts

The corpus SHALL contain at least two distinct account maildirs, each identified by an email-address-named directory at the corpus root.

#### Scenario: At least two accounts present

- **WHEN** the corpus root is listed
- **THEN** at least two account directories named like email addresses are present

### Requirement: Multiple folders per account

Each account SHALL contain multiple folders covering at least Inbox, Sent, Archive, Spam, and Trash, and each folder SHALL be a valid maildir with `cur/`, `new/`, and `tmp/` subdirectories.

#### Scenario: Standard folder set per account

- **WHEN** an account directory is listed
- **THEN** it contains Inbox, Sent, Archive, Spam, and Trash folders
- **AND** each folder contains `cur/`, `new/`, and `tmp/` subdirectories

### Requirement: Message-state coverage

The corpus SHALL include messages covering every UI-relevant state, expressed through maildir conventions: unread (in `new/` or `cur/` without the `S` flag), read (`cur/` with `S`), flagged (`F`), replied (`R`), and deleted/trashed (`T` and/or placement in Trash). State SHALL be encoded in maildir filename flags and folder placement, not in external scripts.

#### Scenario: Read and unread messages exist

- **WHEN** an account's Inbox is inspected
- **THEN** at least one unread message and at least one read message are present
- **AND** read/unread is determined by maildir filename flags

#### Scenario: Flagged and replied messages exist

- **WHEN** the corpus is inspected
- **THEN** at least one flagged (`F`) message and at least one replied (`R`) message are present

#### Scenario: Trashed message exists

- **WHEN** an account's Trash (or a `T`-flagged message) is inspected
- **THEN** at least one deleted/trashed message is present

### Requirement: Attachment coverage

The corpus SHALL include messages with attachments and messages without attachments, including at least one message with multiple attachments of differing MIME types.

#### Scenario: Messages with and without attachments

- **WHEN** the corpus is inspected
- **THEN** at least one message has one or more attachments
- **AND** at least one message has no attachments

#### Scenario: Multiple differing attachments

- **WHEN** an attachment-bearing message is inspected
- **THEN** at least one message carries multiple attachments of different MIME types

### Requirement: Subscription / mailing-list messages

The corpus SHALL include messages originating from mailing lists / subscriptions, carrying list headers (e.g. `List-Id`, `List-Unsubscribe`).

#### Scenario: Mailing-list message present

- **WHEN** the corpus is inspected
- **THEN** at least one message carries `List-Id` and/or `List-Unsubscribe` headers

### Requirement: Signature variants

The corpus SHALL include messages with valid signatures, messages with no signature, and messages with broken/invalid signatures, so the UI's signature-rendering paths can be exercised without a real cryptographic verifier.

#### Scenario: Signed, unsigned, and broken-signature messages exist

- **WHEN** the corpus is inspected
- **THEN** at least one message presents a well-formed signature
- **AND** at least one message has no signature
- **AND** at least one message presents a malformed/broken signature

### Requirement: Manifest as source of truth

The corpus SHALL be accompanied by a typed manifest enumerating accounts, folders, and the expected messages and their states/attributes. E2E specs SHALL assert against the manifest rather than hard-coded literals, and the manifest SHALL stay consistent with the on-disk corpus.

#### Scenario: Manifest matches on-disk corpus

- **WHEN** the manifest is compared against the on-disk corpus
- **THEN** every account, folder, and message described in the manifest exists on disk with the described state
- **AND** no manifest entry references a missing message
