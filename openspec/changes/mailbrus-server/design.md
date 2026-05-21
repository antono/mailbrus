## Context

The `mailbrus-core` library provides all necessary email operations (list maildirs, list folders, list/search/read messages) backed by notmuch. The `mailbrus-cli` crate wraps these as subcommands with JSON output. The SvelteKit frontend (`src/`) is complete but uses hardcoded mock data from `src/lib/data.ts`.

The gap: there is no network-accessible bridge between the Rust backend and the browser. This design introduces `mailbrus-server` — a standalone HTTP binary that:
- Serves the compiled SvelteKit frontend as static files
- Exposes a JSON REST API mirroring the CLI subcommands
- Runs without Tauri, enabling self-hosted remote webmail

Deployment target: a home server or VPS where a user runs `mailbrus-server --bind 0.0.0.0:1371` and accesses their mail from any browser on the LAN or internet.

## Goals / Non-Goals

**Goals:**
- Single binary that serves both the SvelteKit frontend and the JSON API
- All `mailbrus-cli` subcommands available as `GET /api/...` endpoints
- Configurable bind address and maildir path via CLI flags
- Works over plain HTTP on localhost; users responsible for TLS termination (nginx/caddy)
- SvelteKit frontend calls `/api/` (relative) — no hardcoded host; same-origin by default

**Non-Goals:**
- TLS termination — delegate to a reverse proxy
- Multi-user or per-request auth beyond a single `--auth user:pass` basic auth flag
- Real-time push (new mail notifications, WebSocket) — out of scope
- Tauri integration or sidecar management — separate concern
- Write operations beyond send (delete, move, flag) — future change
- IMAP/SMTP proxy — server is a read-mostly API over local Maildir + notmuch

## Decisions

### 1. axum over actix-web

`axum` is chosen because it sits directly on `tokio` + `tower`, composes well with `tower-http` for static file serving and CORS, and has the same async runtime as the rest of the Pimalaya ecosystem. actix-web uses its own actor runtime, which would add a second async executor.

### 2. HTTP/REST + JSON over gRPC or Tauri IPC

The frontend is a SvelteKit app that runs in a browser. Browser-native `fetch()` with JSON requires zero client library. gRPC-web requires a generated client stub and a grpc-web proxy. Tauri IPC requires the Tauri JS SDK and locks the frontend to a Tauri webview context.

REST + JSON also directly reuses the output format already defined in `mailbrus-cli` (`--output json`), reducing the serialization work.

### 3. Static files: embedded in binary vs. served from path

Two sub-options:
- **`include_dir!` / `rust-embed`**: embed the `build/` directory at compile time → single self-contained binary, but requires building frontend before `cargo build`
- **`tower-http ServeDir`**: serve from a runtime path (`--frontend-dist PATH`, defaults to `./build`) → binary and frontend decoupled, easier during development

**Decision: runtime path (`ServeDir`), default `./build`**. This keeps the Rust and SvelteKit build pipelines independent. A Nix derivation can wire the two together at packaging time. A future convenience flag (`--embed`) could be added if a single-binary deployment becomes important.

### 4. Frontend API base URL

The SvelteKit app will be served from the same origin as the API (`http://host:1371/` for frontend, `http://host:1371/api/` for API). Using a relative base path `/api` means no hardcoded host in the frontend build — it works on any bind address without a build-time env var.

SvelteKit's `paths.base` should remain empty; all API calls use `fetch('/api/...')` relative to origin.

### 5. Pagination and query parameters

Endpoints accept `?page=N&per_page=N` matching the CLI `--page`/`--per-page` flags. Defaults: page 1, per_page 25. This keeps the API surface consistent with the CLI and the existing frontend pagination model.

### 6. JSON response envelope

All endpoints return a flat JSON object or array — no `{ data: ..., meta: ... }` envelope. Array endpoints include a `total` field at the top level for pagination:
```json
{ "messages": [...], "total": 142, "page": 1, "per_page": 25 }
```
Single-resource endpoints return the object directly.

### 7. CORS

When `--bind` includes a non-loopback address the server applies a permissive CORS policy (`Access-Control-Allow-Origin: *`) so the frontend served from the same origin doesn't need special treatment and future tooling (e.g. a CLI-controlled browser extension) can call the API. Localhost-only mode skips CORS headers.

## Risks / Trade-offs

- **Port conflict** → `--bind` is configurable; server exits with a clear error if the port is taken
- **Maildir path config** — the server needs to know which notmuch database to open; uses the same notmuch default config path (`~/.notmuch-config`) as the CLI; `--maildir` overrides this
- **Auth weakness** — HTTP basic auth over plain HTTP on a public address is insecure; mitigated by documenting that TLS termination via a reverse proxy is required for remote access and by warning in the startup log when `--bind` is not loopback and `--auth` is not set
- **Frontend/API build coupling** — the SvelteKit build must be present at `--frontend-dist` path; if missing the server starts but returns 404 for all non-API routes; a clear startup warning addresses this
- **`mailbrus-core` is sync** — current `MaildirReader` API is synchronous; axum handlers will wrap calls in `tokio::task::spawn_blocking` to avoid blocking the async executor

## Migration Plan

1. Build `mailbrus-server` binary (`cargo build -p mailbrus-server`)
2. Build SvelteKit frontend (`deno task build`)
3. Run `mailbrus-server --frontend-dist ./build`
4. Frontend at `http://127.0.0.1:1371/` now serves live data

No migration of existing state required — the server is read-only over the existing notmuch database.

## Open Questions

- **Tauri sidecar decision: yes.** `mailbrus-server` SHALL be bundled as a Tauri sidecar in `mailbrus-desktop`. On app launch, Tauri starts the sidecar on `127.0.0.1:1371` (or next free port). The Tauri webview navigates to `http://127.0.0.1:1371/` so the sidecar serves both the SvelteKit frontend and the API — all relative `/api/...` fetch calls resolve correctly with no special Tauri IPC needed. UI status indication is deferred to a follow-up change.
- Should send (`POST /api/messages`) be in scope for the initial implementation, or deferred until smtp-sender integration is complete?
