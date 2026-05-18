## Why

Mailbrus needs a proper project scaffold mirroring the cerbo monorepo layout (core + cli + tauri + SvelteKit frontend) before any feature development can begin. Establishing the Nix build infrastructure, Cargo workspace, and crate boundaries now avoids costly restructuring later.

## What Changes

- Add `flake.nix` with three Nix packages: `mailbrus` (CLI), `mailbrus-desktop` (Tauri GUI), `mailbrus-frontend` (SvelteKit build)
- Add `nix/` directory with `deps.nix`, `pkgs.nix`, `devshell.nix` (same pattern as cerbo)
- Add Cargo workspace (`Cargo.toml`) with members: `mailbrus-core`, `mailbrus-cli`, `src-tauri`
- Scaffold `mailbrus-core/` — shared Rust library crate with `pimalaya/io-email` as a dependency
- Scaffold `mailbrus-cli/` — binary crate producing the `mailbrus` CLI executable
- Scaffold `src-tauri/` — Tauri binary crate producing `mailbrus-desktop`, with `tauri.conf.json`
- Add SvelteKit frontend scaffold (`svelte.config.js`, `vite.config.js`, `deno.json`)

## Capabilities

### New Capabilities

- `nix-build-infrastructure`: Nix flake with packages, devShell, and bun2nix frontend build — mirrors cerbo's `nix/` layout
- `cargo-workspace`: Rust workspace with `mailbrus-core`, `mailbrus-cli`, `src-tauri` members
- `mailbrus-core-crate`: Shared library crate; owns email logic via `io-email`; consumed by both CLI and desktop
- `mailbrus-cli-crate`: CLI binary crate (`mailbrus`); thin entry point delegating to core
- `mailbrus-desktop-crate`: Tauri binary crate (`mailbrus-desktop`); thin entry point delegating to core
- `sveltekit-frontend-scaffold`: SvelteKit + Vite frontend, consumed by `mailbrus-desktop` via `frontendDist`

### Modified Capabilities

## Impact

- `flake.nix` — new file, defines all Nix outputs
- `nix/` — new directory
- `Cargo.toml` — new workspace root
- `mailbrus-core/`, `mailbrus-cli/`, `src-tauri/` — new crate directories
- `svelte.config.js`, `vite.config.js`, `deno.json`, `deno.lock` — new frontend scaffold files
- No existing code affected (greenfield)
