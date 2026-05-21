## 1. Rust Crate Scaffold

- [ ] 1.1 Create `mailbrus-server/` directory with `Cargo.toml` declaring binary crate and deps: `axum`, `tokio` (full features), `tower-http` (fs + cors features), `serde`, `serde_json`, `clap` (derive feature)
- [ ] 1.2 Add `mailbrus-core` as path dependency in `mailbrus-server/Cargo.toml`
- [ ] 1.3 Add `mailbrus-server` to root `Cargo.toml` `members` array
- [ ] 1.4 Create `mailbrus-server/src/main.rs` with minimal stub that compiles (`fn main() {}`)
- [ ] 1.5 Verify `cargo build -p mailbrus-server` succeeds with no errors

## 2. CLI Flags and Server Bootstrap

- [ ] 2.1 Define `Cli` struct with `clap::Parser`: `--bind <ADDR:PORT>` (default `127.0.0.1:8080`), `--frontend-dist <PATH>` (default `./build`), `--auth <user:pass>` (optional)
- [ ] 2.2 Parse CLI args in `main`, bind TCP listener on the specified address, print `Listening on http://<addr>` to stdout
- [ ] 2.3 Exit with non-zero code and descriptive stderr message when port is already in use
- [ ] 2.4 Print `WARNING: server is publicly accessible without authentication` to stderr when bind address is non-loopback and `--auth` is not set

## 3. Axum Router Setup

- [ ] 3.1 Create `mailbrus-server/src/routes.rs` with `build_router(frontend_dist: PathBuf) -> Router` function
- [ ] 3.2 Mount API routes under `/api` prefix: `GET /maildirs`, `GET /maildirs/:id/folders`, `GET /maildirs/:id/folders/:folder/messages`, `GET /messages/search`, `GET /messages/:id`
- [ ] 3.3 Mount `tower_http::services::ServeDir` at `/` for `frontend_dist` path, with `ServeFile` fallback to `index.html` for SPA routing
- [ ] 3.4 Add startup warning to stderr when `--frontend-dist` directory does not exist; server starts but returns 404 for non-API routes

## 4. API Route Handlers

- [ ] 4.1 Implement `GET /api/maildirs` handler: call `mailbrus_core` list-maildirs inside `tokio::task::spawn_blocking`, serialize result as JSON array with `id`, `address`, `maildir`, `unread`, `total` fields; return 200
- [ ] 4.2 Implement `GET /api/maildirs/:id/folders` handler: call `mailbrus_core` list-folders inside `spawn_blocking`; return 200 JSON array with `id`, `name`, `unread`, `total`; return 404 JSON error if maildir id unknown
- [ ] 4.3 Implement `GET /api/maildirs/:id/folders/:folder/messages` handler: accept `?page=N&per_page=N` (defaults 1, 25); call `spawn_blocking`; return 200 `{ "messages": [...], "total": N, "page": N, "per_page": N }`
- [ ] 4.4 Implement `GET /api/messages/search` handler: require `?q=QUERY`; return 400 JSON error if missing; call `spawn_blocking` with notmuch query; return same envelope as message list
- [ ] 4.5 Implement `GET /api/messages/:id` handler: call `spawn_blocking`; return 200 JSON object with `id`, `headers` (object), `body` (string), `attachments` (array); return 404 JSON error if id unknown
- [ ] 4.6 Add shared JSON error helper `fn json_error(status: StatusCode, msg: &str) -> Response` used by all 404/400 handlers

## 5. SvelteKit `svelte.config.js` Update

- [ ] 5.1 Set `paths.base = ''` and `paths.relative = false` in `svelte.config.js` adapter config so all asset URLs are root-relative (`/`) and resolve correctly from the Rust server

## 6. SvelteKit API Data Layer

- [ ] 6.1 Create `src/lib/api.ts` exporting typed async fetch functions: `fetchMaildirs()`, `fetchFolders(maildirId)`, `fetchMessages(maildirId, folderId, page?, perPage?)`, `searchMessages(query, page?, perPage?)`, `fetchMessage(id)`
- [ ] 6.2 Implement `fetchMaildirs(): Promise<Account[]>` — `GET /api/maildirs`, throw on non-2xx
- [ ] 6.3 Implement `fetchFolders(maildirId: string): Promise<Folder[]>` — `GET /api/maildirs/:id/folders`, throw on non-2xx
- [ ] 6.4 Implement `fetchMessages(maildirId, folderId, page?, perPage?): Promise<{ messages: Message[], total: number }>` — `GET /api/maildirs/:id/folders/:folder/messages`
- [ ] 6.5 Implement `searchMessages(query, page?, perPage?): Promise<{ messages: Message[], total: number }>` — `GET /api/messages/search?q=...`
- [ ] 6.6 Implement `fetchMessage(id: string): Promise<MessageBody>` where `MessageBody` extends `Message` with `body: string` and `attachments: Attachment[]` — `GET /api/messages/:id`
- [ ] 6.7 Remove hardcoded mock constants from `src/lib/data.ts` (keep type definitions if still imported elsewhere, or delete file entirely if unused)

## 7. Wire API into Page Shell

- [ ] 7.1 Update `AccountPicker` (or `+page.svelte` account loading) to call `fetchMaildirs()` on mount instead of importing mock data
- [ ] 7.2 Update `FolderPicker` (or folder loading) to call `fetchFolders(account.id)` when an account is selected
- [ ] 7.3 Update `MailList` message loading to call `fetchMessages(account.id, folder.id)` instead of using mock messages
- [ ] 7.4 Update `MailList` search to call `searchMessages(query)` when user submits a search query
- [ ] 7.5 Update `Reader` to call `fetchMessage(message.id)` on open instead of displaying mock body
- [ ] 7.6 Add loading indicator in `+page.svelte` shown while any API call is in-flight
- [ ] 7.7 Add error state in `+page.svelte` showing descriptive error message when an API call fails (network error or non-2xx)

## 8. Nix Flake Update

- [ ] 8.1 Add `mailbrus-server` package to `flake.nix` outputs using `naersk` or `crane` (same pattern as existing crates); verify `nix build .#mailbrus-server` produces a binary
