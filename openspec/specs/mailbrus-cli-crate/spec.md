## Purpose

Define the mailbrus-cli binary crate that provides the command-line interface for mailbrus.

## ADDED Requirements

### Requirement: CLI is a binary crate producing the `mailbrus` executable
`mailbrus-cli/` SHALL be a Rust `bin` crate with `name = "mailbrus"` in its `Cargo.toml`.

#### Scenario: CLI binary is produced
- **WHEN** user runs `cargo build -p mailbrus-cli`
- **THEN** `target/debug/mailbrus` binary exists and is executable

### Requirement: CLI exits cleanly with a placeholder message
The CLI binary SHALL dispatch to subcommands via clap; it SHALL NOT print a placeholder message on bare invocation. Invoking `mailbrus` with no arguments SHALL print the clap help text and exit 0.

#### Scenario: No-argument invocation shows help
- **WHEN** user runs `mailbrus` with no arguments
- **THEN** stdout contains usage/help text and exit code is 0

### Requirement: `toon-rust` is a declared dependency of `mailbrus-cli`
`mailbrus-cli/Cargo.toml` SHALL declare `toon` as a git dependency pointing to `https://github.com/toon-format/toon-rust` pinned to a specific commit SHA.

#### Scenario: Cargo build resolves toon dep
- **WHEN** user runs `cargo build -p mailbrus-cli`
- **THEN** build succeeds and the toon crate is compiled

### Requirement: `clap` is a declared dependency of `mailbrus-cli`
`mailbrus-cli/Cargo.toml` SHALL declare `clap` with the `derive` feature.

#### Scenario: Cargo build resolves clap dep
- **WHEN** user runs `cargo build -p mailbrus-cli`
- **THEN** build succeeds and clap proc-macros are applied without error

### Requirement: Nix package `mailbrus` builds from the CLI crate
The `mailbrus` Nix derivation in `nix/pkgs.nix` SHALL build using `rustPlatform.buildRustPackage` targeting the workspace, producing the `mailbrus` binary.

#### Scenario: Nix CLI package installs binary
- **WHEN** `nix build .#mailbrus`
- **THEN** `result/bin/mailbrus` is present and executable
