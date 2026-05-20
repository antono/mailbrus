## MODIFIED Requirements

### Requirement: CLI exits cleanly with a placeholder message
The CLI binary SHALL dispatch to subcommands via clap; it SHALL NOT print a placeholder message on bare invocation. Invoking `mailbrus` with no arguments SHALL print the clap help text and exit 0.

#### Scenario: No-argument invocation shows help
- **WHEN** user runs `mailbrus` with no arguments
- **THEN** stdout contains usage/help text and exit code is 0

## ADDED Requirements

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
