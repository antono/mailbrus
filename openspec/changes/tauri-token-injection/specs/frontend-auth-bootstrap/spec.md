## ADDED Requirements

### Requirement: SPA gates the app behind a boot-time auth probe

On boot the SPA SHALL probe the API (`GET /api/maildirs`) using any token available from
`window.__MAILBRUS_AUTH_TOKEN__` or stored `localStorage`. Until the probe resolves the app
content SHALL NOT be shown. A `200` response SHALL admit the user to the app. A `401`
response with no usable token SHALL render a blocking auth screen instead of the app. A
non-`401` failure (network error, `5xx`) SHALL be treated as a non-auth condition and fall
through to the normal loading/error path, not the auth screen.

#### Scenario: Valid token admits the user
- **WHEN** the boot probe returns `200`
- **THEN** the app content is rendered and no auth screen is shown

#### Scenario: Missing token forces the auth screen
- **WHEN** the server requires `--auth` and the SPA has no usable token
- **AND** the boot probe returns `401`
- **THEN** a blocking auth screen is shown in place of the app

#### Scenario: Server without auth never shows the screen
- **WHEN** the server was started without `--auth`
- **THEN** the boot probe returns `200` and the auth screen is never shown

### Requirement: User can bootstrap a token through the auth screen

The auth screen SHALL let the user enter a bearer token, validate it by re-probing the API
with it, and on success persist it via the existing token plumbing (`setAuthToken`, which
writes `localStorage`, IndexedDB, and notifies the service worker) and admit the user to
the app. An entered token that the server rejects SHALL keep the auth screen visible and
surface an error.

#### Scenario: Correct token unlocks the app
- **WHEN** the user enters a token that the server accepts
- **THEN** the token is persisted via `setAuthToken`
- **AND** the app content is rendered

#### Scenario: Wrong token is rejected
- **WHEN** the user enters a token the server rejects (`401`)
- **THEN** the auth screen stays visible with an error
- **AND** the app content is not shown

### Requirement: Stale token is recovered mid-session

The SPA SHALL recover from a stale token mid-session. When any `/api/*` request that carried
a token receives `401` (for example after the server restarted with a different token), the
SPA SHALL clear the stored token via `setAuthToken(null)` and return to the auth screen
(browser) so the user can re-bootstrap. Recovery SHALL apply to all `/api/*` callers,
including those that bypass the shared `apiFetch` wrapper.

#### Scenario: Restarted server invalidates the token
- **WHEN** a stored token is present and an `/api/*` request returns `401`
- **THEN** the stored token is cleared
- **AND** the auth screen is shown again
