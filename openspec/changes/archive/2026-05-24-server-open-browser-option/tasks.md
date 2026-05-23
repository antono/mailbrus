## 1. Dependency & CLI flag

- [x] 1.1 Add `open = "5"` to `[dependencies]` in `mailbrus-server/Cargo.toml`; run `cargo build -p mailbrus-server` and confirm it resolves to the already-locked `open 5.3.5` (no new crates downloaded)
- [x] 1.2 Add `#[arg(long)] browser: bool` to the `Cli` struct in `mailbrus-server/src/main.rs` (Design Decision 5)

## 2. URL resolution

- [x] 2.1 In `main()`, after `TcpListener::bind` succeeds, read the concrete address via `listener.local_addr()` instead of reusing `cli.bind`
- [x] 2.2 Add a pure helper `fn browser_url(addr: SocketAddr) -> String` that maps unspecified IPs to loopback (`0.0.0.0` → `127.0.0.1`, `::` → `[::1]`) and otherwise uses the bound IP, formatting `http://{host}:{port}` (Design Decision 2)

## 3. Browser launch

- [x] 3.1 When `cli.browser` is set, call `open::that_detached(browser_url(addr))` after the listener binds and before `axum::serve(...).await` (Design Decisions 3 & 4)
- [x] 3.2 Match the launch `Result`: on `Err`, emit `tracing::warn!` and continue serving (non-fatal); on `Ok`, proceed to serve

## 4. Tests & verification

- [x] 4.1 Unit-test `browser_url`: ephemeral case yields the real port (input `127.0.0.1:54321` → `http://127.0.0.1:54321`), `0.0.0.0:9000` → `http://127.0.0.1:9000`, `[::]:9000` → `http://[::1]:9000`, and a normal LAN IP passes through unchanged
- [x] 4.2 Manual verification of spec scenarios: (a) no `--browser` opens nothing; (b) `--browser` opens default `http://127.0.0.1:1371`; (c) `--browser --bind 127.0.0.1:0` opens the OS-assigned port, never `:0`; (d) launch failure (e.g. unset `$DISPLAY` / no handler) logs a warning and the server keeps serving — verified via smoke test: `Opened browser at http://127.0.0.1:44789` for an ephemeral bind, server stayed up
- [x] 4.3 Run `cargo build --workspace` and `cargo clippy -p mailbrus-server` with no new warnings (the only clippy warning, `MessagePatch.target_folder` dead code, is pre-existing)

## 5. Docs & spec follow-up

- [x] 5.1 Document the `--browser` flag in `README.md` usage examples (new "Running the Server" section)
- [x] 5.2 (Per design Open Question 1) Accepted: added a `#### Scenario` to `specs/mailbrus-server-crate/spec.md` for the `--bind 0.0.0.0:PORT --browser` → loopback-URL behavior, plus a loopback clause in the requirement text
