## 1. Host-allowlist middleware (DNS-rebinding defense)

- [x] 1.1 Add `host_guard_middleware` to `mailbrus-server/src/middleware.rs` that reads the request authority (`Host` header, falling back to the HTTP/2 `:authority`) and compares it against an allowlist.
- [x] 1.2 Build the allowlist at startup in `main.rs` from the bound `SocketAddr` port: `127.0.0.1:<port>`, `localhost:<port>`, `[::1]:<port>`, plus the literal `host:port` when the bind is non-loopback. Pass it into the middleware (via a small `Arc<HashSet<String>>` or closure capture).
- [x] 1.3 Return `403 Forbidden` with a short plain-text body when the authority is missing or not on the allowlist; allow otherwise.
- [x] 1.4 Wire the middleware as the **outermost** layer in `main.rs` so it wraps both `nest("/api", …)` and the static service (guard the SPA shell too).
- [x] 1.5 Unit tests: allowed loopback authorities pass; `evil.example.com` and missing-Host are rejected `403`; `GET /` with a bad Host is rejected before `index.html` is served.

## 2. Cross-site rejection for unsafe methods (CSRF residual)

- [x] 2.1 Add `cross_site_guard_middleware` scoped to `/api/*` that, for `POST`/`PATCH`/`DELETE`, rejects `Sec-Fetch-Site: cross-site` and `same-site` with `403`; treats absent / `same-origin` / `none` as allowed.
- [x] 2.2 Ensure safe methods (`GET`, `HEAD`, `OPTIONS`) bypass the `Sec-Fetch-Site` check entirely.
- [x] 2.3 Layer it on the `/api` router (inside the Host guard).
- [x] 2.4 Unit tests: cross-site `POST /api/sync` → `403` and no sync started; same-origin `POST /api/sync` → accepted; cross-site `GET /api/*` → not blocked by this guard.

## 3. Enforced bearer-token auth

- [x] 3.1 Add a constant-time token compare — implemented as a hand-rolled fixed-time byte compare (`ct_eq`) in `middleware.rs`; **no new crate**, so `Cargo.lock`/`cargoHash` are unchanged.
- [x] 3.2 Add `auth_middleware` scoped to `/api/*`: when the configured token is `Some`, require `Authorization: Bearer <token>` matching in constant time, else `401 Unauthorized`; when `None`, pass through.
- [x] 3.3 Thread the `--auth` value into `AppState` (or the middleware) in `main.rs`; keep the existing non-loopback startup warning.
- [x] 3.4 Extend the frontend data layer in `src/` to attach `Authorization: Bearer <token>` to `/api` requests when a token is configured; no header when unset.
- [x] 3.5 Unit tests: missing/incorrect token → `401`; correct token → accepted; no `--auth` → no gate; static assets are not token-gated.

## 4. Spec sync & docs

- [x] 4.1 Update `AGENTS.md` / relevant docs to note the loopback-only security posture and the enforced `--auth` behavior (BREAKING vs. previous no-op).
- [x] 4.2 Confirm the `mailbrus-server-crate` and `api-origin-validation` specs match the implemented behavior (adjust deltas if implementation diverges).

## 5. E2E validation & fixes cycle

- [x] 5.1 Using the `mailbrus-e2e-author` skill, add/adjust E2E coverage asserting the SPA still boots and the API works over the legitimate same-origin loopback path (no regression).
- [x] 5.2 Add an E2E/integration assertion that a request with a foreign `Host` is rejected `403` (rebinding smoke test) and that the auth-enabled server returns `401` without a token.
- [x] 5.3 Run `deno task test:e2e` inside `nix develop`; triage failures, fix, and re-run until green.
- [x] 5.4 Run `cargo test -p mailbrus-server` (and workspace tests) until green.

## 6. Warning-clean build

- [x] 6.1 `cargo build`/`clippy --workspace` clean for this change (0 warnings introduced). Note: 7 pre-existing `redundant_closure` warnings in `mailbrus-core/src/connection_test.rs` are unrelated and left untouched.
- [x] 6.2 N/A — `Cargo.lock` unchanged (constant-time compare is hand-rolled, no new crate), so `cargoHash` needs no update.
