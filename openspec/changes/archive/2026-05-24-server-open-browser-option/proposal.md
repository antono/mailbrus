## Why

Starting `mailbrus-server` prints a URL the user must copy-paste into a browser to reach the app. When the server binds to an ephemeral port (`--bind 127.0.0.1:0`), the actual port is unknown until after startup, making that manual step error-prone. A `--browser` flag that auto-opens the default browser at the *resolved* server URL removes this friction and matches the convenience users expect from local dev servers.

## What Changes

- Add a `--browser` boolean CLI flag to `mailbrus-server` (opt-in; default off).
- When `--browser` is set, open the system default browser at the server URL **after** the TCP listener has successfully bound.
- The opened URL is built from the listener's *actual* bound address (`listener.local_addr()`), so dynamic/ephemeral ports (`--bind 127.0.0.1:0`) resolve to the real port — never the literal `:0`.
- Browser launching uses a cross-platform mechanism that works on Linux, macOS, and Windows.
- A failure to launch the browser is non-fatal: the server keeps serving and logs a warning.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `mailbrus-server-crate`: extend the existing "Server starts and listens on configurable address" requirement with a new `--browser` flag and the resolved-URL / dynamic-port opening behavior.

## Impact

- **Code**: `mailbrus-server/src/main.rs` — add a field to the `Cli` struct (`main.rs:57`) and post-bind logic in `main()` (after `main.rs:505`).
- **Dependencies**: add a small cross-platform browser-launch crate (e.g. `open`) to `mailbrus-server/Cargo.toml`.
- **Behavior**: opt-in flag; default behavior unchanged; no breaking changes.
- **Docs**: README usage examples gain the `--browser` flag.

## Non-goals

- Auto-opening the browser by default — it stays opt-in.
- Selecting a specific browser or honoring a `$BROWSER`-style override beyond the OS default.
- Headless / CI environment detection or auto-suppression.
- Changing the default bind address or introducing an ephemeral-port default.
