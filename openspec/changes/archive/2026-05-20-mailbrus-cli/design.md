## Context

`mailbrus-cli` is a Rust bin crate producing the `mailbrus` binary. Currently it prints a placeholder and exits. `mailbrus-core` exposes `MaildirReader` with `list_messages` and `get_message_body`; it has no maildir/folder enumeration yet. The notmuch database path is the single source of truth for all maildir state.

## Goals / Non-Goals

**Goals:**
- Three subcommand groups: `maildir list`, `folder list`, `message list`
- `--version` flag (clap built-in)
- `-o/--output` flag on every list subcommand: `text` (default), `json`, `toon`
- Add `toon-rust` (GitHub) as a dep for toon-format rendering

**Non-Goals:**
- Pagination, filtering, or sorting flags (future change)
- Mutating operations (send, archive, delete)
- Shell completions

## Decisions

### 1. CLI framework: clap derive API

Use `clap` with `#[derive(Parser)]`. Less boilerplate than builder API; proc-macro errors surface at compile time.

**Alternative considered**: `argh` — simpler but weaker ecosystem and no built-in `--version`.

### 2. Command structure: nested subcommands

```
mailbrus
  maildir
    list          # list top-level maildir paths from notmuch config
  folder
    list          # list folders (subdirs) within a maildir
  message
    list          # list messages via MaildirReader::list_messages
```

Each leaf command carries `-o/--output <format>` (enum: `Text | Json | Toon`).

**Alternative considered**: flat commands (`mailbrus list-maildirs`) — rejected; noun-verb grouping scales better as commands grow.

### 3. Output formatting: centralized `OutputFormat` enum

Define `enum OutputFormat { Text, Json, Toon }` in `mailbrus-cli`. Each command returns a `serde_json::Value` (or typed struct implementing `Serialize` + `Display`). The dispatcher matches on `OutputFormat` and calls `println!`, `serde_json::to_string_pretty`, or `toon::to_string`.

**Alternative considered**: per-command format branches — duplicates logic, harder to keep consistent.

### 4. `maildir list` and `folder list` via new core methods

`MaildirReader` currently has only `list_messages`. Two new methods are needed:
- `list_maildirs() -> Result<Vec<PathBuf>>` — reads `database.path` config entry (and any extra paths) from notmuch.
- `list_folders(maildir: &Path) -> Result<Vec<String>>` — walks one maildir root and returns subfolder names (cur/new/tmp are filtered out; Maildir++ folder names starting with `.` are included).

**Alternative considered**: shell out to `notmuch search --output=folders` — avoids adding core methods but couples CLI to subprocess, complicates testing.

### 5. `toon-rust` dependency via Cargo git source

`toon-rust` is not on crates.io. Add to `mailbrus-cli/Cargo.toml`:
```toml
toon = { git = "https://github.com/toon-format/toon-rust" }
```
The nix `buildRustPackage` requires all git deps to be declared in `Cargo.lock` and their hashes in `cargoHash`. Update `flake.nix` / `nix/deps.nix` accordingly after `cargo fetch`.

**Alternative considered**: vendor toon-rust — unnecessary complexity at this stage.

## Risks / Trade-offs

- [toon-rust is unpinned] → Pin to a specific commit SHA in Cargo.toml (`rev = "<sha>"`) to keep builds reproducible.
- [notmuch API surface for maildir config] → Validate against notmuch Rust bindings; fallback to reading `~/.notmuch-config` directly if the binding is absent.
- [Nix cargoHash invalidation on dep changes] → Rebuild hash after every `cargo fetch`; document in nix/deps.nix.

## Open Questions

- Should `folder list` accept a `--maildir <path>` argument, or default to the first configured maildir?
- Should `message list` require a `--folder <name>` argument or default to `*` (all messages)?
