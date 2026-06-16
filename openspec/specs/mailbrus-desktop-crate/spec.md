## Purpose

Define the mailbrus-desktop Tauri crate that provides the desktop application interface for mailbrus.

## Requirements

### Requirement: Desktop is a Tauri binary crate
`src-tauri/` SHALL contain a Rust `bin` crate with `name = "mailbrus-desktop"` and a `tauri.conf.json` configuring the app identifier and window title.

#### Scenario: Desktop crate compiles
- **WHEN** user runs `cargo build -p mailbrus-desktop`
- **THEN** build succeeds (Tauri devServer URL may be used in dev builds)

### Requirement: tauri.conf.json defines app metadata
`src-tauri/tauri.conf.json` SHALL set `productName = "mailbrus-desktop"`, `identifier` as a reverse-DNS string, and `frontendDist` pointing to the SvelteKit build output directory.

#### Scenario: Config is valid JSON parseable by Tauri
- **WHEN** `cargo tauri build --debug` is run
- **THEN** Tauri CLI reads `tauri.conf.json` without error

### Requirement: Nix desktop package patches frontendDist at build time
The `mailbrus-desktop` Nix derivation SHALL use `jq` in a `postPatch` step to rewrite `tauri.conf.json`, setting `frontendDist` to the `mailbrus-frontend` store path and nulling `devUrl`.

#### Scenario: Nix desktop build uses correct frontend
- **WHEN** `nix build .#mailbrus-desktop`
- **THEN** the resulting binary loads frontend assets from the Nix store, not a dev server

### Requirement: Desktop Nix package includes `.desktop` file and icons
The `mailbrus-desktop` derivation's `postInstall` SHALL install a `mailbrus-desktop.desktop` file and icons at standard XDG paths (`share/applications`, `share/icons/hicolor/...`).

#### Scenario: Desktop entry is installed
- **WHEN** `nix build .#mailbrus-desktop`
- **THEN** `result/share/applications/mailbrus-desktop.desktop` exists
