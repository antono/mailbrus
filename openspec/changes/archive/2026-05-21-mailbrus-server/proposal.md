## Why

The SvelteKit frontend (`src/`) is fully built but runs entirely on mock data. The Rust backend (`mailbrus-core`) has a complete API for maildirs, folders, messages, and search — but no bridge to the UI exists. `mailbrus-server` closes this gap as a **standalone HTTP server** that:

1. Serves the compiled SvelteKit frontend as static files
2. Exposes the `mailbrus-cli` commands as JSON REST endpoints
3. Runs independently of Tauri — enabling self-hosted remote webmail (server on a home machine, access from any browser)

The Tauri desktop app remains a separate concern; it can optionally connect to a running `mailbrus-server` instance but does not own or embed it.

## What Changes

- Add a `mailbrus-server` Rust binary crate: standalone `axum` HTTP server
  - Serves compiled SvelteKit `build/` assets at `/` (via `tower-http` static file middleware)
  - Exposes JSON API at `/api/` mirroring all `mailbrus-cli` subcommands
  - Configurable bind address and port (`--bind 0.0.0.0:1371`)
  - Optional basic authentication for remote access
- Replace mock data in `src/lib/data.ts` with live `fetch("/api/...")` calls
- SvelteKit build output (`build/`) is bundled into the server binary or served from a configured path
- Add the crate to the Cargo workspace

**API endpoints (mirrors CLI subcommands):**
- `GET /api/maildirs` → `maildir list`
- `GET /api/maildirs/:id/folders` → `folder list`
- `GET /api/maildirs/:id/folders/:folder/messages?page=N&per_page=N` → `message list`
- `GET /api/messages/search?q=QUERY&page=N&per_page=N` → `message search`
- `GET /api/messages/:id` → `message read`
- `POST /api/messages` → send via smtp-sender

## Capabilities

### New Capabilities
- `mailbrus-server-crate`: Standalone `mailbrus-server` binary crate — axum HTTP server serving both the SvelteKit static frontend and the JSON API. Runs without Tauri. Configurable bind address and optional auth.
- `frontend-data-layer`: SvelteKit data layer replacing `src/lib/data.ts` mock constants with async `fetch("/api/...")` wrappers; typed response models aligned to server JSON schema.

### Modified Capabilities
- `sveltekit-frontend-scaffold`: SvelteKit build must use `base` path and `paths.relative = false` config so assets resolve correctly when served from the Rust server; API base URL configurable via build-time env var (defaults to `/api`)
- `mailbrus-desktop-crate`: No change required for Tauri — desktop app can either run its own `mailbrus-server` sidecar or use a remote instance; this is out of scope for this change

## Impact

- **New crate**: `mailbrus-server/` at workspace root; added to `Cargo.toml` members
- **New binary**: `mailbrus-server [--bind ADDR:PORT] [--maildir PATH] [--auth user:pass]`
- **Dependencies**: `axum`, `tokio` (full), `tower-http` (static files + CORS), `serde_json`; `mailbrus-core` as path dep
- **Frontend**: `src/lib/data.ts` becomes async fetch helpers; `+page.svelte` loads data on mount; `svelte.config.js` may need `paths` config
- **Nix**: `mailbrus-server` package added to flake outputs; no new git deps expected
- **Security**: When `--bind` includes a non-loopback address, auth flag should be enforced
