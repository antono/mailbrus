## Context

mailbrus-core gains its first real module: a Maildir reader backed by
notmuch. The module has one job: expose a read-only view of the user's
already-indexed mail.

notmuch and mail sync are fully external to mailbrus. The user has
their own mbsync/offlineimap setup keeping Maildir up to date, and
their own notmuch configuration keeping the index fresh. mailbrus-core
opens the database read-only and never calls `notmuch new`.

## Decisions

### 1. notmuch is mandatory, not optional

**Decision:** notmuch is a hard dependency. No feature flag, no fallback
path that reads files directly.

**Rationale:** At 50k+ messages, reading full file contents on every
listing call is unacceptable. notmuch is the only performant path.
Making it optional would create two code paths to maintain with no
clear benefit — users who can't install notmuch are not the target
audience for mailbrus.

### 2. notmuch is the single source of truth

**Decision:** All listing, searching, and metadata comes from notmuch.
Body reads use paths returned by notmuch, not a separate Maildir root.

**Rationale:** notmuch stores the canonical path for each indexed
message. Passing in a separate Maildir root is redundant. If a path is
stale (message was deleted), that is the user's sync concern.

### 3. Direct notmuch query language, no DSL

**Decision:** `list_messages` takes a raw notmuch query string.
No query builder, no filter struct.

**Rationale:** notmuch's query language (`folder:INBOX tag:unread
from:alice`) is well-documented and expressive. An abstraction over it
adds complexity with no gain at this stage. CLI and Tauri layers
compose query strings as needed.

### 4. Error proxy for well-known errors

**Decision:** A `MailboxError` type wraps notmuch and I/O errors,
mapping well-known cases to named variants.

**Rationale:** Raw notmuch C-library errors are opaque to users. Named
variants (DatabaseNotFound, DatabaseLocked, MessageNotFound, etc.)
allow CLI and Tauri layers to present actionable messages.

### 5. Account config and credential management are out of scope

**Decision:** `MaildirReader::new` takes a `db_path: PathBuf`. No
account struct, no config file parsing, no credential storage.

**Rationale:** Account management is a separate concern implemented in
the CLI/Tauri layer.

### 6. SmtpSender is a separate change

**Decision:** io-smtp and SmtpSender are removed from this change.

**Rationale:** Read and send are independent capabilities. Keeping this
change read-only makes it focused and deliverable.

## Module Layout

```
mailbrus-core/src/
├── lib.rs               (re-exports modules, version())
├── maildir_reader.rs    (MaildirReader, Message, Headers, MaildirFlags, SortBy, PaginationOpts)
└── error.rs             (MailboxError)
```

## Data Flow

```
LIST MESSAGES
─────────────────────────────────────────────────────────────

  MaildirReader::list_messages("folder:INBOX", SortBy::Newest, { limit: 50, offset: 0 })
    │
    └──▶ notmuch::Database::open(db_path, ReadOnly)
           └──▶ db.create_query("folder:INBOX")
                  ├── query.count_messages() → total
                  └── query.search_messages()
                         .skip(offset)
                         .take(limit)
                         .map(msg → Message {
                             id:      msg.id(),
                             headers: Headers { from, subject, date, ... },
                             flags:   tags_to_flags(msg.tags()),
                         })
  return (Vec<Message>, total)


GET MESSAGE BODY
─────────────────────────────────────────────────────────────

  MaildirReader::get_message_body("abc123")
    │
    └──▶ db.find_message("abc123")
           └──▶ msg.filename() → PathBuf
                  └──▶ std::fs::read(path) → Vec<u8>
  return RFC 5322 bytes
```

## API

```rust
pub struct MaildirReader {
    db: notmuch::Database,
}

pub struct Message {
    pub id: String,
    pub headers: Headers,
    pub flags: MaildirFlags,
}

pub struct Headers {
    pub from: Option<String>,
    pub to: Vec<String>,
    pub subject: Option<String>,
    pub date: Option<i64>,          // Unix timestamp from notmuch
    pub message_id: Option<String>,
    pub in_reply_to: Option<String>,
}

pub struct MaildirFlags {
    pub seen: bool,
    pub replied: bool,
    pub flagged: bool,
    pub deleted: bool,
    pub draft: bool,
}

pub struct PaginationOpts {
    pub limit: usize,
    pub offset: usize,
}

pub enum SortBy {
    Newest,      // notmuch Sort::NewestFirst
    Oldest,      // notmuch Sort::OldestFirst
    Subject,     // notmuch Sort::MessageId (caller sorts alpha if needed)
    From,
    MessageId,
}

impl MaildirReader {
    pub fn new(db_path: impl AsRef<Path>) -> Result<Self, MailboxError>;

    pub fn list_messages(
        &self,
        query: &str,
        sort: SortBy,
        pagination: PaginationOpts,
    ) -> Result<(Vec<Message>, usize), MailboxError>;

    pub fn get_message_body(
        &self,
        message_id: &str,
    ) -> Result<Vec<u8>, MailboxError>;
}
```

## MailboxError

```rust
pub enum MailboxError {
    DatabaseNotFound { path: PathBuf },
    DatabaseLocked,
    DatabaseCorrupted(String),
    MessageNotFound { id: String },
    BodyReadFailed { path: PathBuf, reason: io::Error },
    QueryFailed(String),
}
```

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| notmuch index out of sync with disk | Out of scope; user's sync tooling responsibility |
| notmuch crate (0.8.0) last updated 2022 | Pin to known-good version; libnotmuch C API is stable |
| Offset-based pagination skips/duplicates on concurrent mutation | Acceptable for desktop single-user use case |
| libnotmuch is a required C library dep | Required system dep; provided by Nix derivation |
