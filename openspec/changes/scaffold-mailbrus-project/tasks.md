## 1. Nix Infrastructure

- [x] 1.1 Update `flake.nix`: remove `bun2nix` input, keep `nixpkgs` + `flake-utils` only
- [x] 1.2 Create `nix/deps.nix` with `tauri-deps` and `dev-deps` (Rust toolchain, deno, pkg-config)
- [x] 1.3 Create `nix/devshell.nix` with Rust toolchain, deno, pkg-config, and tauri system deps
- [x] 1.4 Create `nix/pkgs.nix` with `mailbrus` derivation (rustPlatform.buildRustPackage, CLI binary)
- [x] 1.5 Add `mailbrus-frontend` derivation to `nix/pkgs.nix` (deno task build, static output)
- [x] 1.6 Add `mailbrus-desktop` derivation to `nix/pkgs.nix` (buildAndTestFocus, postPatch jq tauri.conf.json, postInstall .desktop + icons)
- [x] 1.7 Update `flake.nix` outputs to expose `mailbrus`, `mailbrus-desktop`, `mailbrus-frontend`, `default = mailbrus`

## 2. Cargo Workspace

- [x] 2.1 Create root `Cargo.toml` as workspace manifest with members `["mailbrus-core", "mailbrus-cli", "src-tauri"]` and `resolver = "2"`

## 3. mailbrus-core Crate

- [x] 3.1 Create `mailbrus-core/Cargo.toml` as a `lib` crate with `io-email` git dependency from `https://github.com/pimalaya/io-email`
- [x] 3.2 Create `mailbrus-core/src/lib.rs` with a placeholder `pub fn version() -> &'static str` and a doc-test
- [x] 3.3 Add `cargoLock.outputHashes` entry for `io-email` git dep in `nix/pkgs.nix` (both CLI and desktop derivations)

## 4. mailbrus-cli Crate

- [x] 4.1 Create `mailbrus-cli/Cargo.toml` as a `[[bin]]` crate named `mailbrus` with `mailbrus-core` path dependency
- [x] 4.2 Create `mailbrus-cli/src/main.rs` printing `mailbrus-core::version()` and exiting 0

## 5. mailbrus-desktop Crate (Tauri)

- [x] 5.1 Create `src-tauri/Cargo.toml` as a `[[bin]]` crate named `mailbrus-desktop` with `tauri` and `mailbrus-core` dependencies
- [x] 5.2 Create `src-tauri/src/main.rs` with minimal Tauri app entry point
- [x] 5.3 Create `src-tauri/tauri.conf.json` with `productName`, reverse-DNS `identifier`, and `frontendDist = "../build"`
- [x] 5.4 Create `src-tauri/mailbrus-desktop.desktop` XDG desktop entry file
- [x] 5.5 Add placeholder icons to `src-tauri/icons/` (32x32.png, 64x64.png, 128x128.png, logo.svg)
- [x] 5.6 Create `src-tauri/capabilities/` with a default capability JSON (Tauri v2 requirement)

## 6. SvelteKit Frontend

- [x] 6.1 Create `deno.json` with `dev`, `build`, and `preview` tasks delegating to Vite/SvelteKit CLI
- [x] 6.2 Create `package.json` (npm compat for SvelteKit deps resolution under Deno)
- [x] 6.3 Create `svelte.config.js` with `@sveltejs/adapter-static`
- [x] 6.4 Create `vite.config.js` with SvelteKit Vite plugin
- [x] 6.5 Create `src/app.html` (SvelteKit HTML shell)
- [x] 6.6 Create `src/routes/+page.svelte` with a minimal placeholder page
- [ ] 6.7 Run `deno install` to generate `deno.lock` and commit it

## 7. Verification

- [x] 7.1 Run `cargo build --workspace` and confirm all three crates compile
- [x] 7.2 Run `cargo test -p mailbrus-core` and confirm placeholder doc-test passes
- [x] 7.3 Confirm `nix flake show` evaluates without errors
