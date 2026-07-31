## ADDED Requirements

### Requirement: Server rejects requests with an unexpected Host header

`mailbrus-server` SHALL validate the `Host` header of every incoming request —
covering both `/api/*` and the statically-served SPA — against an allowlist of
loopback authorities for the port it is bound to: `127.0.0.1:<port>`,
`localhost:<port>`, and `[::1]:<port>`. Requests whose `Host` (or `:authority`)
is absent from the allowlist SHALL be rejected with `403 Forbidden` before any
handler runs. This is the primary defense against DNS-rebinding attacks (CWE-346)
that would otherwise let a remote origin present itself as same-origin to the
browser.

When `--bind` targets a non-loopback address, the allowlist SHALL also include
the exact host:port the server is bound to, so legitimate remote access still
works.

#### Scenario: Loopback host accepted
- **WHEN** a request arrives with `Host: 127.0.0.1:1371` on a server bound to `127.0.0.1:1371`
- **THEN** the server processes the request normally

#### Scenario: Rebinding host rejected
- **WHEN** a request arrives with `Host: evil.example.com` (a DNS-rebinding attempt)
- **THEN** the server responds `403 Forbidden` and no handler executes

#### Scenario: SPA shell is also guarded
- **WHEN** a `GET /` request arrives with a `Host` not on the allowlist
- **THEN** the server responds `403 Forbidden` rather than serving `index.html`

### Requirement: Server rejects cross-site state-changing requests

For unsafe HTTP methods (`POST`, `PATCH`, `DELETE`) on `/api/*`, the server SHALL
require the `Sec-Fetch-Site` header to be absent, `same-origin`, or `none`.
Requests carrying `Sec-Fetch-Site: cross-site` (or `same-site`) SHALL be rejected
with `403 Forbidden`. This closes the residual CSRF vector on no-body endpoints
(e.g. `POST /api/sync`) that browsers send as CORS-"simple" requests without a
preflight.

#### Scenario: Cross-site sync trigger rejected
- **WHEN** a browser sends `POST /api/sync` with `Sec-Fetch-Site: cross-site`
- **THEN** the server responds `403 Forbidden` and does not start a sync

#### Scenario: Same-origin request allowed
- **WHEN** the SPA sends `POST /api/sync` with `Sec-Fetch-Site: same-origin`
- **THEN** the server processes the request normally

#### Scenario: Safe GET is unaffected
- **WHEN** any `GET /api/*` request arrives with `Sec-Fetch-Site: cross-site`
- **THEN** the `Sec-Fetch-Site` check does not reject it (Host-allowlist still applies)

### Requirement: Server enforces a bearer token when --auth is set

When the server is started with `--auth <token>`, every `/api/*` request SHALL
carry an `Authorization: Bearer <token>` header whose value matches `<token>`
exactly; otherwise the server SHALL respond `401 Unauthorized`. Token comparison
SHALL be constant-time. When `--auth` is not set, no token is required (the
default loopback-only posture). The frontend data layer SHALL attach the token to
its API requests when the app is configured with one.

#### Scenario: Missing token rejected when auth enabled
- **WHEN** the server runs with `--auth s3cret` and a request to `/api/maildirs` omits the `Authorization` header
- **THEN** the server responds `401 Unauthorized`

#### Scenario: Valid token accepted
- **WHEN** the server runs with `--auth s3cret` and a request carries `Authorization: Bearer s3cret`
- **THEN** the server processes the request normally

#### Scenario: No auth flag means no token gate
- **WHEN** the server runs without `--auth` and a request to `/api/maildirs` omits `Authorization`
- **THEN** the server processes the request normally (Host-allowlist still applies)
