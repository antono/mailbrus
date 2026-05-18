## ADDED Requirements

### Requirement: Workspace root Cargo.toml declares all members
The root `Cargo.toml` SHALL be a Cargo workspace manifest with members `mailbrus-core`, `mailbrus-cli`, `src-tauri` and `resolver = "2"`.

#### Scenario: Workspace builds all crates
- **WHEN** user runs `cargo build --workspace`
- **THEN** all three crates compile without errors

#### Scenario: Single Cargo.lock at workspace root
- **WHEN** the workspace is created
- **THEN** there is exactly one `Cargo.lock` at the project root; no crate subdirectory has its own lock file

### Requirement: Workspace uses a shared dependency resolver
The workspace SHALL declare `resolver = "2"` to enable the v2 feature resolver.

#### Scenario: Feature flags are resolved per-package
- **WHEN** `mailbrus-cli` and `src-tauri` enable different feature flags on a shared dep
- **THEN** Cargo resolves them independently per `resolver = "2"` semantics
