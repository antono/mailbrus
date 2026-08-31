## MODIFIED Requirements

### Requirement: Desktop is a Tauri binary crate
`src-tauri/` SHALL contain a Rust `bin` crate with `name = "mailbrus-desktop"` and a `tauri.conf.json` configuring the app identifier. The main application window SHALL be constructed programmatically in Rust via `WebviewWindowBuilder` with the label `"main"` (rather than declared statically in `tauri.conf.json`'s `windows` array), so that an initialization script can be attached to the webview. The window SHALL retain its title and default size.

#### Scenario: Desktop crate compiles
- **WHEN** user runs `cargo build -p mailbrus-desktop`
- **THEN** build succeeds (Tauri devServer URL may be used in dev builds)

#### Scenario: Main window is built in Rust with the "main" label
- **WHEN** the desktop app starts
- **THEN** a single window labelled `"main"` is created via `WebviewWindowBuilder`
- **AND** existing capabilities that reference the `"main"` window continue to apply
