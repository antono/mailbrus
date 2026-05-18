## Context

mailbrus-core gains its first three real modules: a Maildir reader,
an optional notmuch index, and an SMTP sender. All three build on
pimalaya's io-* coroutine model: I/O-free state machines that describe
what filesystem or network operations to perform; the caller (the
blocking client) drives the loop.

The 50k-message constraint makes the architecture decision clear:
io-maildir's `message_list` coroutine reads full file contents for
every message on every listing call. That is too slow as the primary
list path. notmuch is the index; io-maildir is the I/O layer for
individual message access.

## Decisions

### 1. notmuch as the primary listing path (feature-gated)

**Decision:** When the `notmuch` feature is compiled in, all folder
listings go through the notmuch database. io-maildir is used only for
reading message bodies by path returned from notmuch.

**Rationale:** notmuch maintains a pre-built Xapian index with parsed
headers. Listing 50k messages returns in milliseconds; io-maildir
alone would require reading 50k files. The tradeoff is a C library
dependency (`libnotmuch`) that not all users will have.

**Non-destructive use:** queries are read-only. Tag writes (`+seen`,
`-new`) are the only mutations. `notmuch new` is never called.

**Alternative considered:** header-only lazy reads with a local SQLite
cache. Rejected: significant implementation work with worse search
than notmuch; reinventing what notmuch already does well.

### 2. io-maildir for all message I/O (both paths)

**Decision:** `message_get` and all write coroutines (move, delete,
store, flags) go through io-maildir in both the notmuch and non-notmuch
paths.

**Rationale:** notmuch does not provide message body access — only
metadata and file paths. io-maildir is the right layer for actual file
operations regardless of whether notmuch is the index.

### 3. Feature flag `notmuch` — compile-time, not runtime

**Decision:** `notmuch` is a Cargo feature flag. There is no runtime
detection or fallback.

**Rationale:** Cleaner than runtime feature detection. Users who want
notmuch build with `-F notmuch`. The Nix derivation will expose a
`mailbrus-notmuch` variant with the feature enabled.

**Trade-off:** Two binary variants rather than one adaptive binary.
Acceptable at this stage; a runtime feature toggle can be added later.

### 4. Direct io-smtp, not io-email umbrella

**Decision:** Depend on `io-smtp` directly, not via `io-email`'s smtp
feature.

**Rationale:** io-email's account abstraction is valuable when managing
multiple backends (IMAP + Maildir + JMAP). This change only needs SMTP
send. Direct dependency is simpler and avoids pulling in io-imap
transitively. io-email can replace this later if IMAP sync is added.

### 5. Credentials at call site, no account config

**Decision:** `SmtpSender::send` accepts credentials as parameters.
No account config struct in this change.

**Rationale:** Account management is a separate concern. Hardcoding
a config shape now would constrain the future account model. The CLI
and Tauri frontends will handle credential sourcing (env vars, keyring,
config file) in a separate change.

## Module Layout

```
mailbrus-core/src/
├── lib.rs                  (re-exports modules, version())
├── maildir_reader.rs       (MaildirReader: list, get, sort)
├── notmuch_index.rs        (#[cfg(feature="notmuch")] NotmuchIndex)
└── smtp_sender.rs          (SmtpSender: send)
```

## Data Flow

```
WITHOUT notmuch feature
────────────────────────────────────────────────────────

  MaildirReader::list(root)
    │
    └──▶ io-maildir MaildirClient::list_messages()
           │
           ├── WantsDirRead  →  std::fs::read_dir
           └── WantsFileRead →  std::fs::read (full file)
                                    │
                                    └──▶ mail-parser → Message { headers }
  sort by header in-memory
  return Vec<Message>


WITH notmuch feature
────────────────────────────────────────────────────────

  NotmuchIndex::list(query)
    │
    └──▶ notmuch::Database::open (read-only)
           └──▶ query.search_messages()
                  └──▶ returns (id, path, headers) instantly

  MaildirReader::get(path) — on demand, when body needed
    │
    └──▶ io-maildir MaildirClient::get_message(path)
           └──▶ single file read


SEND (both paths)
────────────────────────────────────────────────────────

  SmtpSender::send(host, creds, message_bytes)
    │
    └──▶ io-smtp blocking client
           ├── connect + EHLO
           ├── STARTTLS
           ├── AUTH PLAIN
           └──▶ DATA → message bytes → QUIT
```

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| notmuch crate (0.8.0) last updated 2022 | Pin to known-good version; libnotmuch C API is stable |
| io-smtp git dep needs `cargoLock.outputHashes` in Nix | Add hash after `cargo fetch`; same pattern as io-maildir |
| `message_list` reads full files (non-notmuch path) | Acceptable for <10k messages; document the notmuch recommendation |
| SMTP auth models vary (PLAIN, OAuth2, XOAUTH2) | Implement PLAIN only in this change; OAuth2 is a separate capability |

## Open Questions

- Should `MaildirReader::list` accept a root path or a configured
  account struct? Leaning toward plain `PathBuf` now; account config
  comes later.
- notmuch tag writes: mirror Maildir flags (seen ↔ `+seen` tag) or
  treat them independently? Defer to a separate tags capability.
