## Purpose

Define the Nix build infrastructure for mailbrus, providing reproducible builds for CLI, desktop, and frontend targets.

## Requirements

### Requirement: Flake defines all build outputs
The flake.nix SHALL expose packages `mailbrus`, `mailbrus-desktop`, `mailbrus-frontend`, and `default` (= `mailbrus`) for each default system via `flake-utils.lib.eachDefaultSystem`.

#### Scenario: CLI package builds
- **WHEN** user runs `nix build .#mailbrus`
- **THEN** build succeeds and `result/bin/mailbrus` is present

#### Scenario: Desktop package builds
- **WHEN** user runs `nix build .#mailbrus-desktop`
- **THEN** build succeeds and `result/bin/mailbrus-desktop` is present

#### Scenario: Frontend package builds
- **WHEN** user runs `nix build .#mailbrus-frontend`
- **THEN** build succeeds and `result/` contains static frontend assets

#### Scenario: Default package is CLI
- **WHEN** user runs `nix build`
- **THEN** result is identical to `nix build .#mailbrus`

### Requirement: Nix layout mirrors cerbo
The `nix/` directory SHALL contain `deps.nix`, `pkgs.nix`, and `devshell.nix`. `flake.nix` SHALL delegate to these files rather than inlining definitions.

#### Scenario: devShell is available
- **WHEN** user runs `nix develop`
- **THEN** shell opens with Rust toolchain, `pkg-config`, `deno`, and all system deps on PATH

### Requirement: Flake inputs do not include bun2nix
The `flake.nix` inputs SHALL NOT include `bun2nix`. Deno SHALL be sourced from `nixpkgs` directly as `pkgs.deno`.

#### Scenario: Flake evaluates without bun2nix
- **WHEN** user runs `nix flake show`
- **THEN** evaluation succeeds and no bun2nix input appears in the lock file

### Requirement: Frontend Nix build uses Deno
The `mailbrus-frontend` derivation SHALL use `pkgs.deno` as its build tool, running `deno task build` to produce the static output.

#### Scenario: Frontend build is reproducible
- **WHEN** `nix build .#mailbrus-frontend` is run on a clean machine
- **THEN** build completes using `deno.lock` for dependency resolution

### Requirement: Git dependencies have declared output hashes
Any `Cargo.toml` git dependency (e.g. `io-email`) SHALL have a corresponding entry in `cargoLock.outputHashes` inside the Nix package derivation.

#### Scenario: Nix build with git dep succeeds
- **WHEN** `io-email` is a git dependency in Cargo.toml
- **THEN** `nix build .#mailbrus` does not fail with a hash mismatch error
