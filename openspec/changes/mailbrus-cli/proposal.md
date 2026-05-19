## Why

The `mailbrus` binary currently prints a placeholder and exits. Users need real maildir inspection commands to start using mailbrus from the terminal, and a consistent output format switch (`-o`) to compose with other tools.

## What Changes

- Add subcommand group `maildir` with subcommand `list` — enumerate maildirs known to notmuch
- Add subcommand group `folder` with subcommand `list` — enumerate folders inside a maildir
- Add subcommand group `message` with subcommand `list` — enumerate messages in a folder
- Each subcommand accepts `-o <format>` flag (values: `json`, `text`, `toon`; default: `text`)
- Add `toon-rust` crate as a dependency of `mailbrus-cli` for toon-format output
- Add `--version` flag (clap built-in, prints crate version from `Cargo.toml`)
- Remove placeholder main body; replace with clap-driven dispatch

## Capabilities

### New Capabilities
- `maildir-commands`: `maildir list`, `folder list`, `message list` subcommands with shared `-o` output-format flag

### Modified Capabilities
- `mailbrus-cli-crate`: CLI crate gains real subcommand dispatch instead of placeholder exit; binary name `mailbrus` unchanged

## Impact

- `mailbrus-cli/`: new dependencies (`clap`, `toon-rust`), `src/main.rs` rewritten
- `mailbrus-core/`: read-only; commands consume existing `MaildirReader`
- `Cargo.toml` workspace: no structural changes
- `flake.nix` / `nix/`: `toon-rust` may need a nix dep entry if not in nixpkgs
