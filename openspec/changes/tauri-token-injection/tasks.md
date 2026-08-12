## 1. Desktop shell: token generation & sidecar handoff

- [ ] 1.1 Add a RNG dependency to `src-tauri/Cargo.toml` (`getrandom`, already in `Cargo.lock`) for token generation.
- [ ] 1.2 In `src-tauri/src/lib.rs`, add a helper that generates a 256-bit random token (32 bytes from `getrandom`) hex-encoded to a 64-char string.
- [ ] 1.3 In the `#[cfg(not(dev))]` setup block, generate the token once and pass `--auth <token>` in the sidecar `.args([...])` list alongside the existing `--bind`/`--frontend-dist` args.

## 2. Desktop shell: window construction & injection

- [ ] 2.1 Remove the static `windows` entry from `src-tauri/tauri.conf.json` (keep `app.security`/CSP and other config).
- [ ] 2.2 In `setup()`, build the main window unconditionally via `WebviewWindowBuilder::new(app, "main", WebviewUrl::External(server_url))`, replicating the previous title (`"mailbrus"`) and size (`1200x800`).
- [ ] 2.3 In `#[cfg(not(dev))]` only, attach `.initialization_script(&format!("window.__MAILBRUS_AUTH_TOKEN__ = {};", serde_json::to_string(&token)?))` to the builder before `.build()`.
- [ ] 2.4 Verify the dev path builds the window with no init script and no `--auth` (token-less), preserving current `cargo tauri dev` behavior.
- [ ] 2.5 Confirm `cargo build -p mailbrus-desktop` succeeds and the `"main"` window label still matches `src-tauri/capabilities/*.json`.

## 3. Nix build maintenance

- [ ] 3.1 Run `nix build .#mailbrus-desktop`, capture the `got: sha256-…` value, and update the shared `cargoHash` in `nix/pkgs.nix` for all three packages in the same commit; re-run to verify.

## 4. Frontend: auth gate & bootstrap screen

- [ ] 4.1 Add an auth-gate store (`checking → authed | needs-token`) that runs one boot probe (`GET /api/maildirs`) using the token from `readInitialToken()`.
- [ ] 4.2 Map probe outcomes: `200` → `authed`; `401` with no usable token → `needs-token`; network/`5xx` → non-auth path (do not show the auth screen).
- [ ] 4.3 Create `<AuthScreen>` component: token input, submit, re-probe validation; on success call `setAuthToken(token)` and set `authed`; on `401` keep visible with an error.
- [ ] 4.4 Gate rendering in `src/routes/+layout.svelte`: render `<AuthScreen>` when `needs-token`, a loading state when `checking`, and `children` when `authed`.

## 5. Frontend: stale-token recovery

- [ ] 5.1 Add a shared response check that, on a `401` when a token was attached, calls `setAuthToken(null)` and flips the gate store to `needs-token`.
- [ ] 5.2 Wire the check into `apiFetch` (`src/lib/api.ts`) and route the direct `/api` `fetch()` callers through it: `OnboardingWizard.svelte`, `SettingsPanel.svelte`, `mutations.ts`, `outbox.ts`, `[...path]/+page.svelte`.
- [ ] 5.3 Handle the desktop edge case: a `401`-with-token offers a window reload (re-injects the current token) rather than a useless token-entry prompt; log loudly.

## 6. Tests

- [ ] 6.1 E2E (browser bootstrap): server with `--auth`, no injected token → auth screen appears; entering the correct token unlocks the app; a wrong token is rejected.
- [ ] 6.2 E2E (stale recovery): authed session, server restarts with a new token, next `/api/*` call → token cleared and auth screen re-appears.
- [ ] 6.3 E2E (no-auth path): server without `--auth` → app loads directly, auth screen never shown.
- [ ] 6.4 E2E/desktop-ish (injection): a page with `window.__MAILBRUS_AUTH_TOKEN__` preset against an `--auth` server → app loads with no screen and `/api/*` carries the bearer token.
- [ ] 6.5 Rust unit test: token generator produces distinct 64-char hex strings across calls.

## 7. Validation & cleanup

- [ ] 7.1 Run `deno task test:e2e` and iterate until green; fix regressions surfaced by the auth gate.
- [ ] 7.2 Fix all Rust compilation warnings (`cargo build -p mailbrus-desktop`) and frontend type/lint warnings (`deno task check`).
- [ ] 7.3 Verify the bundled app (`cargo tauri build`) opens one correctly-sized window and authenticates automatically end-to-end.
