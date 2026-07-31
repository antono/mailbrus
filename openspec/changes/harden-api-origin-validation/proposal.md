## Why

`mailbrus-server` binds `127.0.0.1:1371` and is loaded by the Tauri webview, but
it performs **no origin validation**: no `Host` check, no `Origin`/`Sec-Fetch`
check, and no enforced authentication. This is CWE-346 (Origin Validation
Error): a website the user visits in their normal browser can reach the local
API via **DNS rebinding**, bypassing the Same-Origin Policy to read all mail and
account data and to issue state-changing requests. The `--auth` flag exists but
is dead code — it is only referenced in a startup warning and never wired into
the request path — so it gives a false sense of protection.

## What Changes

- Add a **`Host`-header allowlist middleware** as the outermost layer of the
  server, guarding both `/api/*` and the static SPA. Requests whose `Host` is
  not an expected loopback authority (`127.0.0.1:<port>`, `localhost:<port>`,
  `[::1]:<port>`) are rejected `403`. This is the primary DNS-rebinding defense.
- Reject **cross-site state-changing requests**: for unsafe methods
  (POST/PATCH/DELETE), require `Sec-Fetch-Site` to be absent or
  `same-origin`/`none`, closing the residual CSRF gap on no-body endpoints
  (`POST /api/sync`, `POST /api/sync/{account}`) that browsers send as
  CORS-"simple" requests.
- **Enforce `--auth`**: when set, require a matching `Authorization: Bearer
  <token>` on `/api/*` and return `401` otherwise. The frontend attaches the
  token. **BREAKING** for anyone who passed `--auth` expecting silent
  no-op behavior (previously it did nothing).
- Keep the non-loopback startup warning, but tie it to the now-real enforcement.

## Capabilities

### New Capabilities
- `api-origin-validation`: server-side request-origin authorization for the HTTP
  API — `Host` allowlist, cross-site rejection for unsafe methods, and the
  bearer-token gate. Covers CWE-346 and the CSRF residual.

### Modified Capabilities
- `mailbrus-server-crate`: the existing "Startup warning when binding
  non-loopback without auth" requirement changes from warn-only to backing a
  real, enforced `--auth` gate.

## Impact

- **Code**: `mailbrus-server/src/middleware.rs` (new middleware),
  `mailbrus-server/src/main.rs` (layer wiring + outermost placement),
  `mailbrus-server/src/cli.rs` (auth semantics), frontend data layer
  (`src/`) to send the bearer token when configured.
- **APIs**: all `/api/*` routes gain rejection paths (`401`/`403`); success
  paths unchanged for legitimate same-origin/loopback callers.
- **Tests**: new E2E/integration coverage for allowed/blocked `Host`, cross-site
  rejection, and auth gate. No dependency changes (Axum/tower_http already present).

## Non-goals

- No TLS/HTTPS for the local server (out of scope; loopback-only by default).
- No per-account authorization or multi-user model — a single shared token.
- No CORS `Access-Control-Allow-Origin` support; the API stays same-origin only
  (adding permissive CORS would reintroduce the very risk being closed).
- No change to the notmuch index, sync engine, or mail-handling logic.
