## Why

`mailbrus-server` enforces a bearer token on `/api/*` when started with `--auth`, and
the SPA already knows how to read one from `window.__MAILBRUS_AUTH_TOKEN__`
(`src/lib/api.ts`). But nothing ever supplies that token: the desktop shell spawns the
sidecar without `--auth`, no code sets the injected global, and the browser/PWA path has
no way to enter a token at all. As a result the local API is reachable by any process on
the loopback interface, and turning on `--auth` manually makes both the desktop app and
the browser SPA appear broken (every `/api/*` call returns `401`). The delivery half of
the token mechanism is missing on both entry paths.

Token delivery differs by entry path: the **desktop shell** can inject a token it
generates itself, but the **browser/PWA** has no injector — so it needs a bootstrap
**auth screen**. Both paths also need **stale-token recovery** for when a stored token no
longer matches a restarted server.

## What Changes

- The desktop shell (`src-tauri`) generates a fresh, random bearer token on each launch.
- The bundled sidecar is spawned with `--auth <token>`, so the local API requires the
  token instead of relying on the loopback Host allowlist alone.
- The webview is created with an `initialization_script` that sets
  `window.__MAILBRUS_AUTH_TOKEN__ = "<token>"` before any SPA script runs, so the
  frontend (and, via its existing propagation, the service worker) authenticates
  automatically with no user action.
- The main window moves from a static `tauri.conf.json` `windows` entry to a
  programmatically-built `WebviewWindowBuilder` (required to attach the init script).
- **Frontend auth screen (browser/PWA path)**: when a boot-time `/api/*` probe returns
  `401` and no usable token is available (no injected global, no valid stored token), the
  SPA renders a blocking auth screen. The user pastes the `--auth` token; the SPA
  validates it by re-probing, then persists it via the existing `setAuthToken()`
  (localStorage + IndexedDB + service-worker message) and enters the app.
- **Stale-token recovery (lifecycle)**: a token is a stable per-process secret (no expiry,
  no refresh endpoint). When a request carries a token but still gets `401`, the SPA
  clears the stored token and returns to the auth screen (browser) or reloads the webview
  to re-inject (desktop). This is the only "refresh" path.
- **BREAKING** (desktop only): the packaged desktop app now runs the API under `--auth`.
  Any external tooling that previously hit `http://127.0.0.1:1371/api/*` unauthenticated
  will get `401`. Dev mode (`cargo tauri dev`, server started by `beforeDevCommand`) is
  unchanged and stays token-less.

## Capabilities

### New Capabilities
- `desktop-auth-token`: the desktop shell's generation of a per-launch bearer token, its
  handoff to the sidecar via `--auth`, and its injection into the webview so the SPA
  authenticates automatically.
- `frontend-auth-bootstrap`: the browser/PWA auth screen shown when the API requires a
  token that isn't available, plus the stale-token recovery that clears a rejected token
  and re-prompts. Covers token persistence hand-off to the existing `api.ts` plumbing.

### Modified Capabilities
- `mailbrus-desktop-crate`: the sidecar-spawn requirement gains the `--auth <token>`
  argument and the window is built in Rust rather than declared in `tauri.conf.json`.

## Impact

- Code (desktop): `src-tauri/src/lib.rs` (token generation, sidecar args, window builder +
  init script), `src-tauri/tauri.conf.json` (remove/trim the static `windows` entry), and
  a new RNG dependency in `src-tauri/Cargo.toml` (`getrandom`/`uuid` are already in
  `Cargo.lock`).
- Code (frontend): a new auth-screen component + boot-time gating on a `401` probe, and a
  `401`-with-token recovery hook in the shared fetch/`api.ts` layer. Reuses the existing
  `setAuthToken()` / `authHeaders()` / `readInitialToken()` plumbing — no new token store.
- Nix: `Cargo.lock` changes → update the shared `cargoHash` in `nix/pkgs.nix` in the same
  commit (per `CLAUDE.md`).
- Relies on existing `api-origin-validation` behavior (`--auth` enforcement); does not
  change server-side semantics (static-secret model needs no new server endpoints).
