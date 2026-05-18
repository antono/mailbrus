## ADDED Requirements

### Requirement: Core is a library crate
`mailbrus-core/` SHALL be a Rust `lib` crate (no `[[bin]]` target). Its `Cargo.toml` SHALL set `name = "mailbrus-core"`.

#### Scenario: Core compiles as library
- **WHEN** user runs `cargo build -p mailbrus-core`
- **THEN** build produces `libmailbrus_core.rlib` with no binary artefact

### Requirement: Core declares io-email as a dependency
`mailbrus-core/Cargo.toml` SHALL declare `email` from `https://github.com/pimalaya/io-email` as a dependency.

#### Scenario: io-email types are accessible from core
- **WHEN** `mailbrus-core/src/lib.rs` imports from the `email` crate
- **THEN** compilation succeeds

### Requirement: Core is a path dependency for CLI and desktop
Both `mailbrus-cli` and `src-tauri` SHALL declare `mailbrus-core = { path = "../mailbrus-core" }` in their `Cargo.toml`.

#### Scenario: CLI uses core
- **WHEN** `mailbrus-cli/src/main.rs` imports from `mailbrus_core`
- **THEN** compilation succeeds without duplicating email logic

#### Scenario: Desktop uses core
- **WHEN** `src-tauri/src/main.rs` imports from `mailbrus_core`
- **THEN** compilation succeeds without duplicating email logic

### Requirement: Core exposes a placeholder public API
At scaffold stage, `mailbrus-core/src/lib.rs` SHALL export at least one public symbol (e.g. `pub fn version() -> &'static str`) so dependents have a non-empty surface to import.

#### Scenario: Placeholder compiles and links
- **WHEN** `cargo test -p mailbrus-core` is run
- **THEN** at least one test passes (doc-test or unit test on the placeholder function)
