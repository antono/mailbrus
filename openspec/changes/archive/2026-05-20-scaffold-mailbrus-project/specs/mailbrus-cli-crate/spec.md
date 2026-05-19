## ADDED Requirements

### Requirement: CLI is a binary crate producing the `mailbrus` executable
`mailbrus-cli/` SHALL be a Rust `bin` crate with `name = "mailbrus"` in its `Cargo.toml`.

#### Scenario: CLI binary is produced
- **WHEN** user runs `cargo build -p mailbrus-cli`
- **THEN** `target/debug/mailbrus` binary exists and is executable

### Requirement: CLI exits cleanly with a placeholder message
At scaffold stage the CLI binary SHALL print a placeholder message and exit 0 when invoked with no arguments.

#### Scenario: Placeholder run
- **WHEN** user runs `./mailbrus`
- **THEN** stdout contains a non-empty message (e.g. version string) and exit code is 0

### Requirement: Nix package `mailbrus` builds from the CLI crate
The `mailbrus` Nix derivation in `nix/pkgs.nix` SHALL build using `rustPlatform.buildRustPackage` targeting the workspace, producing the `mailbrus` binary.

#### Scenario: Nix CLI package installs binary
- **WHEN** `nix build .#mailbrus`
- **THEN** `result/bin/mailbrus` is present and executable
